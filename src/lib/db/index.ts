import Dexie, { type EntityTable } from 'dexie';
import type {
	LocalEvent,
	LocalCategory,
	LocalTemplate,
	LocalRoutineTemplate,
	CalendarSubscription,
	ExternalEvent,
	ExternalEventReminder,
	UserSettings
} from '$types';

// Database schema
class CalendHDDatabase extends Dexie {
	events!: EntityTable<LocalEvent, 'local_id'>;
	categories!: EntityTable<LocalCategory, 'local_id'>;
	templates!: EntityTable<LocalTemplate, 'local_id'>;
	subscriptions!: EntityTable<CalendarSubscription, 'id'>;
	external_events!: EntityTable<ExternalEvent, 'id'>;
	external_event_reminders!: EntityTable<ExternalEventReminder, 'id'>;
	settings!: EntityTable<UserSettings, 'id'>;
	routine_templates!: EntityTable<LocalRoutineTemplate, 'local_id'>;

	constructor() {
		super('CalendHD');

		this.version(2).stores({
			events: 'local_id, id, user, start_time, end_time, category, template, sync_status, [user+start_time]',
			categories: 'local_id, id, user, sort_order, sync_status',
			templates: 'local_id, id, user, name, category, sync_status',
			subscriptions: 'id, user, name, is_active',
			external_events: 'id, user, subscription, uid, start_time, [user+start_time]',
			settings: 'id, user',
			routine_templates: 'local_id, id, user, name, is_active, sync_status'
		});

		this.version(3).stores({
			external_event_reminders: 'id, user, subscription, ical_uid, [subscription+ical_uid]'
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
	const all = await db.events
		.where('[user+start_time]')
		.between([userId, startDate.toISOString()], [userId, endDate.toISOString()], true, true)
		.toArray();
	return all.filter((e) => e.sync_status !== 'deleted');
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
	await db.events.update(localId, { sync_status: 'deleted' });
}

export async function hardDeleteLocalEvent(localId: string): Promise<void> {
	await db.events.delete(localId);
}

export async function getPendingDeleteEvents(): Promise<LocalEvent[]> {
	return db.events.where('sync_status').equals('deleted').toArray();
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

// External event reminder overrides
// Keyed by (subscription, ical_uid) — survives the wipe-and-replace of
// external_events on every subscription sync.

export async function upsertExternalEventReminder(
	override: Omit<ExternalEventReminder, 'id' | 'created' | 'updated'> & { id?: string }
): Promise<void> {
	const existing = await db.external_event_reminders
		.where('[subscription+ical_uid]')
		.equals([override.subscription, override.ical_uid])
		.first();

	if (existing) {
		await db.external_event_reminders.update(existing.id, {
			minutes_before: override.minutes_before,
			disabled: override.disabled
		});
	} else {
		const id = override.id ?? generateLocalId();
		await db.external_event_reminders.put({
			...override,
			id,
			created: '',
			updated: ''
		} as ExternalEventReminder);
	}
}

export async function getExternalEventReminder(
	subscription: string,
	icalUid: string
): Promise<ExternalEventReminder | undefined> {
	return db.external_event_reminders
		.where('[subscription+ical_uid]')
		.equals([subscription, icalUid])
		.first();
}

export async function deleteExternalEventReminder(
	subscription: string,
	icalUid: string
): Promise<void> {
	const existing = await db.external_event_reminders
		.where('[subscription+ical_uid]')
		.equals([subscription, icalUid])
		.first();
	if (existing) {
		await db.external_event_reminders.delete(existing.id);
	}
}

export async function getExternalEventRemindersForSubscription(
	subscription: string
): Promise<ExternalEventReminder[]> {
	return db.external_event_reminders.where('subscription').equals(subscription).toArray();
}

