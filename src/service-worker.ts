/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

import { build, files, version } from '$service-worker';

const CACHE_NAME = `calendhd-${version}`;

// All app assets: build artifacts + static files
const ASSETS = [...build, ...files];

// ── Install: precache all build assets ──────────────────────────────
self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
	);
});

// ── Activate: clean up old caches ───────────────────────────────────
self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then((keys) =>
			Promise.all(
				keys
					.filter((key) => key !== CACHE_NAME)
					.map((key) => caches.delete(key))
			)
		)
	);
});

// ── Fetch: cache-first for assets, network-first for API/navigation ─
self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);

	// Skip non-GET and cross-origin requests
	if (event.request.method !== 'GET') return;
	if (url.origin !== self.location.origin) return;

	// Network-first for API calls (always want fresh data)
	if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/_/')) {
		event.respondWith(networkFirst(event.request));
		return;
	}

	// Cache-first for precached build assets and static files
	if (ASSETS.includes(url.pathname)) {
		event.respondWith(cacheFirst(event.request));
		return;
	}

	// Network-first for navigation and everything else
	event.respondWith(networkFirst(event.request));
});

async function cacheFirst(request: Request): Promise<Response> {
	const cached = await caches.match(request);
	if (cached) return cached;

	const response = await fetch(request);
	if (response.ok) {
		const cache = await caches.open(CACHE_NAME);
		cache.put(request, response.clone());
	}
	return response;
}

async function networkFirst(request: Request): Promise<Response> {
	try {
		const response = await fetch(request);
		if (response.ok) {
			const cache = await caches.open(CACHE_NAME);
			cache.put(request, response.clone());
		}
		return response;
	} catch {
		const cached = await caches.match(request);
		return cached || new Response('Offline', { status: 503 });
	}
}

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

// ── Background sync for offline changes ─────────────────────────────
self.addEventListener('sync', (event) => {
	if (event.tag === 'calendhd-sync') {
		event.waitUntil(
			self.clients.matchAll().then((clients) => {
				clients.forEach((client) => {
					client.postMessage({ type: 'SYNC_REQUESTED' });
				});
			})
		);
	}
});

// ── Listen for messages from the main app ───────────────────────────
self.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}
});
