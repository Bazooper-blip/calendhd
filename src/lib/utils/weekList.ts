import type { DisplayEvent } from '#types';
import { isSameDay } from './date';

// past: already over · now: happening · next: the first item still to come
// today (only one per week) · upcoming: everything later
export type WeekListStatus = 'past' | 'now' | 'next' | 'upcoming';

export type WeekListItem =
	| { kind: 'event'; event: DisplayEvent; start: Date; end?: Date; status: WeekListStatus }
	| {
			kind: 'routine';
			routine_template: string;
			name: string;
			color: string;
			icon?: string;
			start: Date;
			end?: Date;
			done: number;
			total: number;
			status: WeekListStatus;
	  };

// WeekListItem before its status is known (Omit distributed over the union)
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type UntaggedItem = DistributiveOmit<WeekListItem, 'status'>;

export interface WeekListDay {
	date: Date;
	allDay: DisplayEvent[];
	items: WeekListItem[];
}

// Display events → one row per day for the week list view: all-day events
// apart, timed events sorted by start, routine steps collapsed into a single
// line with progress (same grouping as the week grid), each item tagged with
// its past/now/next status. Items without an end count as a one-minute point,
// matching AgendaView.
export function buildWeekListDays(input: {
	events: DisplayEvent[];
	days: Date[];
	now: Date;
	routineFallback: string;
}): WeekListDay[] {
	const { events, days, now, routineFallback } = input;
	let nextAssigned = false;

	return days.map((date) => {
		const dayEvents = events.filter((e) => isSameDay(e.start, date));
		const allDay = dayEvents.filter((e) => e.is_all_day);

		const untagged: UntaggedItem[] = [];
		const routineGroups = new Map<string, DisplayEvent[]>();
		for (const e of dayEvents) {
			if (e.is_all_day) continue;
			if (e.routine_template) {
				const group = routineGroups.get(e.routine_template);
				if (group) group.push(e);
				else routineGroups.set(e.routine_template, [e]);
			} else {
				untagged.push({ kind: 'event', event: e, start: e.start, end: e.end });
			}
		}
		for (const [templateId, group] of routineGroups) {
			const sorted = group.toSorted((a, b) => a.start.getTime() - b.start.getTime());
			const end = sorted.reduce<Date | undefined>(
				(max, e) => (e.end && (!max || e.end > max) ? e.end : max),
				undefined
			);
			untagged.push({
				kind: 'routine',
				routine_template: templateId,
				name: sorted[0].routine_group_name ?? routineFallback,
				color: sorted[0].color,
				icon: sorted[0].icon,
				start: sorted[0].start,
				end,
				done: sorted.filter((e) => e.is_completed).length,
				total: sorted.length
			});
		}
		untagged.sort((a, b) => a.start.getTime() - b.start.getTime());

		const items = untagged.map((item): WeekListItem => {
			const endMs = item.end ? item.end.getTime() : item.start.getTime() + 60_000;
			let status: WeekListStatus;
			if (endMs <= now.getTime()) status = 'past';
			else if (item.start <= now) status = 'now';
			else if (!nextAssigned && isSameDay(item.start, now)) {
				status = 'next';
				nextAssigned = true;
			} else status = 'upcoming';
			return { ...item, status } as WeekListItem;
		});

		return { date, allDay, items };
	});
}
