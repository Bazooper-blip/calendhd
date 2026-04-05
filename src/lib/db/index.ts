import Dexie, { type EntityTable } from 'dexie';
import type {
	LocalEvent,
	LocalCategory,
	LocalTemplate,
	SyncMeta,
	CalendarSubscription,
	ExternalEvent,
	UserSettings
} from '$types';

// Database schema
class CalendHDDatabase extends Dexie {
	events!: EntityTable<LocalEvent, 'local_id'>;
	categories!: EntityTable<LocalCategory, 'local_id'>;
	templates!: EntityTable<LocalTemplate, 'local_id'>;
	subscriptions!: EntityTable<CalendarSubscription, 'id'>;
	external_events!: EntityTable<ExternalEvent, 'id'>;
	settings!: EntityTable<UserSettings, 'id'>;
	sync_meta!: EntityTable<SyncMeta, 'id'>;

	constructor() {
		super('CalendHD');

		this.version(1).stores({
			events: 'local_id, id, user, start_time, end_time, category, template, sync_status, [user+start_time]',
			categories: 'local_id, id, user, sort_order, sync_status',
			templates: 'local_id, id, user, name, category, sync_status',
			subscriptions: 'id, user, name, is_active',
			external_events: 'id, user, subscription, uid, start_time, [user+start_time]',
			settings: 'id, user',
			sync_meta: 'id, collection, last_synced'
		});
	}
}

// Singleton database instance
export const db = new CalendHDDatabase();

// Generate local IDs
export function generateLocalId(): string {
	return `local_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

// Event helpers
export async function getLocalEvents(
	userId: string,
	startDate: Date,
	endDate: Date
): Promise<LocalEvent[]> {
	return db.events
		.where('[user+start_time]')
		.between([userId, startDate.toISOString()], [userId, endDate.toISOString()], true, true)
		.toArray();
}

export async function getLocalEvent(localId: string): Promise<LocalEvent | undefined> {
	return db.events.get(localId);
}

export async function createLocalEvent(event: Omit<LocalEvent, 'local_id' | 'sync_status'>): Promise<LocalEvent> {
	const localEvent: LocalEvent = {
		...event,
		local_id: generateLocalId(),
		sync_status: 'pending'
	};
	await db.events.add(localEvent);
	return localEvent;
}

export async function updateLocalEvent(
	localId: string,
	changes: Partial<LocalEvent>
): Promise<void> {
	await db.events.update(localId, {
		...changes,
		sync_status: 'pending'
	});
}

export async function deleteLocalEvent(localId: string): Promise<void> {
	await db.events.delete(localId);
}

export async function getPendingEvents(userId: string): Promise<LocalEvent[]> {
	return db.events.where({ user: userId, sync_status: 'pending' }).toArray();
}

export async function markEventSynced(localId: string, serverId: string): Promise<void> {
	await db.events.update(localId, {
		id: serverId,
		sync_status: 'synced',
		last_synced: new Date().toISOString()
	});
}

// Category helpers
export async function getLocalCategories(userId: string): Promise<LocalCategory[]> {
	return db.categories.where('user').equals(userId).sortBy('sort_order');
}

export async function createLocalCategory(
	category: Omit<LocalCategory, 'local_id' | 'sync_status'>
): Promise<LocalCategory> {
	const localCategory: LocalCategory = {
		...category,
		local_id: generateLocalId(),
		sync_status: 'pending'
	};
	await db.categories.add(localCategory);
	return localCategory;
}

export async function updateLocalCategory(
	localId: string,
	changes: Partial<LocalCategory>
): Promise<void> {
	await db.categories.update(localId, {
		...changes,
		sync_status: 'pending'
	});
}

export async function deleteLocalCategory(localId: string): Promise<void> {
	await db.categories.delete(localId);
}

export async function getPendingCategories(userId: string): Promise<LocalCategory[]> {
	return db.categories.where({ user: userId, sync_status: 'pending' }).toArray();
}

export async function markCategorySynced(localId: string, serverId: string): Promise<void> {
	await db.categories.update(localId, {
		id: serverId,
		sync_status: 'synced'
	});
}

// Template helpers
export async function getLocalTemplates(userId: string): Promise<LocalTemplate[]> {
	return db.templates.where('user').equals(userId).sortBy('name');
}

export async function createLocalTemplate(
	template: Omit<LocalTemplate, 'local_id' | 'sync_status'>
): Promise<LocalTemplate> {
	const localTemplate: LocalTemplate = {
		...template,
		local_id: generateLocalId(),
		sync_status: 'pending'
	};
	await db.templates.add(localTemplate);
	return localTemplate;
}

export async function updateLocalTemplate(
	localId: string,
	changes: Partial<LocalTemplate>
): Promise<void> {
	await db.templates.update(localId, {
		...changes,
		sync_status: 'pending'
	});
}

export async function deleteLocalTemplate(localId: string): Promise<void> {
	await db.templates.delete(localId);
}

// External events (read-only, from server)
export async function setExternalEvents(events: ExternalEvent[]): Promise<void> {
	await db.external_events.bulkPut(events);
}

export async function getLocalExternalEvents(
	userId: string,
	startDate: Date,
	endDate: Date
): Promise<ExternalEvent[]> {
	return db.external_events
		.where('[user+start_time]')
		.between([userId, startDate.toISOString()], [userId, endDate.toISOString()], true, true)
		.toArray();
}

// Settings
export async function getLocalSettings(userId: string): Promise<UserSettings | undefined> {
	return db.settings.where('user').equals(userId).first();
}

export async function setLocalSettings(settings: UserSettings): Promise<void> {
	await db.settings.put(settings);
}

// Sync metadata
export async function getSyncMeta(collection: string): Promise<SyncMeta | undefined> {
	return db.sync_meta.where('collection').equals(collection).first();
}

export async function setSyncMeta(meta: SyncMeta): Promise<void> {
	await db.sync_meta.put(meta);
}

