import PocketBase from 'pocketbase';
import type {
	User,
	Category,
	Template,
	RoutineTemplate,
	CalendarEvent,
	CalendarSubscription,
	ExternalEvent,
	UserSettings,
	BrainDump
} from '$types';

// PocketBase client singleton
let pb: PocketBase | null = null;

export function getPocketBase(): PocketBase {
	if (!pb) {
		// Use current origin in browser (works when PocketBase serves frontend)
		// Fall back to env var or localhost for SSR/dev
		const url = typeof window !== 'undefined'
			? window.location.origin
			: (import.meta.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090');
		pb = new PocketBase(url);
		// Disable auto-cancellation to prevent errors when multiple requests are made
		pb.autoCancellation(false);
	}
	return pb;
}

// Type-safe collection helpers
const collections = {
	users: () => getPocketBase().collection('users'),
	categories: () => getPocketBase().collection('categories'),
	templates: () => getPocketBase().collection('templates'),
	events: () => getPocketBase().collection('events'),
	calendar_subscriptions: () => getPocketBase().collection('calendar_subscriptions'),
	external_events: () => getPocketBase().collection('external_events'),
	user_settings: () => getPocketBase().collection('user_settings'),
	scheduled_reminders: () => getPocketBase().collection('scheduled_reminders'),
	routine_templates: () => getPocketBase().collection('routine_templates'),
	brain_dump: () => getPocketBase().collection('brain_dump')
};

// Brain dump CRUD
export async function getBrainDumps(): Promise<BrainDump[]> {
	// Sort client-side: server-side `sort=-created` rejected when brain_dump
	// collection's auto-created system fields aren't exposed as queryable
	// columns at the API layer in PB 0.37. Volume is small (single household,
	// quick captures), so post-fetch sort is fine.
	// `batch: 200` keeps perPage well under PB's MaxPerPage=500.
	const records = await collections.brain_dump().getFullList({ batch: 200 });
	const list = records as unknown as BrainDump[];
	return list.sort((a, b) => b.created.localeCompare(a.created));
}

export async function createBrainDump(title: string, notes?: string): Promise<BrainDump> {
	const userId = getCurrentUser()?.id;
	if (!userId) throw new Error('Not authenticated');
	const record = await collections.brain_dump().create({ user: userId, title, notes: notes ?? '' });
	return record as unknown as BrainDump;
}

export async function deleteBrainDump(id: string): Promise<void> {
	await collections.brain_dump().delete(id);
}

// Auth helpers
export async function signInWithEmail(email: string, password: string): Promise<User> {
	const authData = await getPocketBase().collection('users').authWithPassword(email, password);
	return authData.record as unknown as User;
}

export function getCurrentUser(): User | null {
	const pb = getPocketBase();
	if (!pb.authStore.isValid) return null;
	return pb.authStore.record as unknown as User;
}

export function getAuthToken(): string | null {
	const pb = getPocketBase();
	return pb.authStore.isValid ? pb.authStore.token : null;
}

// Subscribe to auth changes
export function onAuthChange(callback: (user: User | null) => void): () => void {
	return getPocketBase().authStore.onChange(() => {
		callback(getCurrentUser());
	});
}

// Category API
export async function getCategories(): Promise<Category[]> {
	const records = await collections.categories().getFullList({
		sort: 'sort_order'
	});
	return records as unknown as Category[];
}

export async function createCategory(data: Omit<Category, 'id' | 'created' | 'updated' | 'user'>): Promise<Category> {
	const user = getCurrentUser();
	if (!user) throw new Error('Not authenticated');

	const record = await collections.categories().create({
		...data,
		user: user.id
	});
	return record as unknown as Category;
}

export async function updateCategory(id: string, data: Partial<Category>): Promise<Category> {
	const record = await collections.categories().update(id, data);
	return record as unknown as Category;
}

export async function deleteCategory(id: string): Promise<void> {
	await collections.categories().delete(id);
}

// Template API
export async function getTemplates(): Promise<Template[]> {
	const records = await collections.templates().getFullList({
		sort: 'name'
	});
	return records as unknown as Template[];
}

export async function createTemplate(data: Omit<Template, 'id' | 'created' | 'updated' | 'user'>): Promise<Template> {
	const user = getCurrentUser();
	if (!user) throw new Error('Not authenticated');

	const record = await collections.templates().create({
		...data,
		user: user.id
	});
	return record as unknown as Template;
}

export async function updateTemplate(id: string, data: Partial<Template>): Promise<Template> {
	const record = await collections.templates().update(id, data);
	return record as unknown as Template;
}

export async function deleteTemplate(id: string): Promise<void> {
	await collections.templates().delete(id);
}

// Routine Template API
export async function getRoutineTemplates(): Promise<RoutineTemplate[]> {
	const records = await collections.routine_templates().getFullList({
		sort: 'name'
	});
	return records as unknown as RoutineTemplate[];
}

export async function createRoutineTemplate(
	data: Omit<RoutineTemplate, 'id' | 'created' | 'updated' | 'user'>
): Promise<RoutineTemplate> {
	const user = getCurrentUser();
	if (!user) throw new Error('Not authenticated');

	const record = await collections.routine_templates().create({
		...data,
		user: user.id
	});
	return record as unknown as RoutineTemplate;
}

export async function updateRoutineTemplate(
	id: string,
	data: Partial<RoutineTemplate>
): Promise<RoutineTemplate> {
	const record = await collections.routine_templates().update(id, data);
	return record as unknown as RoutineTemplate;
}

export async function deleteRoutineTemplate(id: string): Promise<void> {
	await collections.routine_templates().delete(id);
}

// Realtime subscription for routines
export function subscribeToRoutineTemplates(
	callback: (action: 'create' | 'update' | 'delete', record: RoutineTemplate) => void
): () => void {
	collections.routine_templates().subscribe('*', (e) => {
		callback(
			e.action as 'create' | 'update' | 'delete',
			e.record as unknown as RoutineTemplate
		);
	});

	return () => {
		collections.routine_templates().unsubscribe('*');
	};
}

// Event API
export async function getEvents(startDate: Date, endDate: Date): Promise<CalendarEvent[]> {
	const user = getCurrentUser();
	if (!user) return [];

	// Filter by date range - PocketBase API rules handle user access
	const records = await collections.events().getFullList({
		filter: `start_time >= "${startDate.toISOString()}" && start_time <= "${endDate.toISOString()}"`,
		sort: 'start_time'
	});
	return records as unknown as CalendarEvent[];
}

export async function getEvent(id: string): Promise<CalendarEvent> {
	const record = await collections.events().getOne(id);
	return record as unknown as CalendarEvent;
}

export async function createEvent(data: Omit<CalendarEvent, 'id' | 'created' | 'updated' | 'user'>): Promise<CalendarEvent> {
	const user = getCurrentUser();
	if (!user) throw new Error('Not authenticated');

	const payload = {
		...data,
		user: user.id
	};
	try {
		const record = await collections.events().create(payload);
		return record as unknown as CalendarEvent;
	} catch (error: any) {
		console.error('Failed to create event. Payload:', JSON.stringify(payload));
		console.error('PocketBase error details:', JSON.stringify(error?.data || error?.response));
		throw error;
	}
}

export async function updateEvent(id: string, data: Partial<CalendarEvent>): Promise<CalendarEvent> {
	const record = await collections.events().update(id, data);
	return record as unknown as CalendarEvent;
}

export async function deleteEvent(id: string): Promise<void> {
	await collections.events().delete(id);
}

// Subscription API
export async function getSubscriptions(): Promise<CalendarSubscription[]> {
	const records = await collections.calendar_subscriptions().getFullList({
		sort: 'name'
	});
	return records as unknown as CalendarSubscription[];
}

export async function createSubscription(
	data: Omit<CalendarSubscription, 'id' | 'created' | 'updated' | 'user'>
): Promise<CalendarSubscription> {
	const user = getCurrentUser();
	if (!user) throw new Error('Not authenticated');

	const record = await collections.calendar_subscriptions().create({
		...data,
		user: user.id
	});
	return record as unknown as CalendarSubscription;
}

export async function updateSubscription(
	id: string,
	data: Partial<CalendarSubscription>
): Promise<CalendarSubscription> {
	const record = await collections.calendar_subscriptions().update(id, data);
	return record as unknown as CalendarSubscription;
}

export async function deleteSubscription(id: string): Promise<void> {
	await collections.calendar_subscriptions().delete(id);
}

// External events API
export async function getExternalEvents(
	startDate: Date,
	endDate: Date
): Promise<ExternalEvent[]> {
	const user = getCurrentUser();
	if (!user) return [];

	const records = await collections.external_events().getFullList({
		filter: `user = "${user.id}" && start_time >= "${startDate.toISOString()}" && start_time <= "${endDate.toISOString()}"`,
		sort: 'start_time',
		expand: 'subscription'
	});
	return records as unknown as ExternalEvent[];
}

// User settings API
export async function getUserSettings(): Promise<UserSettings | null> {
	const user = getCurrentUser();
	if (!user) return null;

	try {
		const records = await collections.user_settings().getFullList({
			filter: `user = "${user.id}"`
		});
		return (records[0] as unknown as UserSettings) || null;
	} catch (error) {
		console.error('Failed to get user settings:', error);
		return null;
	}
}

export async function updateUserSettings(data: Partial<UserSettings>, existingId?: string): Promise<UserSettings> {
	const user = getCurrentUser();
	if (!user) throw new Error('Not authenticated');

	// If we have an existing ID, try to update directly
	if (existingId) {
		try {
			const record = await collections.user_settings().update(existingId, data);
			return record as unknown as UserSettings;
		} catch (error: any) {
			// If record not found (404), fall through to create new
			if (error?.status !== 404) {
				throw error;
			}
			console.log('Settings record not found, will create new one');
		}
	}

	// Try to find existing settings
	const existing = await getUserSettings();
	if (existing) {
		const record = await collections.user_settings().update(existing.id, data);
		return record as unknown as UserSettings;
	}

	// Create new settings
	const payload = {
		...getDefaultSettings(),
		...data,
		user: user.id
	};
	try {
		const record = await collections.user_settings().create(payload);
		return record as unknown as UserSettings;
	} catch (error: any) {
		console.error('Failed to create user_settings. Payload:', JSON.stringify(payload));
		console.error('PocketBase error details:', JSON.stringify(error?.data || error?.response));
		throw error;
	}
}

// Default settings
export function getDefaultSettings(): Omit<UserSettings, 'id' | 'created' | 'updated' | 'user'> {
	return {
		default_view: 'week',
		week_starts_on: 0,
		time_format: '12h',
		theme: 'system',
		locale: 'en',
		color_palette: 'sage',
		default_reminders: [{ minutes_before: 10, type: 'notification' }],
		notification_sound: true,
		reduce_animations: false,
		high_contrast: false,
		timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		buffer_minutes: 10,
		density: 'comfortable',
		daily_wins_enabled: true,
		streak_celebration_enabled: true
	};
}

// Get VAPID public key for Web Push subscription
export async function getVapidPublicKey(): Promise<string | null> {
	const pb = getPocketBase();
	try {
		const response = await pb.send('/api/calendhd/vapid-public-key', {
			method: 'GET'
		});
		return response.publicKey || null;
	} catch (error) {
		console.error('Failed to get VAPID public key:', error);
		return null;
	}
}

// Server-side push notification test
export async function testServerNotification(): Promise<{
	success: boolean;
	error?: string;
}> {
	const pb = getPocketBase();
	const response = await pb.send('/api/calendhd/test-notification', {
		method: 'POST'
	});
	return response;
}

// Realtime subscriptions
export function subscribeToEvents(
	callback: (action: 'create' | 'update' | 'delete', record: CalendarEvent) => void
): () => void {
	collections.events().subscribe('*', (e) => {
		callback(e.action as 'create' | 'update' | 'delete', e.record as unknown as CalendarEvent);
	});

	return () => {
		collections.events().unsubscribe('*');
	};
}

export function subscribeToCategories(
	callback: (action: 'create' | 'update' | 'delete', record: Category) => void
): () => void {
	collections.categories().subscribe('*', (e) => {
		callback(e.action as 'create' | 'update' | 'delete', e.record as unknown as Category);
	});

	return () => {
		collections.categories().unsubscribe('*');
	};
}
