/**
 * calenDHD Web Push Notification Service
 *
 * This service handles sending Web Push notifications.
 * It's called by PocketBase hooks when reminders are due.
 *
 * Run with: npm start
 * Requires: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_EMAIL in environment
 */

import http from 'http';
import webpush from 'web-push';

// Configuration from environment variables
const PORT = process.env.PUSH_SERVICE_PORT || 3001;
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || 'YOUR_VAPID_PUBLIC_KEY_HERE';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || 'YOUR_VAPID_PRIVATE_KEY_HERE';
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:your@email.com';

// Configure web-push with VAPID keys
if (VAPID_PUBLIC_KEY !== 'YOUR_VAPID_PUBLIC_KEY_HERE') {
    webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Parse JSON body from request
function parseBody(req) {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk);
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                reject(e);
            }
        });
        req.on('error', reject);
    });
}

// Send a push notification
async function sendPushNotification(subscription, payload) {
    if (VAPID_PUBLIC_KEY === 'YOUR_VAPID_PUBLIC_KEY_HERE') {
        throw new Error('VAPID keys not configured');
    }

    const pushSubscription = {
        endpoint: subscription.endpoint,
        keys: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth
        }
    };

    await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
}

// HTTP server
const server = http.createServer(async (req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    try {
        // GET /vapid-public-key - Return the VAPID public key
        if (req.method === 'GET' && req.url === '/vapid-public-key') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                publicKey: VAPID_PUBLIC_KEY !== 'YOUR_VAPID_PUBLIC_KEY_HERE' ? VAPID_PUBLIC_KEY : null
            }));
            return;
        }

        // POST /send - Send a push notification
        if (req.method === 'POST' && req.url === '/send') {
            const body = await parseBody(req);

            if (!body.subscription || !body.payload) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing subscription or payload' }));
                return;
            }

            await sendPushNotification(body.subscription, body.payload);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
        }

        // POST /send-batch - Send push notifications to multiple subscriptions
        if (req.method === 'POST' && req.url === '/send-batch') {
            const body = await parseBody(req);

            if (!Array.isArray(body.notifications)) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing notifications array' }));
                return;
            }

            const results = await Promise.allSettled(
                body.notifications.map(n => sendPushNotification(n.subscription, n.payload))
            );

            const summary = {
                total: results.length,
                success: results.filter(r => r.status === 'fulfilled').length,
                failed: results.filter(r => r.status === 'rejected').length
            };

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, summary }));
            return;
        }

        // Health check
        if (req.method === 'GET' && req.url === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status: 'ok',
                vapidConfigured: VAPID_PUBLIC_KEY !== 'YOUR_VAPID_PUBLIC_KEY_HERE'
            }));
            return;
        }

        // 404 for unknown routes
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Not found' }));

    } catch (error) {
        console.error('Error handling request:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
    }
});

server.listen(PORT, () => {
    console.log(`calenDHD Push Service running on port ${PORT}`);
    console.log(`VAPID configured: ${VAPID_PUBLIC_KEY !== 'YOUR_VAPID_PUBLIC_KEY_HERE'}`);
});
