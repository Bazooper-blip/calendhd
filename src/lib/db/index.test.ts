import { describe, it, expect, beforeEach } from 'vitest';
import {
	db,
	generateLocalId,
	createLocalEvent,
	getLocalEvent,
	getLocalEvents,
	updateLocalEvent,
	deleteLocalEvent,
	hardDeleteLocalEvent,
	getPendingDeleteEvents,
	markEventSynced,
	createLocalCategory,
	getLocalCategories,
	updateLocalCategory,
	deleteLocalCategory,
	createLocalTemplate,
	getLocalTemplates,
	updateLocalTemplate,
	deleteLocalTemplate,
	setLocalSettings,
	getLocalSettings
} from './index';
import type { LocalEvent, LocalCategory, LocalTemplate, UserSettings } from '$types';

const TEST_USER = 'test-user-id';

// Helper to create a minimal event
function makeEvent(
	overrides: Partial<Omit<LocalEvent, 'local_id' | 'sync_status'>> = {}
): Omit<LocalEvent, 'local_id' | 'sync_status'> {
	return {
		user: TEST_USER,
		title: 'Test Event',
		start_time: '2026-04-05T10:00:00.000Z',
		is_all_day: false,
		reminders: [],
		...overrides
	};
}

beforeEach(async () => {
	// Clear all tables before each test
	await db.events.clear();
	await db.categories.clear();
	await db.templates.clear();
	await db.settings.clear();
});

// --- generateLocalId ---

describe('generateLocalId', () => {
	it('starts with "local_"', () => {
		expect(generateLocalId()).toMatch(/^local_/);
	});

	it('generates unique IDs', () => {
		const ids = new Set(Array.from({ length: 100 }, () => generateLocalId()));
		expect(ids.size).toBe(100);
	});
});

// --- Event CRUD ---

describe('Event CRUD', () => {
	it('creates an event with local_id and pending sync_status', async () => {
		const event = await createLocalEvent(makeEvent({ title: 'My Event' }));

		expect(event.local_id).toMatch(/^local_/);
		expect(event.sync_status).toBe('pending');
		expect(event.title).toBe('My Event');
		expect(event.user).toBe(TEST_USER);
	});

	it('retrieves an event by local_id', async () => {
		const created = await createLocalEvent(makeEvent());
		const fetched = await getLocalEvent(created.local_id);

		expect(fetched).toBeDefined();
		expect(fetched!.local_id).toBe(created.local_id);
		expect(fetched!.title).toBe('Test Event');
	});

	it('updates an event and sets sync_status to pending', async () => {
		const event = await createLocalEvent(makeEvent());
		await markEventSynced(event.local_id, 'server-123');

		// Verify it's synced
		let fetched = await getLocalEvent(event.local_id);
		expect(fetched!.sync_status).toBe('synced');

		// Update it
		await updateLocalEvent(event.local_id, { title: 'Updated Title' });

		fetched = await getLocalEvent(event.local_id);
		expect(fetched!.title).toBe('Updated Title');
		expect(fetched!.sync_status).toBe('pending');
	});
});

// --- Event ID lifecycle: local_id → server id ---

describe('Event ID lifecycle', () => {
	it('marks event synced with server ID', async () => {
		const event = await createLocalEvent(makeEvent());
		expect(event.id).toBeUndefined();

		await markEventSynced(event.local_id, 'server-abc');

		const fetched = await getLocalEvent(event.local_id);
		expect(fetched!.id).toBe('server-abc');
		expect(fetched!.sync_status).toBe('synced');
		expect(fetched!.last_synced).toBeDefined();
	});

	it('can look up synced event by server id index', async () => {
		const event = await createLocalEvent(makeEvent());
		await markEventSynced(event.local_id, 'server-xyz');

		// Look up by server id (same pattern used in store fix)
		const found = await db.events.where('id').equals('server-xyz').first();
		expect(found).toBeDefined();
		expect(found!.local_id).toBe(event.local_id);
	});

	it('local_id remains primary key after sync', async () => {
		const event = await createLocalEvent(makeEvent());
		await markEventSynced(event.local_id, 'server-999');

		// Still retrievable by local_id (primary key)
		const fetched = await getLocalEvent(event.local_id);
		expect(fetched).toBeDefined();
		expect(fetched!.id).toBe('server-999');
	});
});

