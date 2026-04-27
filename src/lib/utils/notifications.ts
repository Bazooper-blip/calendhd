import { browser } from '$app/environment';
import { getPocketBase, getCurrentUser, updateUserSettings, getUserSettings } from '$api/pocketbase';

// Check if notifications are supported
export function isNotificationSupported(): boolean {
	if (!browser) return false;
	return 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

// Check current permission status
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
	if (!isNotificationSupported()) return 'unsupported';
	return Notification.permission;
}

// Request notification permission
export async function requestNotificationPermission(): Promise<NotificationPermission> {
	if (!isNotificationSupported()) {
		throw new Error('Notifications are not supported on this device');
	}

	const permission = await Notification.requestPermission();
	return permission;
}

// Subscribe to push notifications
export async function subscribeToPush(vapidPublicKey: string): Promise<PushSubscription | null> {
	if (!isNotificationSupported()) {
		throw new Error('Push notifications are not supported');
	}

	const registration = await navigator.serviceWorker.ready;

	// Check existing subscription
	let subscription = await registration.pushManager.getSubscription();

	if (subscription) {
		return subscription;
	}

	// Subscribe with VAPID key
	try {
		subscription = await registration.pushManager.subscribe({
			userVisibleOnly: true,
			applicationServerKey: vapidPublicKey
		});

		return subscription;
	} catch (error) {
		console.error('Failed to subscribe to push:', error);
		throw error;
	}
}

// Unsubscribe from push notifications
export async function unsubscribeFromPush(): Promise<boolean> {
	if (!isNotificationSupported()) return false;

	const registration = await navigator.serviceWorker.ready;
	const subscription = await registration.pushManager.getSubscription();

	if (subscription) {
		return await subscription.unsubscribe();
	}

	return true;
}

// Save push subscription to server
export async function savePushSubscription(subscription: PushSubscription): Promise<void> {
	const user = getCurrentUser();
	if (!user) throw new Error('Not authenticated');

	const json = subscription.toJSON();
	const settings = await getUserSettings();
	await updateUserSettings({
		push_subscription: {
			endpoint: json.endpoint || '',
			keys: {
				p256dh: json.keys?.p256dh || '',
				auth: json.keys?.auth || ''
			}
		}
	}, settings?.id);
}

// Remove push subscription from server
export async function removePushSubscription(): Promise<void> {
	const user = getCurrentUser();
	if (!user) throw new Error('Not authenticated');

	const settings = await getUserSettings();
	if (settings) {
		await updateUserSettings({
			push_subscription: undefined
		}, settings.id);
	}
}

// Check if user has an active push subscription
export async function hasPushSubscription(): Promise<boolean> {
	if (!isNotificationSupported()) return false;

	const registration = await navigator.serviceWorker.ready;
	const subscription = await registration.pushManager.getSubscription();

	return !!subscription;
}

// Send a test notification (local, not push)
export async function sendTestNotification(): Promise<void> {
	if (!isNotificationSupported()) {
		throw new Error('Notifications are not supported');
	}

	if (Notification.permission !== 'granted') {
		throw new Error('Notification permission not granted');
	}

	const registration = await navigator.serviceWorker.ready;
	await registration.showNotification('calenDHD Test', {
		body: 'Notifications are working!',
		icon: '/icons/icon-192.png',
		badge: '/icons/badge-72.png',
		tag: 'test-notification'
	});
}
