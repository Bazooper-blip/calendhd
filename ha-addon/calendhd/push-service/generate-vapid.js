/**
 * Generate VAPID keys for Web Push notifications
 *
 * Run with: npm run generate-vapid
 *
 * Copy the output to your .env file
 */

import webpush from 'web-push';

const vapidKeys = webpush.generateVAPIDKeys();

console.log('Generated VAPID Keys:');
console.log('');
console.log('Add these to your .env file:');
console.log('');
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log('');
console.log('IMPORTANT: Keep your private key secret!');
