// Base types for PocketBase records
export interface BaseRecord {
	id: string;
	created: string;
	updated: string;
}

// User type (from PocketBase auth)
export interface User extends BaseRecord {
	email: string;
	name: string;
	avatar?: string;
}

// Category for organizing events
export interface Category extends BaseRecord {
	user: string;
	name: string;
	color: string; // hex color
	icon?: string;
	sort_order: number;
}

// Template for quick event creation
export interface Template extends BaseRecord {
	user: string;
	name: string;
	category?: string;
	default_duration_minutes: number;
	default_is_all_day: boolean;
	default_reminders: ReminderConfig[];
	description?: string;
	image?: string;
	icon?: string;
	color_override?: string;
}

// Event recurrence configuration
export interface RecurrenceRule {
	frequency: 'daily' | 'every_other_day' | 'weekly' | 'biweekly' | 'monthly' | 'yearly';
	interval?: number;
	end_date?: string;
	count?: number;
	days_of_week?: number[]; // 0-6 for Sunday-Saturday
}

// Reminder configuration
export interface ReminderConfig {
	minutes_before: number;
	type: 'notification' | 'email';
}

// Calendar event
export interface CalendarEvent extends BaseRecord {
	user: string;
	template?: string;
	category?: string;
	title: string;
	description?: string;
	start_time: string; // ISO datetime
	end_time?: string; // ISO datetime (optional)
	is_all_day: boolean;
	is_task?: boolean; // if true, shows checkbox and can be marked complete
	image?: string;
	icon?: string;
	color_override?: string;
	recurrence_rule?: RecurrenceRule;
	recurrence_parent?: string; // self-relation for recurrence instances
	reminders: ReminderConfig[];
	completed_at?: string; // when task was completed
	local_id?: string; // for offline sync
	last_synced?: string;
}

// Calendar subscription (for remote iCal feeds)
export interface CalendarSubscription extends BaseRecord {
	user: string;
	name: string;
	url: string;
	color_override?: string;
	refresh_interval_minutes: number;
	last_refreshed?: string;
	is_active: boolean;
	error_message?: string;
}

// External event from subscription (read-only)
export interface ExternalEvent extends BaseRecord {
	user: string;
	subscription: string;
	uid: string; // iCal UID
	title: string;
	description?: string;
	start_time: string;
	end_time?: string;
	is_all_day: boolean;
	location?: string;
	recurrence_rule?: RecurrenceRule;
	raw_ics?: string;
}

// User settings
export interface UserSettings extends BaseRecord {
	user: string;
	default_view: 'day' | 'week' | 'month';
	week_starts_on: 0 | 1 | 6; // Sunday, Monday, Saturday
	time_format: '12h' | '24h';
	theme: 'light' | 'dark' | 'system';
	locale: string; // e.g., 'en', 'sv'
	color_palette: 'default' | 'muted' | 'vibrant';
	default_reminders: ReminderConfig[];
	notification_sound: boolean;
	reduce_animations: boolean;
	high_contrast: boolean;
	timezone: string;
	push_subscription?: PushSubscriptionData; // Web Push subscription for notifications
}

// Push subscription data
export interface PushSubscriptionData {
	endpoint: string;
	keys: {
		p256dh: string;
		auth: string;
	};
}

// Scheduled reminder (for backend processing)
export interface ScheduledReminder extends BaseRecord {
	user: string;
	event: string;
	scheduled_for: string;
	reminder_type: 'notification' | 'email';
	sent_at?: string;
	delivery_method?: 'web_push';
	error_message?: string;
}

// Local-only types for Dexie/IndexedDB

export interface LocalEvent extends Omit<CalendarEvent, 'id' | 'created' | 'updated'> {
	id?: string; // may not have server ID yet
	local_id: string;
	sync_status: 'synced' | 'pending' | 'conflict';
	pending_changes?: Partial<CalendarEvent>;
}

export interface LocalCategory extends Omit<Category, 'id' | 'created' | 'updated'> {
	id?: string;
	local_id: string;
	sync_status: 'synced' | 'pending' | 'conflict';
}

export interface LocalTemplate extends Omit<Template, 'id' | 'created' | 'updated'> {
	id?: string;
	local_id: string;
	sync_status: 'synced' | 'pending' | 'conflict';
}

// Sync metadata
export interface SyncMeta {
	id: string;
	collection: string;
	last_synced: string;
	cursor?: string;
}

// Calendar view event (expanded for display)
export interface DisplayEvent {
	id: string;
	title: string;
	start: Date;
	end?: Date;
	is_all_day: boolean;
	is_task: boolean;
	is_completed: boolean;
	color: string;
	icon?: string;
	category_name?: string;
	is_external: boolean;
	subscription_name?: string;
	original_event: CalendarEvent | ExternalEvent;
}

// Time block for day/week view
export interface TimeBlock {
	start: Date;
	end: Date;
	events: DisplayEvent[];
}

// Form data types
export interface EventFormData {
	title: string;
	description?: string;
	start_date: string;
	start_time?: string;
	end_date?: string;
	end_time?: string;
	is_all_day: boolean;
	is_task: boolean;
	category?: string;
	template?: string;
	color_override?: string;
	icon?: string;
	reminders: ReminderConfig[];
	recurrence_rule?: RecurrenceRule;
}

export interface CategoryFormData {
	name: string;
	color: string;
	icon?: string;
}

export interface TemplateFormData {
	name: string;
	category?: string;
	default_duration_minutes: number;
	default_is_all_day: boolean;
	default_reminders: ReminderConfig[];
	description?: string;
	color_override?: string;
	icon?: string;
}

export interface SubscriptionFormData {
	name: string;
	url: string;
	color_override?: string;
	refresh_interval_minutes: number;
}

// API response types
export interface PaginatedResponse<T> {
	page: number;
	perPage: number;
	totalItems: number;
	totalPages: number;
	items: T[];
}

// Error types
export interface ApiError {
	code: number;
	message: string;
	data?: Record<string, unknown>;
}
