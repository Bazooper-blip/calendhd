import { describe, it, expect, beforeEach } from 'vitest';
import { setTimezone } from './date';
import { buildDisplayEvents, resolveOpenEndedEvents } from './displayEvents';
import type { CalendarEvent, ExternalEvent, ExternalEventPause } from '$types';

beforeEach(() => {
	setTimezone('UTC');
});

function localEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
	return {
		id: 'ev1',
		created: '',
		updated: '',
		user: 'u1',
		title: 'Local',
		start_time: '2026-09-01T10:00:00.000Z',
		end_time: '2026-09-01T11:00:00.000Z',
		is_all_day: false,
		reminders: [],
		...overrides
	};
}

function externalEvent(overrides: Partial<ExternalEvent> = {}): ExternalEvent {
	return {
		id: 'ext1',
		created: '',
		updated: '',
		user: 'u1',
		subscription: 'sub1',
		uid: 'abc@example.com',
		title: 'External',
		start_time: '2026-09-01T12:00:00.000Z',
		end_time: '2026-09-01T13:00:00.000Z',
		is_all_day: false,
		...overrides
	};
}

const range = {
	start: new Date('2026-09-01T00:00:00.000Z'),
	end: new Date('2026-09-01T23:59:59.999Z')
};

describe('buildDisplayEvents', () => {
	it('maps a plain local event and keeps its record id', () => {
		const out = buildDisplayEvents({
			events: [localEvent()],
			externalEvents: [],
			externalPauses: [],
			range
		});
		expect(out).toHaveLength(1);
		expect(out[0].id).toBe('ev1');
		expect(out[0].is_external).toBe(false);
		expect(out[0].start.toISOString()).toBe('2026-09-01T10:00:00.000Z');
		expect(out[0].end?.toISOString()).toBe('2026-09-01T11:00:00.000Z');
		expect(out[0].color).toBe('#7C9885');
	});

	it('hides paused local events', () => {
		const out = buildDisplayEvents({
			events: [localEvent({ is_paused: true })],
			externalEvents: [],
			externalPauses: [],
			range
		});
		expect(out).toHaveLength(0);
	});

	it('expands recurring seeds into per-occurrence ids inside the range', () => {
		const weekRange = {
			start: new Date('2026-09-07T00:00:00.000Z'),
			end: new Date('2026-09-13T23:59:59.999Z')
		};
		const out = buildDisplayEvents({
			events: [localEvent({ recurrence_rule: { frequency: 'daily' } })],
			externalEvents: [],
			externalPauses: [],
			range: weekRange
		});
		expect(out).toHaveLength(7);
		// Virtual occurrences get a distinct id but point at the seed record
		expect(out[0].id).toBe(`ev1::r${new Date('2026-09-07T10:00:00.000Z').getTime()}`);
		expect(out[0].original_event.id).toBe('ev1');
		expect(out[0].end?.toISOString()).toBe('2026-09-07T11:00:00.000Z');
	});

	it('marks recurring task occurrences complete only on the completed day', () => {
		const twoDays = {
			start: new Date('2026-09-01T00:00:00.000Z'),
			end: new Date('2026-09-02T23:59:59.999Z')
		};
		const out = buildDisplayEvents({
			events: [
				localEvent({
					is_task: true,
					recurrence_rule: { frequency: 'daily' },
					completed_at: '2026-09-02T10:30:00.000Z'
				})
			],
			externalEvents: [],
			externalPauses: [],
			range: twoDays
		});
		expect(out.map((e) => e.is_completed)).toEqual([false, true]);
	});

	it('maps external events with the subscription colour and name', () => {
		const ext = externalEvent() as ExternalEvent & {
			expand?: { subscription?: { name: string; color_override?: string } };
		};
		ext.expand = { subscription: { name: 'Work', color_override: '#123456' } };
		const out = buildDisplayEvents({
			events: [],
			externalEvents: [ext],
			externalPauses: [],
			range
		});
		expect(out).toHaveLength(1);
		expect(out[0].is_external).toBe(true);
		expect(out[0].color).toBe('#123456');
		expect(out[0].subscription_name).toBe('Work');
	});

	it('hides external series paused by base ical uid', () => {
		const pause: ExternalEventPause = {
			id: 'p1',
			created: '',
			updated: '',
			user: 'u1',
			subscription: 'sub1',
			ical_uid: 'abc@example.com'
		};
		const out = buildDisplayEvents({
			events: [],
			externalEvents: [externalEvent({ uid: 'abc@example.com::20260901T120000' })],
			externalPauses: [pause],
			range
		});
		expect(out).toHaveLength(0);
	});

	it('resolves routine group names through the lookup', () => {
		const out = buildDisplayEvents({
			events: [localEvent({ routine_template: 'rt1', routine_step_index: 0 })],
			externalEvents: [],
			externalPauses: [],
			range,
			routineName: (id) => (id === 'rt1' ? 'Morning' : undefined)
		});
		expect(out[0].routine_group_name).toBe('Morning');
	});

	it('sorts everything by start time', () => {
		const out = buildDisplayEvents({
			events: [localEvent({ id: 'late', start_time: '2026-09-01T15:00:00.000Z', end_time: '2026-09-01T16:00:00.000Z' })],
			externalEvents: [externalEvent()],
			externalPauses: [],
			range
		});
		expect(out.map((e) => e.id)).toEqual(['ext1', 'late']);
	});

	it('resolves an open-ended local event to the next timed event that day', () => {
		const out = buildDisplayEvents({
			events: [
				localEvent({ id: 'open', start_time: '2026-09-01T10:00:00.000Z', end_time: undefined }),
				localEvent({ id: 'next', start_time: '2026-09-01T12:00:00.000Z', end_time: '2026-09-01T13:00:00.000Z' })
			],
			externalEvents: [],
			externalPauses: [],
			range
		});
		const open = out.find((e) => e.id === 'open');
		expect(open?.is_open_ended).toBe(true);
		expect(open?.end?.toISOString()).toBe('2026-09-01T12:00:00.000Z');
		expect(out.find((e) => e.id === 'next')?.is_open_ended).toBeUndefined();
	});

	it('resolves a lone open-ended event to end of day', () => {
		const out = buildDisplayEvents({
			events: [localEvent({ start_time: '2026-09-01T10:00:00.000Z', end_time: undefined })],
			externalEvents: [],
			externalPauses: [],
			range
		});
		expect(out[0].is_open_ended).toBe(true);
		expect(out[0].end).toBeDefined();
		// endOfDay() is machine-local, so only assert the shape: later than
		// the start and within the same 24h.
		const span = out[0].end!.getTime() - out[0].start.getTime();
		expect(span).toBeGreaterThan(0);
		expect(span).toBeLessThanOrEqual(24 * 60 * 60 * 1000);
	});

	it('leaves external and all-day events without an end alone', () => {
		const out = buildDisplayEvents({
			events: [localEvent({ id: 'allday', is_all_day: true, end_time: undefined })],
			externalEvents: [externalEvent({ end_time: undefined })],
			externalPauses: [],
			range
		});
		expect(out.every((e) => !e.is_open_ended && e.end === undefined)).toBe(true);
	});
});