// --- Soft-delete flow ---

describe('Soft-delete flow', () => {
	it('soft-deletes by setting sync_status to deleted', async () => {
		const event = await createLocalEvent(makeEvent());
		await deleteLocalEvent(event.local_id);

		const fetched = await getLocalEvent(event.local_id);
		expect(fetched).toBeDefined();
		expect(fetched!.sync_status).toBe('deleted');
	});

	it('getPendingDeleteEvents returns soft-deleted events', async () => {
		const e1 = await createLocalEvent(makeEvent({ title: 'Keep' }));
		const e2 = await createLocalEvent(makeEvent({ title: 'Delete Me' }));

		await deleteLocalEvent(e2.local_id);

		const pending = await getPendingDeleteEvents();
		expect(pending).toHaveLength(1);
		expect(pending[0].title).toBe('Delete Me');
	});

	it('getLocalEvents excludes soft-deleted events', async () => {
		const start = new Date('2026-04-01T00:00:00Z');
		const end = new Date('2026-04-30T23:59:59Z');

		await createLocalEvent(makeEvent({ title: 'Visible' }));
		const toDelete = await createLocalEvent(makeEvent({ title: 'Deleted' }));
		await deleteLocalEvent(toDelete.local_id);

		const events = await getLocalEvents(TEST_USER, start, end);
		expect(events).toHaveLength(1);
		expect(events[0].title).toBe('Visible');
	});

	it('hardDeleteLocalEvent removes record entirely', async () => {
		const event = await createLocalEvent(makeEvent());
		await hardDeleteLocalEvent(event.local_id);

		const fetched = await getLocalEvent(event.local_id);
		expect(fetched).toBeUndefined();
	});

	it('full delete lifecycle: soft-delete → pending list → hard-delete', async () => {
		const event = await createLocalEvent(makeEvent());
		await markEventSynced(event.local_id, 'server-del');

		// Step 1: Soft-delete
		await deleteLocalEvent(event.local_id);
		let pending = await getPendingDeleteEvents();
		expect(pending).toHaveLength(1);
		expect(pending[0].id).toBe('server-del');

		// Step 2: Hard-delete after server confirms
		await hardDeleteLocalEvent(event.local_id);
		pending = await getPendingDeleteEvents();
		expect(pending).toHaveLength(0);

		const fetched = await getLocalEvent(event.local_id);
		expect(fetched).toBeUndefined();
	});
});

// --- Event range queries ---

describe('Event range queries', () => {
	it('filters events by date range', async () => {
		await createLocalEvent(
			makeEvent({ title: 'March', start_time: '2026-03-15T10:00:00.000Z' })
		);
		await createLocalEvent(
			makeEvent({ title: 'April', start_time: '2026-04-10T10:00:00.000Z' })
		);
		await createLocalEvent(
			makeEvent({ title: 'May', start_time: '2026-05-15T10:00:00.000Z' })
		);

		const april = await getLocalEvents(
			TEST_USER,
			new Date('2026-04-01T00:00:00Z'),
			new Date('2026-04-30T23:59:59Z')
		);
		expect(april).toHaveLength(1);
		expect(april[0].title).toBe('April');
	});

	it('only returns events for the specified user', async () => {
		await createLocalEvent(makeEvent({ user: TEST_USER, title: 'Mine' }));
		await createLocalEvent(makeEvent({ user: 'other-user', title: 'Theirs' }));

		const events = await getLocalEvents(
			TEST_USER,
			new Date('2026-01-01T00:00:00Z'),
			new Date('2026-12-31T23:59:59Z')
		);
		expect(events).toHaveLength(1);
		expect(events[0].title).toBe('Mine');
	});
});

// --- Category CRUD ---

