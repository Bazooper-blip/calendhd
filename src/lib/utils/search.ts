import { addYears, endOfDay, startOfDay } from 'date-fns';
import type {
	CalendarEvent,
	CalendarSubscription,
	ExternalEvent,
	ExternalEventPause,
	RecurrenceRule
} from '$types';
import { baseIcalUid } from './externalEvents';
import { DEFAULT_EXTERNAL_EVENT_COLOR, DEFAULT_LOCAL_EVENT_COLOR } from './displayEvents';
import { expandRecurrenceRule } from './recurrence';

// One row in the search results. `when` is the date the row is shown at and
// the date the calendar jumps to when the row is tapped: the event's own
// start for one-off events, the next occurrence (from today) for recurring
// series, or the series' last occurrence once it has ended.
export interface SearchResult {
	id: string;
	event_id: string;
	title: string;
	when: Date;
	end?: Date;
	is_all_day: boolean;
	is_external: boolean;
	is_recurring: boolean;
	is_paused: boolean;
	/** Set for paused external series: the external_event_pauses row to resume. */
	pause_id?: string;
	recurrence_rule?: RecurrenceRule;
	subscription_name?: string;
	color: string;
	icon?: string;
	/** Still relevant: ends (or starts) at or after `now`. */
	upcoming: boolean;
}

export interface BuildSearchResultsInput {
	events: CalendarEvent[];
	externalEvents: ExternalEvent[];
	/** Paused external series; matching results are flagged rather than hidden. */
	externalPauses?: ExternalEventPause[];
	now: Date;
}

// How far ahead to look for the next occurrence of a recurring series before
// giving up and showing its last occurrence instead.
const LOOKAHEAD_YEARS = 2;

// Pure: rows already matched server-side → the sorted list the search modal
// renders. Upcoming results come first, soonest first; earlier results follow,
// most recent first, so "when is the dentist?" answers itself at the top.
export function buildSearchResults(input: BuildSearchResultsInput): SearchResult[] {
	const { events, externalEvents, externalPauses = [], now } = input;
	const results: SearchResult[] = [];

	for (const event of events) {
		const seedStart = new Date(event.start_time);
		const seedEnd = event.end_time ? new Date(event.end_time) : undefined;
		const durationMs = seedEnd ? Math.max(0, seedEnd.getTime() - seedStart.getTime()) : 0;
		const rule = event.recurrence_rule?.frequency ? event.recurrence_rule : undefined;

		let when = seedStart;
		if (rule) {
			when = resolveSeriesDate(rule, seedStart, durationMs, event.is_all_day, now);
		}
		const isSeed = when.getTime() === seedStart.getTime();
		const end = isSeed
			? seedEnd
			: seedEnd && durationMs > 0
				? new Date(when.getTime() + durationMs)
				: undefined;

		results.push({
			id: event.id,
			event_id: event.id,
			title: event.title,
			when,
			end,
			is_all_day: event.is_all_day,
			is_external: false,
			is_recurring: !!rule,
			is_paused: !!event.is_paused,
			recurrence_rule: rule,
			color: event.color_override || DEFAULT_LOCAL_EVENT_COLOR,
			icon: event.icon,
			upcoming: isUpcoming(when, end, event.is_all_day, now)
		});
	}

	// External recurrences arrive as one materialised row per occurrence
	// (sync expands them). Collapse each series — keyed like pauses, by
	// subscription + BASE uid — into one row at its nearest occurrence so a
	// weekly feed event doesn't drown the list in 100 identical hits.
	const pauseByKey = new Map(externalPauses.map((p) => [`${p.subscription}|${p.ical_uid}`, p]));
	const series = new Map<string, ExternalEvent[]>();
	for (const event of externalEvents) {
		const key = `${event.subscription}|${baseIcalUid(event.uid)}`;
		const group = series.get(key);
		if (group) group.push(event);
		else series.set(key, [event]);
	}
	for (const [key, group] of series) {
		const event = pickNearestExternal(group, now);
		const subscription = (
			event as ExternalEvent & { expand?: { subscription?: CalendarSubscription } }
		).expand?.subscription;
		const when = new Date(event.start_time);
		const end = event.end_time ? new Date(event.end_time) : undefined;
		const pause = pauseByKey.get(key);
		results.push({
			id: event.id,
			event_id: event.id,
			title: event.title,
			when,
			end,
			is_all_day: event.is_all_day,
			is_external: true,
			is_recurring: group.length > 1,
			is_paused: !!pause,
			pause_id: pause?.id,
			subscription_name: subscription?.name,
			color: subscription?.color_override || DEFAULT_EXTERNAL_EVENT_COLOR,
			upcoming: isUpcoming(when, end, event.is_all_day, now)
		});
	}

	return results.sort((a, b) => {
		if (a.upcoming !== b.upcoming) return a.upcoming ? -1 : 1;
		return a.upcoming ? a.when.getTime() - b.when.getTime() : b.when.getTime() - a.when.getTime();
	});
}

function isUpcoming(when: Date, end: Date | undefined, isAllDay: boolean, now: Date): boolean {
	if (isAllDay) return endOfDay(when) >= now;
	return (end ?? when) >= now;
}

// The occurrence a recurring series is "at" relative to now: today's if it is
// still ongoing, else the next one, else (series over) the last one.
function resolveSeriesDate(
	rule: RecurrenceRule,
	seedStart: Date,
	durationMs: number,
	isAllDay: boolean,
	now: Date
): Date {
	const fromToday = expandRecurrenceRule(
		rule,
		seedStart,
		startOfDay(now),
		addYears(now, LOOKAHEAD_YEARS)
	);
	for (const start of fromToday) {
		const end = durationMs > 0 ? new Date(start.getTime() + durationMs) : undefined;
		if (isUpcoming(start, end, isAllDay, now)) return start;
	}
	if (fromToday.length > 0) return fromToday[0];

	const past = expandRecurrenceRule(rule, seedStart, seedStart, now);
	return past.length > 0 ? past[past.length - 1] : seedStart;
}

// Same rule as resolveSeriesDate, for already-materialised external rows:
// the soonest still-relevant occurrence, else the most recent past one.
function pickNearestExternal(group: ExternalEvent[], now: Date): ExternalEvent {
	let best: ExternalEvent | undefined;
	let bestPast: ExternalEvent | undefined;
	for (const event of group) {
		const start = new Date(event.start_time);
		const end = event.end_time ? new Date(event.end_time) : undefined;
		if (isUpcoming(start, end, event.is_all_day, now)) {
			if (!best || start < new Date(best.start_time)) best = event;
		} else if (!bestPast || start > new Date(bestPast.start_time)) {
			bestPast = event;
		}
	}
	return best ?? bestPast ?? group[0];
}
