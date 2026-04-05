/// <reference lib="webworker" />

import { precacheAndRoute } from 'workbox-precaching';
import { registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';

declare const self: ServiceWorkerGlobalScope;

// Precache all assets injected by the build
precacheAndRoute(self.__WB_MANIFEST);

// Cache-first for static assets (icons, fonts)
registerRoute(
	({ url }) => url.pathname.startsWith('/icons/') || url.pathname.startsWith('/fonts/'),
	new CacheFirst({
		cacheName: 'static-assets',
		plugins: [
			new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 30 * 24 * 60 * 60 }),
			new CacheableResponsePlugin({ statuses: [0, 200] })
		]
	})
);

// Network-first for API calls
registerRoute(
	({ url }) => url.pathname.startsWith('/api/'),
	new NetworkFirst({
		cacheName: 'api-cache',
		plugins: [
			new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 }),
			new CacheableResponsePlugin({ statuses: [0, 200] })
		]
	})
);

// Stale-while-revalidate for app bundles and other navigations
registerRoute(
	({ url }) => url.pathname.startsWith('/_app/'),
	new StaleWhileRevalidate({
		cacheName: 'app-cache',
		plugins: [
			new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 24 * 60 * 60 }),
			new CacheableResponsePlugin({ statuses: [0, 200] })
		]
	})
);

// Push notification handling
self.addEventListener('push', (event) => {
	if (!event.data) return;

	const data = event.data.json();

	const options: NotificationOptions = {
		body: data.body || 'You have a reminder',
		icon: '/icons/icon-192.png',
		badge: '/icons/badge-72.png',
		tag: data.tag || 'calendhd-reminder',
		data: data.data || {},
		actions: [
			{ action: 'view', title: 'View Event' },
			{ action: 'dismiss', title: 'Dismiss' }
		],
		vibrate: [200, 100, 200]
	};

	event.waitUntil(
		self.registration.showNotification(data.title || 'calenDHD Reminder', options)
	);
});

// Notification click handling
self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	if (event.action === 'dismiss') return;

	const eventId = event.notification.data?.eventId;
	const url = eventId ? `/event/${eventId}` : '/';

	event.waitUntil(
		self.clients
			.matchAll({ type: 'window', includeUncontrolled: true })
			.then((clients) => {
				// Focus existing window or open new one
				const existingClient = clients.find((client) => 'focus' in client);
				if (existingClient) {
					existingClient.focus();
					existingClient.navigate(url);
				} else {
					self.clients.openWindow(url);
				}
			})
	);
});

// Background sync for offline changes
self.addEventListener('sync', (event) => {
	if (event.tag === 'calendhd-sync') {
		event.waitUntil(
			// Notify clients to sync
			self.clients.matchAll().then((clients) => {
				clients.forEach((client) => {
					client.postMessage({ type: 'SYNC_REQUESTED' });
				});
			})
		);
	}
});

// Listen for messages from the main app
self.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}
});
