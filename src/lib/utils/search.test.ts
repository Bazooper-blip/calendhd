import { describe, it, expect, beforeEach } from 'vitest';
import { setTimezone } from './date';
import { buildSearchResults } from './search';
import type { CalendarEvent, ExternalEvent, ExternalEventPause } from '$types';

beforeEach(() => {
	setTimezone('UTC');
});

// Wednesday 2026-09-23 12:00Z
const NOW = new Date('2026-09-23T12:00:00.000Z');

function localEvent(overrides: Partial<CalendarEvent> = {}): CalendarEvent {
	return {
		id: 'ev1',
		created: '',
		updated: '',
		user: 'u1',
		title: 'Dentist',
		start_time: '2026-09-25T10:00:00.000Z',
		end_time: '2026-09-25T11:00:00.000Z',
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
		title: 'School play',
		start_time: '2026-10-02T17:00:00.000Z',
		end_time: '2026-10-02T18:30:00.000Z',
		is_all_day: false,
		...overrides
	};
}

describe('buildSearchResults', () => {
	it('maps a one-off future event into the upcoming group at its own start', () => {
		const [r] = buildSearchResults({ events: [localEvent()], externalEvents: [], now: NOW });
		expect(r.event_id).toBe('ev1');
		expect(r.upcoming).toBe(true);
		expect(r.when.toISOString()).toBe('2026-09-25T10:00:00.000Z');
		expect(r.end?.toISOString()).toBe('2026-09-25T11:00:00.000Z');
		expect(r.is_recurring).toBe(false);
		expect(r.is_external).toBe(false);
	});

	it('puts a finished event in the earlier group', () => {
		const [r] = buildSearchResults({
			events: [
				localEvent({
					start_time: '2026-09-01T10:00:00.000Z',
					end_time: '2026-09-01T11:00:00.000Z'
				})
			],
			externalEvents: [],
			now: NOW
		});
		expect(r.upcoming).toBe(false);
	});

	it('keeps an event that is happening right now in the upcoming group', () => {
		const [r] = buildSearchResults({
			events: [
				localEvent({
					start_time: '2026-09-23T11:30:00.000Z',
					end_time: '2026-09-23T12:30:00.000Z'
				})
			],
			externalEvents: [],
			now: NOW
		});
		expect(r.upcoming).toBe(true);
	});

	it('treats an all-day event today as upcoming until the day ends', () => {
		const [r] = buildSearchResults({
			events: [
				localEvent({
					start_time: '2026-09-23T00:00:00.000Z',
					end_time: undefined,
					is_all_day: true
				})
			],
			externalEvents: [],
			now: NOW
		});
		expect(r.upcoming).toBe(true);
	});

	it('shows a recurring series at its next occurrence from today', () => {
		const [r] = buildSearchResults({
			events: [
				localEvent({
					// Seed on a Tuesday weeks ago, weekly → next is Tue 2026-09-29
					start_time: '2026-08-04T09:00:00.000Z',
					end_time: '2026-08-04T09:45:00.000Z',
					recurrence_rule: { frequency: 'weekly' }
				})
			],
			externalEvents: [],
			now: NOW
		});
		expect(r.is_recurring).toBe(true);
		expect(r.upcoming).toBe(true);
		expect(r.when.toISOString()).toBe('2026-09-29T09:00:00.000Z');
		expect(r.end?.toISOString()).toBe('2026-09-29T09:45:00.000Z');
	});

	it("uses today's occurrence when it is still ongoing", () => {
		const [r] = buildSearchResults({
			events: [
				localEvent({
					// Daily at 11:30Z for 1h — today's occurrence runs until 12:30Z
					start_time: '2026-09-01T11:30:00.000Z',
					end_time: '2026-09-01T12:30:00.000Z',
					recurrence_rule: { frequency: 'daily' }
				})
			],
			externalEvents: [],
			now: NOW
		});
		expect(r.when.toISOString()).toBe('2026-09-23T11:30:00.000Z');
		expect(r.upcoming).toBe(true);
	});

	it('falls back to the last occurrence of a series that has ended', () => {
		const [r] = buildSearchResults({
			events: [
				localEvent({
					start_time: '2026-06-01T09:00:00.000Z',
					end_time: '2026-06-01T10:00:00.000Z',
					recurrence_rule: { frequency: 'weekly', count: 3 } // Jun 1, 8, 15
				})
			],
			externalEvents: [],
			now: NOW
		});
		expect(r.is_recurring).toBe(true);
		expect(r.upcoming).toBe(false);
		expect(r.when.toISOString()).toBe('2026-06-15T09:00:00.000Z');
	});

	it('flags paused events instead of hiding them', () => {
		const [r] = buildSearchResults({
			events: [localEvent({ is_paused: true, recurrence_rule: { frequency: 'weekly' } })],
			externalEvents: [],
			now: NOW
		});
		expect(r.is_paused).toBe(true);
	});

	it('maps external events with their subscription name and colour', () => {
		const ext = {
			...externalEvent(),
			expand: { subscription: { name: 'School', color_override: '#123456' } }
		} as unknown as ExternalEvent;
		const [r] = buildSearchResults({ events: [], externalEvents: [ext], now: NOW });
		expect(r.is_external).toBe(true);
		expect(r.subscription_name).toBe('School');
		expect(r.color).toBe('#123456');
		expect(r.event_id).toBe('ext1');
	});

	it('orders upcoming soonest-first, then earlier most-recent-first', () => {
		const results = buildSearchResults({
			events: [
				localEvent({ id: 'far', start_time: '2026-11-01T10:00:00.000Z', end_time: undefined }),
				localEvent({ id: 'old', start_time: '2026-01-01T10:00:00.000Z', end_time: undefined }),
				localEvent({ id: 'soon', start_time: '2026-09-24T10:00:00.000Z', end_time: undefined }),
				localEvent({ id: 'recent', start_time: '2026-09-20T10:00:00.000Z', end_time: undefined })
			],
			externalEvents: [],
			now: NOW
		});
		expect(results.map((r) => r.event_id)).toEqual(['soon', 'far', 'recent', 'old']);
	});

	it('collapses occurrences of one external series into a single row at the nearest one', () => {
		const series = (id: string, day: string) =>
			externalEvent({
				id,
				uid: `swim@example.com::${day.replace(/-/g, '')}T100000`,
				start_time: `${day}T10:00:00.000Z`,
				end_time: `${day}T11:00:00.000Z`
			});
		const results = buildSearchResults({
			events: [],
			externalEvents: [
				series('a', '2026-09-16'),
				series('b', '2026-09-30'),
				series('c', '2026-10-07'),
				externalEvent({ id: 'other', uid: 'gym@example.com', title: 'Gym' })
			],
			now: NOW
		});
		expect(results.map((r) => r.event_id).sort()).toEqual(['b', 'other']);
		const swim = results.find((r) => r.event_id === 'b');
		expect(swim?.is_recurring).toBe(true);
		expect(swim?.when.toISOString()).toBe('2026-09-30T10:00:00.000Z');
		expect(results.find((r) => r.event_id === 'other')?.is_recurring).toBe(false);
	});

	it('shows a finished external series at its last occurrence', () => {
		const results = buildSearchResults({
			events: [],
			externalEvents: [
				externalEvent({ id: 'a', uid: 'x::20260101T100000', start_time: '2026-01-01T10:00:00.000Z', end_time: undefined }),
				externalEvent({ id: 'b', uid: 'x::20260201T100000', start_time: '2026-02-01T10:00:00.000Z', end_time: undefined })
			],
			now: NOW
		});
		expect(results).toHaveLength(1);
		expect(results[0].event_id).toBe('b');
		expect(results[0].upcoming).toBe(false);
	});

	it('flags a paused external series and carries the pause id', () => {
		const pause: ExternalEventPause = {
			id: 'pause1',
			created: '',
			updated: '',
			user: 'u1',
			subscription: 'sub1',
			ical_uid: 'swim@example.com'
		};
		const [r] = buildSearchResults({
			events: [],
			externalEvents: [externalEvent({ uid: 'swim@example.com::20261002T170000' })],
			externalPauses: [pause],
			now: NOW
		});
		expect(r.is_paused).toBe(true);
		expect(r.pause_id).toBe('pause1');
	});
});