describe('Category CRUD', () => {
	it('creates and retrieves categories', async () => {
		await createLocalCategory({
			user: TEST_USER,
			name: 'Work',
			color: '#7BA7BC',
			sort_order: 0
		});
		await createLocalCategory({
			user: TEST_USER,
			name: 'Personal',
			color: '#7C9885',
			sort_order: 1
		});

		const cats = await getLocalCategories(TEST_USER);
		expect(cats).toHaveLength(2);
		// Should be sorted by sort_order
		expect(cats[0].name).toBe('Work');
		expect(cats[1].name).toBe('Personal');
	});

	it('updates a category', async () => {
		const cat = await createLocalCategory({
			user: TEST_USER,
			name: 'Old Name',
			color: '#000000',
			sort_order: 0
		});

		await updateLocalCategory(cat.local_id, { name: 'New Name', color: '#ffffff' });

		const cats = await getLocalCategories(TEST_USER);
		expect(cats[0].name).toBe('New Name');
		expect(cats[0].color).toBe('#ffffff');
		expect(cats[0].sync_status).toBe('pending');
	});

	it('deletes a category', async () => {
		const cat = await createLocalCategory({
			user: TEST_USER,
			name: 'To Delete',
			color: '#000000',
			sort_order: 0
		});

		await deleteLocalCategory(cat.local_id);

		const cats = await getLocalCategories(TEST_USER);
		expect(cats).toHaveLength(0);
	});
});

// --- Template CRUD ---

describe('Template CRUD', () => {
	it('creates and retrieves templates sorted by name', async () => {
		await createLocalTemplate({
			user: TEST_USER,
			name: 'Zebra Meeting',
			default_duration_minutes: 60,
			default_is_all_day: false,
			default_reminders: []
		});
		await createLocalTemplate({
			user: TEST_USER,
			name: 'Alpha Standup',
			default_duration_minutes: 15,
			default_is_all_day: false,
			default_reminders: []
		});

		const templates = await getLocalTemplates(TEST_USER);
		expect(templates).toHaveLength(2);
		// Should be sorted by name
		expect(templates[0].name).toBe('Alpha Standup');
		expect(templates[1].name).toBe('Zebra Meeting');
	});

	it('updates a template', async () => {
		const tmpl = await createLocalTemplate({
			user: TEST_USER,
			name: 'Old Template',
			default_duration_minutes: 30,
			default_is_all_day: false,
			default_reminders: []
		});

		await updateLocalTemplate(tmpl.local_id, { name: 'New Template' });

		const templates = await getLocalTemplates(TEST_USER);
		expect(templates[0].name).toBe('New Template');
		expect(templates[0].sync_status).toBe('pending');
	});

	it('deletes a template', async () => {
		const tmpl = await createLocalTemplate({
			user: TEST_USER,
			name: 'To Delete',
			default_duration_minutes: 30,
			default_is_all_day: false,
			default_reminders: []
		});

		await deleteLocalTemplate(tmpl.local_id);

		const templates = await getLocalTemplates(TEST_USER);
		expect(templates).toHaveLength(0);
	});
});

// --- Settings ---

describe('Settings', () => {
	it('saves and retrieves settings', async () => {
		const settings: UserSettings = {
			id: 'settings-1',
			created: '',
			updated: '',
			user: TEST_USER,
			default_view: 'week',
			week_starts_on: 1,
			time_format: '24h',
			theme: 'light',
			locale: 'en',
			color_palette: 'sage',
			default_reminders: [],
			notification_sound: true,
			reduce_animations: false,
			high_contrast: false,
			timezone: 'Europe/Helsinki'
		};

		await setLocalSettings(settings);
		const fetched = await getLocalSettings(TEST_USER);

		expect(fetched).toBeDefined();
		expect(fetched!.default_view).toBe('week');
		expect(fetched!.timezone).toBe('Europe/Helsinki');
	});

	it('upserts settings (put overwrites)', async () => {
		const settings: UserSettings = {
			id: 'settings-1',
			created: '',
			updated: '',
			user: TEST_USER,
			default_view: 'day',
			week_starts_on: 0,
			time_format: '12h',
			theme: 'system',
			locale: 'en',
			color_palette: 'sage',
			default_reminders: [],
			notification_sound: false,
			reduce_animations: false,
			high_contrast: false,
			timezone: 'UTC'
		};

		await setLocalSettings(settings);
		await setLocalSettings({ ...settings, default_view: 'month' });

		const fetched = await getLocalSettings(TEST_USER);
		expect(fetched!.default_view).toBe('month');

		// Should still be only one record
		const count = await db.settings.count();
		expect(count).toBe(1);
	});
});
