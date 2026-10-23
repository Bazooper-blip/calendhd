import { describe, it, expect, beforeEach } from 'vitest';
import { setTimezone } from './date';
import { buildWeekListDays } from './weekList';
import type { DisplayEvent } from '#types';

beforeEach(() => {
	setTimezone('UTC');
});

const at = (day: number, h: number, m = 0) => new Date(Date.UTC(2026, 9, day, h, m));
const days = [19, 20, 21, 22, 23, 24, 25].map((d) => at(d, 0));

function ev(overrides: Partial<DisplayEvent> = {}): DisplayEvent {
	return {
		id: 'ev1',
		title: 'Event',
		start: at(21, 9),
		end: at(21, 10),
		is_all_day: false,
		is_task: false,
		is_completed: false,
		color: '#7C9885',
		is_external: false,
		original_event: {} as DisplayEvent['original_event'],
		...overrides
	};
}

const build = (events: DisplayEvent[], now = at(23, 12)) =>
	buildWeekListDays({ events, days, now, routineFallback: 'Routine' });

describe('buildWeekListDays', () => {
	it('returns one entry per day, empty days included', () => {
		const out = build([]);
		expect(out).toHaveLength(7);
		expect(out.every((d) => d.allDay.length === 0 && d.items.length === 0)).toBe(true);
	});

	it('puts events on their start day, all-day separately, timed sorted by start', () => {
		const out = build([
			ev({ id: 'late', start: at(21, 15), end: at(21, 16) }),
			ev({ id: 'early', start: at(21, 8), end: at(21, 9) }),
			ev({ id: 'bins', is_all_day: true, start: at(21, 0), end: undefined })
		]);
		expect(out[2].allDay.map((e) => e.id)).toEqual(['bins']);
		expect(out[2].items.map((i) => (i.kind === 'event' ? i.event.id : ''))).toEqual([
			'early',
			'late'
		]);
		expect(out[1].items).toHaveLength(0);
	});

	it('collapses routine steps into one line with progress', () => {
		const step = (id: string, h: number, done: boolean) =>
			ev({
				id,
				title: id,
				start: at(22, h),
				end: at(22, h, 30),
				routine_template: 'r1',
				routine_group_name: 'Morning routine',
				is_completed: done
			});
		const out = build([step('b', 8, false), step('a', 7, true), step('c', 9, true)]);
		expect(out[3].items).toHaveLength(1);
		const item = out[3].items[0];
		expect(item.kind).toBe('routine');
		if (item.kind !== 'routine') return;
		expect(item.name).toBe('Morning routine');
		expect(item.done).toBe(2);
		expect(item.total).toBe(3);
		expect(item.start).toEqual(at(22, 7));
		expect(item.end).toEqual(at(22, 9, 30));
	});

	it('falls back to the routine label when a group has no name', () => {
		const out = build([ev({ routine_template: 'r1', start: at(22, 7), end: at(22, 8) })]);
		const item = out[3].items[0];
		expect(item.kind === 'routine' && item.name).toBe('Routine');
	});

	it('marks past, now, the single next item today, and later items', () => {
		const out = build([
			ev({ id: 'yesterday', start: at(22, 15), end: at(22, 16) }),
			ev({ id: 'morning', start: at(23, 8), end: at(23, 9) }),
			ev({ id: 'current', start: at(23, 11, 30), end: at(23, 12, 30) }),
			ev({ id: 'next', start: at(23, 14), end: at(23, 15) }),
			ev({ id: 'evening', start: at(23, 18), end: at(23, 19) }),
			ev({ id: 'tomorrow', start: at(24, 9), end: at(24, 10) })
		]);
		const status = (i: number) =>
			Object.fromEntries(
				out[i].items.map((it) => [it.kind === 'event' ? it.event.id : '', it.status])
			);
		expect(status(3)).toEqual({ yesterday: 'past' });
		expect(status(4)).toEqual({
			morning: 'past',
			current: 'now',
			next: 'next',
			evening: 'upcoming'
		});
		expect(status(5)).toEqual({ tomorrow: 'upcoming' });
	});

	it('treats an event without an end as a one-minute point in time', () => {
		const out = build([ev({ start: at(23, 11, 59), end: undefined })], at(23, 12));
		expect(out[4].items[0].status).toBe('past');
	});

	it('never marks a next item on a day other than today', () => {
		const out = build([ev({ start: at(24, 9), end: at(24, 10) })], at(23, 22));
		expect(out[5].items[0].status).toBe('upcoming');
	});
});
