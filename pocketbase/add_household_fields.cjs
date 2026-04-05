/**
 * Add household sharing fields to existing collections
 */

const http = require('http');

const BASE_URL = 'http://127.0.0.1:8090';
const EMAIL = 'sammyvaltonen@protonmail.com';
const PASSWORD = 'sammysammy123';

const HOUSEHOLDS_ID = 'pbc_2123300356';
const CATEGORIES_ID = 'pbc_3292755704';
const EVENTS_ID = 'pbc_1687431684';
const TEMPLATES_ID = 'pbc_184785686';

function request(method, path, data, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': token } : {})
      }
    };

    const req = http.request(options, (res) => {
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
  // Authenticate
  console.log('Authenticating...');
  const authRes = await request('POST', '/api/collections/_superusers/auth-with-password', {
    identity: EMAIL,
    password: PASSWORD
  });

  if (authRes.status !== 200) {
    console.error('Auth failed:', authRes.data);
    return;
  }

  const token = authRes.data.token;
  console.log('Authenticated!');

  // Collections to update with household fields
  const collections = [
    { id: CATEGORIES_ID, name: 'categories' },
    { id: EVENTS_ID, name: 'events' },
    { id: TEMPLATES_ID, name: 'templates' }
  ];

  for (const col of collections) {
    console.log(`\nUpdating ${col.name}...`);

    // Get current collection
    const getRes = await request('GET', `/api/collections/${col.id}`, null, token);
    if (getRes.status !== 200) {
      console.error(`  Failed to get ${col.name}:`, getRes.data);
      continue;
    }

    const collection = getRes.data;

    // Check if fields already exist
    const hasHousehold = collection.fields.some(f => f.name === 'household');
    const hasPrivate = collection.fields.some(f => f.name === 'is_private');

    if (hasHousehold && hasPrivate) {
      console.log(`  Fields already exist, skipping...`);
      continue;
    }

    // Add new fields
    const newFields = [...collection.fields];

    if (!hasHousehold) {
      newFields.push({
        id: 'rel_household',
        name: 'household',
        type: 'relation',
        collectionId: HOUSEHOLDS_ID,
        maxSelect: 1,
        required: false
      });
    }

    if (!hasPrivate) {
      newFields.push({
        id: 'bool_private',
        name: 'is_private',
        type: 'bool',
        required: false
      });
    }

    // Update with new sharing rules
    const shareRule = `@request.auth.id = user || (household.owner = @request.auth.id && is_private != true) || (household.members ~ @request.auth.id && is_private != true)`;

    const updateRes = await request('PATCH', `/api/collections/${col.id}`, {
      fields: newFields,
      listRule: shareRule,
      viewRule: shareRule,
      createRule: '@request.auth.id != ""',
      updateRule: '@request.auth.id = user',
      deleteRule: '@request.auth.id = user'
    }, token);

    if (updateRes.status === 200) {
      console.log(`  ✓ Updated ${col.name} with household sharing`);
    } else {
      console.error(`  ✗ Failed to update ${col.name}:`, updateRes.data);
    }
  }

  console.log('\nDone!');
}

main().catch(console.error);
