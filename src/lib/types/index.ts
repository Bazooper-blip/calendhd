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

// Energy level for events and routine steps
export type EnergyLevel = 'low' | 'medium' | 'high';

// Individual step within a routine template
export interface RoutineStep {
	title: string;
	duration_minutes: number;
	icon?: string;
	category?: string;
	energy_level?: EnergyLevel;
	timing_mode?: 'fixed' | 'flexible';
}

// Routine schedule (which days and what time)
export interface RoutineSchedule {
	days: ('mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun')[];
	time: string; // HH:mm format (24h)
}

// Routine template (PocketBase server record)
export interface RoutineTemplate extends BaseRecord {
	user: string;
	name: string;
	steps: RoutineStep[];
	schedule: RoutineSchedule;
	is_active: boolean;
	color?: string;
	icon?: string;
	target_end_time?: string;
}

// Local version for IndexedDB
export interface LocalRoutineTemplate extends Omit<RoutineTemplate, 'id' | 'created' | 'updated'> {
	id?: string;
	local_id: string;
	sync_status: 'synced' | 'pending' | 'conflict';
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
	first_step?: string; // optional "first physical action" — what to actually start doing
	start_time: string; // ISO datetime
	end_time?: string; // ISO datetime (optional)
	is_all_day: boolean;
	is_task?: boolean; // if true, shows checkbox and can be marked complete
	image?: string;
	icon?: string;
	color_override?: string;
	recurrence_rule?: RecurrenceRule;
	recurrence_parent?: string; // self-relation for recurrence instances
	routine_template?: string; // relation to routine_templates
	routine_step_index?: number; // 0-based index of the step within the routine
	energy_level?: EnergyLevel;
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
	color_palette: 'sage' | 'ocean' | 'lavender' | 'rose' | 'amber' | 'teal';
	default_reminders: ReminderConfig[];
	notification_sound: boolean;
	reduce_animations: boolean;
	high_contrast: boolean;
	timezone: string;
	push_subscription?: PushSubscriptionData; // Web Push subscription for notifications
	buffer_minutes?: number; // ADHD: visual transition-time gap between events (default 10)
	density?: 'compact' | 'comfortable' | 'spacious'; // ADHD: layout density preference
	daily_wins_enabled?: boolean; // ADHD: show end-of-day completion summary
	streak_celebration_enabled?: boolean; // ADHD: celebrate routine completion + show streak
}

// Brain dump (quick thought capture without scheduling)
export interface BrainDump extends BaseRecord {
	user: string;
	title: string;
	notes?: string;
}

// Push subscription data
export interface PushSubscriptionData {
	endpoint: string;
	keys: {
		p256dh: string;
		auth: string;
	};
}

// Local-only types for Dexie/IndexedDB

export interface LocalEvent extends Omit<CalendarEvent, 'id' | 'created' | 'updated'> {
	id?: string; // may not have server ID yet
	local_id: string;
	sync_status: 'synced' | 'pending' | 'conflict' | 'deleted';
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
	routine_template?: string;
	routine_step_index?: number;
	routine_group_name?: string;
	energy_level?: EnergyLevel;
	original_event: CalendarEvent | ExternalEvent;
}

// Form data types
export interface EventFormData {
	title: string;
	description?: string;
	first_step?: string; // ADHD: optional "first physical action"
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

