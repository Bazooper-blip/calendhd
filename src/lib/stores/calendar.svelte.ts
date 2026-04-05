import { browser } from '$app/environment';
import {
	startOfDay,
	endOfDay,
	startOfWeek,
	endOfWeek,
	startOfMonth,
	endOfMonth,
	addDays,
	addWeeks,
	addMonths,
	subDays,
	subWeeks,
	subMonths
} from 'date-fns';
import { isSameDay } from '$utils';
import {
	getEvents,
	getExternalEvents,
	subscribeToEvents,
	createEvent as createServerEvent,
	updateEvent as updateServerEvent,
	deleteEvent as deleteServerEvent
} from '$api/pocketbase';
import {
	db,
	getLocalEvents,
	getLocalExternalEvents,
	setExternalEvents,
	createLocalEvent,
	updateLocalEvent,
	deleteLocalEvent,
	markEventSynced
} from '$db';
import { auth } from './auth.svelte';
import { settingsStore } from './settings.svelte';
import type { CalendarEvent, ExternalEvent, DisplayEvent, LocalEvent } from '$types';

export type ViewType = 'day' | 'week' | 'month';

// Calendar store using Svelte 5 runes
function createCalendarStore() {
	let currentDate = $state(new Date());
	let viewType = $state<ViewType>('week');
	let events = $state<CalendarEvent[]>([]);
	let externalEvents = $state<ExternalEvent[]>([]);
	let loading = $state(false);

	// Unsubscribe function for realtime events
	let unsubscribe: (() => void) | null = null;

	// Calculate view range based on current date and view type
	function getViewRange(): { start: Date; end: Date } {
		const weekStartsOn = settingsStore.weekStartsOn;

		switch (viewType) {
			case 'day':
				return {
					start: startOfDay(currentDate),
					end: endOfDay(currentDate)
				};
			case 'week':
				return {
					start: startOfWeek(currentDate, { weekStartsOn }),
					end: endOfWeek(currentDate, { weekStartsOn })
				};
			case 'month':
				const monthStart = startOfMonth(currentDate);
				const monthEnd = endOfMonth(currentDate);
				// Include days from adjacent months visible in the calendar grid
				return {
					start: startOfWeek(monthStart, { weekStartsOn }),
					end: endOfWeek(monthEnd, { weekStartsOn })
				};
		}
	}

	return {
		get currentDate() {
			return currentDate;
		},
		get viewType() {
			return viewType;
		},
		get events() {
			return events;
		},
		get externalEvents() {
			return externalEvents;
		},
		get loading() {
			return loading;
		},
		get viewRange() {
			return getViewRange();
		},

		// Get all events for display (merged and sorted)
		get displayEvents(): DisplayEvent[] {
			const allEvents: DisplayEvent[] = [];

			// Convert calendar events
			for (const event of events) {
				allEvents.push({
					id: event.id,
					title: event.title,
					start: new Date(event.start_time),
					end: event.end_time ? new Date(event.end_time) : undefined,
					is_all_day: event.is_all_day,
					is_task: event.is_task || false,
					is_completed: !!event.completed_at,
					color: event.color_override || '#7C9885', // default sage green
					icon: event.icon,
					is_external: false,
					original_event: event
				});
			}

			// Convert external events
			for (const event of externalEvents) {
				const subscription = (event as any).expand?.subscription;
				allEvents.push({
					id: event.id,
					title: event.title,
					start: new Date(event.start_time),
					end: event.end_time ? new Date(event.end_time) : undefined,
					is_all_day: event.is_all_day,
					is_task: false,
					is_completed: false,
					color: subscription?.color_override || '#9A88B5', // subscription color or default lavender
					is_external: true,
					subscription_name: subscription?.name,
					original_event: event
				});
			}

			// Sort by start time
			return allEvents.sort((a, b) => a.start.getTime() - b.start.getTime());
		},

		// Get events for a specific day
		getEventsForDay(date: Date): DisplayEvent[] {
			return this.displayEvents.filter((event) => isSameDay(event.start, date));
		},

		// Navigation
		setDate(date: Date) {
			currentDate = date;
			this.loadEvents();
		},

		setViewType(type: ViewType) {
			viewType = type;
			this.loadEvents();
		},

		goToToday() {
			currentDate = new Date();
			this.loadEvents();
		},

		goNext() {
			switch (viewType) {
				case 'day':
					currentDate = addDays(currentDate, 1);
					break;
				case 'week':
					currentDate = addWeeks(currentDate, 1);
					break;
				case 'month':
					currentDate = addMonths(currentDate, 1);
					break;
			}
			this.loadEvents();
		},

		goPrevious() {
			switch (viewType) {
				case 'day':
					currentDate = subDays(currentDate, 1);
					break;
				case 'week':
					currentDate = subWeeks(currentDate, 1);
					break;
				case 'month':
					currentDate = subMonths(currentDate, 1);
					break;
			}
			this.loadEvents();
		},

		// Load events for current view
		async loadEvents() {
			if (!browser) return;

			const userId = auth.user?.id;
			if (!userId) {
				events = [];
				externalEvents = [];
				return;
			}

			loading = true;
			const { start, end } = getViewRange();

			// Load from local DB first (offline-first)
			try {
				const localEvents = await getLocalEvents(userId, start, end);
				events = localEvents.map((le) => ({
					...le,
					id: le.id || le.local_id,
					created: '',
					updated: ''
				})) as CalendarEvent[];

				const localExternal = await getLocalExternalEvents(userId, start, end);
				externalEvents = localExternal;
			} catch (error) {
				console.warn('Failed to load from local DB:', error);
			}

			// Try to sync from server
			try {
				const [serverEvents, serverExternalEvents] = await Promise.all([
					getEvents(start, end),
					getExternalEvents(start, end)
				]);

				events = serverEvents;
				externalEvents = serverExternalEvents;

				// Save external events to IndexedDB for offline access
				// Clear old external events first to remove stale entries
				await db.external_events.where('user').equals(userId).delete();
				if (serverExternalEvents.length > 0) {
					await setExternalEvents(serverExternalEvents);
				}

				console.log(`Loaded ${serverEvents.length} events and ${serverExternalEvents.length} external events from server`);
			} catch (error) {
				console.error('Failed to load events from server:', error);
				// Keep local data if server fails
			}

			loading = false;
		},

		// Subscribe to realtime updates
		subscribeToUpdates() {
			if (!browser) return;

			// Clean up previous subscription
			if (unsubscribe) {
				unsubscribe();
			}

			unsubscribe = subscribeToEvents((action, record) => {
				switch (action) {
					case 'create':
						// Only add if not already present (avoid duplicate from optimistic update)
						if (!events.some((e) => e.id === record.id)) {
							events = [...events, record];
						}
						break;
					case 'update':
						events = events.map((e) => (e.id === record.id ? record : e));
						break;
					case 'delete':
						events = events.filter((e) => e.id !== record.id);
						break;
				}
			});
		},

		unsubscribeFromUpdates() {
			if (unsubscribe) {
				unsubscribe();
				unsubscribe = null;
			}
		},

		// Event CRUD (offline-first with immediate sync)
		async createEvent(data: Omit<LocalEvent, 'local_id' | 'sync_status' | 'user'>) {
			const userId = auth.user?.id;
			if (!userId) throw new Error('Not authenticated');

			const localEvent = await createLocalEvent({
				...data,
				user: userId
			});

			// Optimistically add to events with local ID
			const tempEvent = {
				...localEvent,
				id: localEvent.local_id,
				created: new Date().toISOString(),
				updated: new Date().toISOString()
			} as CalendarEvent;

			events = [...events, tempEvent];

			// Sync to server
			try {
				const serverEvent = await createServerEvent(data);
				// Update local DB with server ID
				await markEventSynced(localEvent.local_id, serverEvent.id);
				// Replace temp event with server event
				events = events.map((e) =>
					e.id === localEvent.local_id ? serverEvent : e
				);

				return serverEvent;
			} catch (error) {
				// Keep local event for offline mode
				console.error('Failed to sync event to server:', error);
				return localEvent;
			}
		},

		async updateEvent(id: string, changes: Partial<CalendarEvent>) {
			// Optimistically update
			const oldEvents = events;
			events = events.map((e) => (e.id === id ? { ...e, ...changes } : e));

			// Update local DB
			await updateLocalEvent(id, changes);

			// Sync to server
			try {
				const serverEvent = await updateServerEvent(id, changes);
				events = events.map((e) => (e.id === id ? serverEvent : e));
			} catch (error) {
				console.error('Failed to sync event update to server:', error);
				// Keep optimistic update for offline mode
			}
		},

		async deleteEvent(id: string) {
			// Optimistically remove
			const oldEvents = events;
			events = events.filter((e) => e.id !== id);

			// Delete from local DB
			await deleteLocalEvent(id);

			// Sync to server
			try {
				await deleteServerEvent(id);
			} catch (error) {
				console.error('Failed to sync event deletion to server:', error);
				// Already removed from UI, will sync on next load
			}
		},

		// Toggle task completion
		async toggleTaskComplete(id: string) {
			const event = events.find((e) => e.id === id);
			if (!event || !event.is_task) return;

			const completed_at = event.completed_at ? undefined : new Date().toISOString();
			await this.updateEvent(id, { completed_at });
		}
	};
}

export const calendar = createCalendarStore();
