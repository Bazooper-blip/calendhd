/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

// This service worker exists ONLY for Web Push. Offline asset caching was
// removed — the app runs against an always-online PocketBase server, so there
// is no fetch/install/activate caching and no background-sync handler.

// ── Push notification handling ──────────────────────────────────────
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

// ── Notification click handling ─────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	if (event.action === 'dismiss') return;

	const eventId = event.notification.data?.eventId;
	const url = eventId ? `/event/${eventId}` : '/';

	event.waitUntil(
		self.clients
			.matchAll({ type: 'window', includeUncontrolled: true })
			.then((clients) => {
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

// ── Listen for messages from the main app ───────────────────────────
self.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}
});
