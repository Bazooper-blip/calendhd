import { endOfDay } from 'date-fns';
import type {
	CalendarEvent,
	CalendarSubscription,
	DisplayEvent,
	ExternalEvent,
	ExternalEventPause
} from '$types';
import { isSameDay } from './date';
import { baseIcalUid } from './externalEvents';
import { expandRecurrenceRule } from './recurrence';

export const DEFAULT_LOCAL_EVENT_COLOR = '#7C9885'; // sage green
export const DEFAULT_EXTERNAL_EVENT_COLOR = '#9A88B5'; // lavender

export interface BuildDisplayEventsInput {
	events: CalendarEvent[];
	externalEvents: ExternalEvent[];
	externalPauses: ExternalEventPause[];
	/** Occurrences of recurring seeds are expanded into this window. */
	range: { start: Date; end: Date };
	/** Resolves a routine template id to its display name. */
	routineName?: (templateId: string) => string | undefined;
}

// Turn raw PocketBase rows into the expanded, merged, sorted list the
// calendar views render. Pure: the calendar store calls it for the view
// range, and the /now screen calls it for today's window independently of
// where the user is browsing.
export function buildDisplayEvents(input: BuildDisplayEventsInput): DisplayEvent[] {
	const { events, externalEvents, externalPauses, range, routineName } = input;
	const allEvents: DisplayEvent[] = [];

	// Local events (paused events are hidden from every view). Events with a
	// recurrence_rule are expanded into one DisplayEvent per occurrence in the
	// range — the single stored row is the seed of the series (external iCal
	// recurrences are instead materialized into rows by the sync hook, so they
	// take the plain path below).
	for (const event of events) {
		if (event.is_paused) continue;
		const seedStart = new Date(event.start_time);
		const seedEnd = event.end_time ? new Date(event.end_time) : undefined;
		// Guard against corrupted rows where end precedes start — a negative
		// duration would place occurrence ends in the past.
		const durationMs = seedEnd ? Math.max(0, seedEnd.getTime() - seedStart.getTime()) : 0;
		const occurrenceStarts = event.recurrence_rule?.frequency
			? expandRecurrenceRule(event.recurrence_rule, seedStart, range.start, range.end)
			: [seedStart];
		for (const start of occurrenceStarts) {
			const isSeedOccurrence = start.getTime() === seedStart.getTime();
			allEvents.push({
				// Virtual occurrences need their own id for keyed {#each} blocks;
				// anything that mutates the record must go through
				// original_event.id instead.
				id: isSeedOccurrence ? event.id : `${event.id}::r${start.getTime()}`,
				title: event.title,
				start,
				end: isSeedOccurrence
					? seedEnd
					: seedEnd && durationMs > 0
						? new Date(start.getTime() + durationMs)
						: undefined,
				is_all_day: event.is_all_day,
				is_task: event.is_task || false,
				// Recurring tasks: completion is per-day ("did I do it today?")
				// since a single row backs the whole series.
				is_completed: event.recurrence_rule?.frequency
					? !!event.completed_at && isSameDay(new Date(event.completed_at), start)
					: !!event.completed_at,
				color: event.color_override || DEFAULT_LOCAL_EVENT_COLOR,
				icon: event.icon,
				is_external: false,
				routine_template: event.routine_template,
				routine_step_index: event.routine_step_index,
				energy_level: event.energy_level,
				routine_group_name: event.routine_template ? routineName?.(event.routine_template) : undefined,
				original_event: event
			});
		}
	}

	// External events (paused series are hidden from every view; pause rows
	// are keyed by subscription + BASE uid)
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
			color: subscription?.color_override || DEFAULT_EXTERNAL_EVENT_COLOR,
			is_external: true,
			subscription_name: subscription?.name,
			original_event: event
		});
	}

	return resolveOpenEndedEvents(allEvents.sort((a, b) => a.start.getTime() - b.start.getTime()));
}

// Open-ended events ("starts 12:30, no idea how long") get a resolved end so
// every view agrees on when they stop counting as "now": the next timed
// event's start that day, or end of day, whichever comes first. Local events
// with NO stored end_time only — an external (iCal) event without DTEND is
// zero-length by spec, and a row whose stored end precedes its start (data
// entry slip) keeps the plain 1h-default rendering rather than being
// promoted to "ongoing". Expects the list sorted by start.
export function resolveOpenEndedEvents(events: DisplayEvent[]): DisplayEvent[] {
	return events.map((event, i) => {
		if (event.is_all_day || event.is_external || event.end) return event;
		if (event.original_event.end_time) return event;
		let end = endOfDay(event.start);
		for (let j = i + 1; j < events.length; j++) {
			const next = events[j];
			if (!isSameDay(next.start, event.start)) break;
			if (next.is_all_day || next.start.getTime() <= event.start.getTime()) continue;
			end = next.start;
			break;
		}
		return { ...event, end, is_open_ended: true };
	});
}
