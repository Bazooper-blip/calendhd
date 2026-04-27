/**
 * PocketBase Collection Import Script
 *
 * Usage:
 *   node import.cjs <admin_email> <admin_password> [pocketbase_url]
 *
 * Example:
 *   node import.cjs admin@example.com mypassword http://localhost:8090
 */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const [,, email, password, baseUrl = 'http://127.0.0.1:8090'] = process.argv;

if (!email || !password) {
  console.error('Usage: node import.cjs <admin_email> <admin_password> [pocketbase_url]');
  process.exit(1);
}

const url = new URL(baseUrl);
const httpModule = url.protocol === 'https:' ? https : http;

function request(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': token } : {})
      }
    };

    const req = httpModule.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function main() {
  console.log(`Connecting to PocketBase at ${baseUrl}...`);

  // 1. Authenticate as superuser
  console.log('Authenticating...');
  const authRes = await request('POST', '/api/collections/_superusers/auth-with-password', {
    identity: email,
    password: password
  });

  if (authRes.status !== 200) {
    console.error('Authentication failed:', authRes.data);
    process.exit(1);
  }

  const token = authRes.data.token;
  console.log('Authenticated successfully!');

  // 2. Load export file
  const exportPath = path.join(__dirname, 'pb_export.json');
  if (!fs.existsSync(exportPath)) {
    console.error('Export file not found:', exportPath);
    process.exit(1);
  }

  const collections = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  console.log(`Found ${collections.length} collections to import`);

  // 3. Get existing collections
  const existingRes = await request('GET', '/api/collections', null, token);
  const existingNames = new Set(existingRes.data.items.map(c => c.name));

  // 4. Import collections (skip users as it's a system collection)
  const toImport = collections.filter(c => c.name !== 'users');

  // Sort by dependencies (collections without relations first)
  const hasUserRelationOnly = (c) => c.fields.every(f =>
    f.type !== 'relation' || f.collectionId === '_pb_users_auth_'
  );

  toImport.sort((a, b) => {
    const aSimple = hasUserRelationOnly(a);
    const bSimple = hasUserRelationOnly(b);
    if (aSimple && !bSimple) return -1;
    if (!aSimple && bSimple) return 1;
    return 0;
  });

  // Map old IDs to new IDs
  const idMap = { '_pb_users_auth_': '_pb_users_auth_' };

  for (const collection of toImport) {
    if (existingNames.has(collection.name)) {
      console.log(`  Skipping ${collection.name} (already exists)`);
      // Get existing ID for mapping
      const existing = existingRes.data.items.find(c => c.name === collection.name);
      if (existing) idMap[collection.id] = existing.id;
      continue;
    }

    // Update relation collectionIds to use mapped IDs
    const fields = collection.fields
      .filter(f => !f.system) // Skip system fields like 'id'
      .map(f => {
        if (f.type === 'relation' && f.collectionId) {
          return { ...f, collectionId: idMap[f.collectionId] || f.collectionId };
        }
        return f;
      });

    const payload = {
      name: collection.name,
      type: collection.type,
      fields: fields,
      listRule: collection.listRule,
      viewRule: collection.viewRule,
      createRule: collection.createRule,
      updateRule: collection.updateRule,
      deleteRule: collection.deleteRule
    };

    console.log(`  Creating ${collection.name}...`);
    const res = await request('POST', '/api/collections', payload, token);

    if (res.status === 200) {
      console.log(`    ✓ Created ${collection.name}`);
      idMap[collection.id] = res.data.id;
    } else {
      console.error(`    ✗ Failed to create ${collection.name}:`, res.data);
    }
  }

  console.log('\nImport complete!');
}

main().catch(console.error);
