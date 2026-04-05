import { browser } from '$app/environment';
import {
	getPocketBase,
	getEvents,
	createEvent,
	updateEvent,
	deleteEvent,
	getCategories,
	createCategory,
	updateCategory,
	deleteCategory
} from '$api/pocketbase';
import {
	db,
	getPendingEvents,
	getPendingCategories,
	markEventSynced,
	markCategorySynced,
	getLocalEventById,
	setSyncMeta,
	getSyncMeta
} from '$db';
import type { CalendarEvent, Category, LocalEvent, LocalCategory } from '$types';

// Sync status
let isSyncing = false;
let lastSyncTime: Date | null = null;

// Check if online
export function isOnline(): boolean {
	return browser ? navigator.onLine : true;
}

// Get sync status
export function getSyncStatus() {
	return {
		isSyncing,
		lastSyncTime,
		isOnline: isOnline()
	};
}

// Main sync function
export async function sync(userId: string): Promise<void> {
	if (!browser || !isOnline() || isSyncing) {
		return;
	}

	isSyncing = true;

	try {
		// Sync in order: push local changes, then pull remote changes
		await pushLocalChanges(userId);
		await pullRemoteChanges(userId);

		lastSyncTime = new Date();

		// Update sync metadata
		await setSyncMeta({
			id: 'last_sync',
			collection: 'all',
			last_synced: lastSyncTime.toISOString()
		});
	} catch (error) {
		console.error('Sync failed:', error);
		throw error;
	} finally {
		isSyncing = false;
	}
}

// Push local changes to server
async function pushLocalChanges(userId: string): Promise<void> {
	// Push pending events
	const pendingEvents = await getPendingEvents(userId);
	for (const event of pendingEvents) {
		await pushEvent(event);
	}

	// Push pending categories
	const pendingCategories = await getPendingCategories(userId);
	for (const category of pendingCategories) {
		await pushCategory(category);
	}
}

// Push a single event
async function pushEvent(localEvent: LocalEvent): Promise<void> {
	try {
		if (localEvent.id) {
			// Update existing
			await updateEvent(localEvent.id, {
				title: localEvent.title,
				description: localEvent.description,
				start_time: localEvent.start_time,
				end_time: localEvent.end_time,
				is_all_day: localEvent.is_all_day,
				category: localEvent.category,
				template: localEvent.template,
				color_override: localEvent.color_override,
				reminders: localEvent.reminders,
				recurrence_rule: localEvent.recurrence_rule
			});
			await markEventSynced(localEvent.local_id, localEvent.id);
		} else {
			// Create new
			const serverEvent = await createEvent({
				title: localEvent.title,
				description: localEvent.description,
				start_time: localEvent.start_time,
				end_time: localEvent.end_time,
				is_all_day: localEvent.is_all_day,
				category: localEvent.category,
				template: localEvent.template,
				color_override: localEvent.color_override,
				reminders: localEvent.reminders,
				recurrence_rule: localEvent.recurrence_rule,
				local_id: localEvent.local_id
			});
			await markEventSynced(localEvent.local_id, serverEvent.id);
		}
	} catch (error) {
		console.error('Failed to push event:', localEvent.local_id, error);
		// Keep as pending for retry
	}
}

// Push a single category
async function pushCategory(localCategory: LocalCategory): Promise<void> {
	try {
		if (localCategory.id) {
			// Update existing
			await updateCategory(localCategory.id, {
				name: localCategory.name,
				color: localCategory.color,
				icon: localCategory.icon,
				sort_order: localCategory.sort_order
			});
			await markCategorySynced(localCategory.local_id, localCategory.id);
		} else {
			// Create new
			const serverCategory = await createCategory({
				name: localCategory.name,
				color: localCategory.color,
				icon: localCategory.icon,
				sort_order: localCategory.sort_order
			});
			await markCategorySynced(localCategory.local_id, serverCategory.id);
		}
	} catch (error) {
		console.error('Failed to push category:', localCategory.local_id, error);
	}
}

// Pull remote changes
async function pullRemoteChanges(userId: string): Promise<void> {
	// Get last sync time
	const syncMeta = await getSyncMeta('events');
	const lastSync = syncMeta?.last_synced ? new Date(syncMeta.last_synced) : new Date(0);

	// Pull events changed since last sync
	// In a production app, you'd use PocketBase's filter to get only changed records
	// For now, we'll just refresh all data
	const now = new Date();
	const rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
	const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 2, 0);

	try {
		const serverEvents = await getEvents(rangeStart, rangeEnd);

		// Update local database
		for (const event of serverEvents) {
			const localEvent = await getLocalEventById(event.id);
			if (!localEvent) {
				// New event from server
				await db.events.add({
					...event,
					local_id: event.local_id || `server_${event.id}`,
					sync_status: 'synced'
				});
			} else if (localEvent.sync_status === 'synced') {
				// Update synced event
				await db.events.update(localEvent.local_id, {
					...event,
					sync_status: 'synced'
				});
			}
			// Skip events with pending local changes (conflict resolution would go here)
		}

		// Update sync metadata
		await setSyncMeta({
			id: 'events',
			collection: 'events',
			last_synced: now.toISOString()
		});
	} catch (error) {
		console.error('Failed to pull events:', error);
	}
}

// Schedule periodic sync
let syncInterval: ReturnType<typeof setInterval> | null = null;

export function startPeriodicSync(userId: string, intervalMs: number = 60000): void {
	if (!browser) return;

	stopPeriodicSync();

	// Initial sync
	sync(userId);

	// Periodic sync
	syncInterval = setInterval(() => {
		sync(userId);
	}, intervalMs);

	// Sync on online event
	window.addEventListener('online', () => sync(userId));
}

export function stopPeriodicSync(): void {
	if (syncInterval) {
		clearInterval(syncInterval);
		syncInterval = null;
	}
}

// Force immediate sync
export async function forceSync(userId: string): Promise<void> {
	await sync(userId);
}