describe('resolveOpenEndedEvents', () => {
	it('does not promote a corrupted seed (end before start) to open-ended', () => {
		const weekRange = {
			start: new Date('2026-09-07T00:00:00.000Z'),
			end: new Date('2026-09-13T23:59:59.999Z')
		};
		const out = buildDisplayEvents({
			events: [
				localEvent({
					start_time: '2026-08-24T05:40:00.000Z',
					end_time: '2026-08-20T06:00:00.000Z',
					recurrence_rule: { frequency: 'weekly' }
				})
			],
			externalEvents: [],
			externalPauses: [],
			range: weekRange
		});
		expect(out).toHaveLength(1);
		expect(out[0].is_open_ended).toBeUndefined();
		expect(out[0].end).toBeUndefined();
	});

	it('skips all-day and same-start neighbours when looking for the next event', () => {
		const base = buildDisplayEvents({
			events: [
				localEvent({ id: 'open', start_time: '2026-09-01T10:00:00.000Z', end_time: undefined }),
				localEvent({ id: 'same', start_time: '2026-09-01T10:00:00.000Z', end_time: '2026-09-01T10:30:00.000Z' }),
				localEvent({ id: 'allday', is_all_day: true, start_time: '2026-09-01T10:30:00.000Z', end_time: undefined }),
				localEvent({ id: 'later', start_time: '2026-09-01T14:00:00.000Z', end_time: '2026-09-01T15:00:00.000Z' })
			],
			externalEvents: [],
			externalPauses: [],
			range
		});
		const open = resolveOpenEndedEvents(base).find((e) => e.id === 'open');
		expect(open?.end?.toISOString()).toBe('2026-09-01T14:00:00.000Z');
	});
});
