import {
	addDays,
	addMonths,
	addWeeks,
	endOfDay,
	endOfMonth,
	endOfWeek,
	startOfDay,
	startOfMonth,
	startOfWeek,
	subDays,
	subMonths,
	subWeeks
} from 'date-fns';
import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import { toast } from 'svelte-sonner';
import {
	createEvent as createServerEvent,
	deleteEvent as deleteServerEvent,
	getEvents,
	getExternalEventPauses,
	getExternalEvents,
	getPausedEvents,
	pauseExternalEvent as pauseServerExternalEvent,
	resumeExternalEvent as resumeServerExternalEvent,
	subscribeToEvents,
	updateEvent as updateServerEvent
} from '$api/pocketbase';
import { browser } from '$app/environment';
import type {
	CalendarEvent,
	CalendarSubscription,
	DisplayEvent,
	ExternalEvent,
	ExternalEventPause
} from '$types';
import { baseIcalUid, isSameDay } from '$utils';
import { auth } from './auth.svelte';
import { routinesStore } from './routines.svelte';
import { settingsStore } from './settings.svelte';

export type ViewType = 'day' | 'week' | 'month';

// Calendar store using Svelte 5 runes
function createCalendarStore() {
	let currentDate = $state(new Date());
	let viewType = $state<ViewType>('week');
	let events = $state<CalendarEvent[]>([]);
	let externalEvents = $state<ExternalEvent[]>([]);
	// Paused events across ALL dates (not just the view range) — feeds the
	// sidebar's "Paused events" resume list, since paused events are hidden
	// from every calendar view.
	let pausedEvents = $state<CalendarEvent[]>([]);
	// Paused external events/series: one row per (subscription, base uid),
	// stored separately from external_events so it survives sync's
	// wipe-and-replace. Also feeds the sidebar's resume list.
	let externalPauses = $state<ExternalEventPause[]>([]);
	let loading = $state(false);

	// Timestamp of the last successful loadEvents(). The layout's resume
	// logic uses this to decide staleness — it deliberately does NOT depend
	// on visibility lifecycle events, which iOS delivers unreliably.
	let lastLoadSuccessAt = $state<number | null>(null);

	// Unsubscribe function for realtime events
	let unsubscribe: (() => void) | null = null;

	// Monotonic token for loadEvents() — bumped on every call, used to discard
	// stale writes when navigation fires overlapping loads.
	let loadGeneration = 0;

	// Keep the paused list in sync with a created/updated/deleted record
	function syncPausedEvent(action: 'create' | 'update' | 'delete', record: CalendarEvent) {
		if (action !== 'delete' && record.is_paused) {
			pausedEvents = [...pausedEvents.filter((e) => e.id !== record.id), record].sort(
				(a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
			);
		} else {
			pausedEvents = pausedEvents.filter((e) => e.id !== record.id);
		}
	}

	// Calculate view range based on current date and view type
	function getViewRange(): { start: Date; end: Date } {
		const weekStartsOn = settingsStore.weekStartsOn;

		switch (viewType) {
			case 'day':
				// Include tomorrow so the agenda can preview the next day's first
				// event; every consumer filters displayEvents per-day anyway.
				return {
					start: startOfDay(currentDate),
					end: endOfDay(addDays(currentDate, 1))
				};
			case 'week':
				return {
					start: startOfWeek(currentDate, { weekStartsOn }),
					end: endOfWeek(currentDate, { weekStartsOn })
				};
			case 'month': {
				const monthStart = startOfMonth(currentDate);
				const monthEnd = endOfMonth(currentDate);
				// Include days from adjacent months visible in the calendar grid
				return {
					start: startOfWeek(monthStart, { weekStartsOn }),
					end: endOfWeek(monthEnd, { weekStartsOn })
				};
			}
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
		get pausedEvents() {
			return pausedEvents;
		},
		get externalPauses() {
			return externalPauses;
		},
		get loading() {
			return loading;
		},
		get lastLoadSuccessAt() {
			return lastLoadSuccessAt;
		},
		get viewRange() {
			return getViewRange();
		},

		// Get all events for display (merged and sorted)
		get displayEvents(): DisplayEvent[] {
			const allEvents: DisplayEvent[] = [];

			// Convert calendar events (paused events are hidden from every view)
			for (const event of events) {
				if (event.is_paused) continue;
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
					routine_template: event.routine_template,
					routine_step_index: event.routine_step_index,
					energy_level: event.energy_level,
					routine_group_name: event.routine_template
						? routinesStore.getById(event.routine_template)?.name
						: undefined,
					original_event: event
				});
			}

			// Convert external events (paused series are hidden from every view;
			// pause rows are keyed by subscription + BASE uid)
			const externalPauseKeys = new Set(externalPauses.map((p) => `${p.subscription}|${p.ical_uid}`));
			for (const event of externalEvents) {
				if (externalPauseKeys.has(`${event.subscription}|${baseIcalUid(event.uid)}`)) continue;
				const subscription = (
					event as ExternalEvent & { expand?: { subscription?: CalendarSubscription } }
				).expand?.subscription;
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
		async loadEvents(retryAttempt = 0) {
			if (!browser) return;

			const userId = auth.user?.id;
			if (!userId) {
				events = [];
				externalEvents = [];
				return;
			}

			// Claim a token; any in-flight loadEvents() with an older token must
			// stop writing to the shared events/externalEvents state — otherwise
			// a slow earlier fetch can clobber a newer view's data and the grid
			// renders empty after rapid prev/next clicks.
			const myGen = ++loadGeneration;
			const isStale = () => myGen !== loadGeneration;

			loading = true;
			const { start, end } = getViewRange();

			try {
				const [serverEvents, serverExternalEvents, serverPausedEvents, serverExternalPauses] =
					await Promise.all([
						getEvents(start, end),
						getExternalEvents(start, end),
						getPausedEvents(),
						getExternalEventPauses()
					]);
				if (isStale()) return;
				events = serverEvents;
				externalEvents = serverExternalEvents;
				pausedEvents = serverPausedEvents;
				externalPauses = serverExternalPauses;
				lastLoadSuccessAt = Date.now();
			} catch (error) {
				console.error('Failed to load events from server:', error);
				// Keep whatever is currently displayed and retry with backoff:
				// right after an iOS PWA wakes up, the first fetch regularly
				// fires before the network is ready, and no `online` event
				// follows because connectivity never "changed" for the OS.
				if (retryAttempt < 3) {
					setTimeout(
						() => {
							if (!isStale()) this.loadEvents(retryAttempt + 1);
						},
						2000 * 2 ** retryAttempt
					);
				}
			}

			if (!isStale()) loading = false;
		},

		// Subscribe to realtime updates
		subscribeToUpdates() {
			if (!browser) return;

			// Clean up previous subscription
			if (unsubscribe) {
				unsubscribe();
			}

			unsubscribe = subscribeToEvents((action, record) => {
				syncPausedEvent(action, record);
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

		// Event CRUD (server-first: await PocketBase, then update UI state)
		async createEvent(data: Omit<CalendarEvent, 'id' | 'created' | 'updated' | 'user'>) {
			const userId = auth.user?.id;
			if (!userId) throw new Error('Not authenticated');

			const serverEvent = await createServerEvent(data);
			if (!events.some((e) => e.id === serverEvent.id)) {
				events = [...events, serverEvent];
			}
			syncPausedEvent('create', serverEvent);
			return serverEvent;
		},

		async updateEvent(id: string, changes: Partial<CalendarEvent>) {
			const serverEvent = await updateServerEvent(id, changes);
			events = events.map((e) => (e.id === id ? serverEvent : e));
			syncPausedEvent('update', serverEvent);
		},

		async deleteEvent(id: string) {
			await deleteServerEvent(id);
			events = events.filter((e) => e.id !== id);
			pausedEvents = pausedEvents.filter((e) => e.id !== id);
		},

		// Pause an external event/series (creates the pause row keyed by
		// subscription + base uid; idempotent when already paused)
		async pauseExternalEvent(event: ExternalEvent) {
			const pause = await pauseServerExternalEvent(event.subscription, event.uid, event.title);
			if (!externalPauses.some((p) => p.id === pause.id)) {
				externalPauses = [...externalPauses, pause].sort((a, b) =>
					(a.title || '').localeCompare(b.title || '')
				);
			}
		},

		// Resume a paused external event/series (deletes the pause row)
		async resumeExternalEvent(pauseId: string) {
			await resumeServerExternalEvent(pauseId);
			externalPauses = externalPauses.filter((p) => p.id !== pauseId);
		},

		// Whether this external event (or its recurring series) is paused
		isExternalEventPaused(event: ExternalEvent): boolean {
			const key = `${event.subscription}|${baseIcalUid(event.uid)}`;
			return externalPauses.some((p) => `${p.subscription}|${p.ical_uid}` === key);
		},

		// Toggle task completion with flexible timing cascade
		async toggleTaskComplete(id: string) {
			const event = events.find((e) => e.id === id);
			if (!event?.is_task) return;

			try {
				const completed_at = event.completed_at ? undefined : new Date().toISOString();
				await this.updateEvent(id, { completed_at });

				// Flexible timing cascade for routine steps
				if (event.routine_template && event.routine_step_index !== undefined) {
					const routineTemplate = routinesStore.getById(event.routine_template);
					if (!routineTemplate) return;

					const routineSteps = routineTemplate.steps;
					const currentStepIdx = event.routine_step_index;

					// Find all events for this routine today, sorted by step index
					const routineEvents = events
						.filter(
							(e) =>
								e.routine_template === event.routine_template &&
								e.start_time &&
								new Date(e.start_time).toDateString() === new Date(event.start_time).toDateString()
						)
						.sort((a, b) => (a.routine_step_index ?? 0) - (b.routine_step_index ?? 0));

					if (completed_at) {
						// Completing: shift subsequent flexible steps from completion time
						let cursor = new Date(completed_at);

						for (let i = currentStepIdx + 1; i < routineSteps.length; i++) {
							const step = routineSteps[i];
							if (step.timing_mode !== 'flexible') break;

							const nextEvent = routineEvents.find((e) => e.routine_step_index === i);
							if (!nextEvent) continue;

							const duration = (step.duration_minutes || 15) * 60000;
							const newStart = cursor.toISOString();
							const newEnd = new Date(cursor.getTime() + duration).toISOString();

							await this.updateEvent(nextEvent.id, {
								start_time: newStart,
								end_time: newEnd
							});

							cursor = new Date(cursor.getTime() + duration);
						}
					} else {
						// Uncompleting: revert subsequent flexible steps to original calculated times
						const scheduleTime = routineTemplate.schedule.time;
						const [hStr, mStr] = scheduleTime.split(':');
						const baseDate = new Date(event.start_time);
						let cursor = new Date(
							baseDate.getFullYear(),
							baseDate.getMonth(),
							baseDate.getDate(),
							parseInt(hStr, 10),
							parseInt(mStr, 10),
							0
						);

						// Walk from step 0 to rebuild original times
						for (let i = 0; i < routineSteps.length; i++) {
							const step = routineSteps[i];
							const duration = (step.duration_minutes || 15) * 60000;

							if (i > currentStepIdx && step.timing_mode === 'flexible') {
								const nextEvent = routineEvents.find((e) => e.routine_step_index === i);
								if (nextEvent) {
									await this.updateEvent(nextEvent.id, {
										start_time: cursor.toISOString(),
										end_time: new Date(cursor.getTime() + duration).toISOString()
									});
								}
							}

							cursor = new Date(cursor.getTime() + duration);
						}
					}
				}
			} catch (error) {
				console.error('Failed to toggle task completion:', error);
				const t = get(_);
				toast.error(t('errors.generic'));
			}
		}
	};
}

export const calendar = createCalendarStore();
