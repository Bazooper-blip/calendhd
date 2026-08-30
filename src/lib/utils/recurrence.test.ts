import { describe, it, expect } from 'vitest';
import { expandRecurrenceRule, formatRecurrenceRule, RECURRENCE_PRESETS } from './recurrence';
import type { RecurrenceRule } from '$types';

describe('formatRecurrenceRule', () => {
	it('formats daily', () => {
		expect(formatRecurrenceRule({ frequency: 'daily' })).toBe('Daily');
	});

	it('formats daily with interval', () => {
		expect(formatRecurrenceRule({ frequency: 'daily', interval: 3 })).toBe('Every 3 days');
	});

	it('formats every other day', () => {
		expect(formatRecurrenceRule({ frequency: 'every_other_day' })).toBe('Every other day');
	});

	it('formats weekly', () => {
		expect(formatRecurrenceRule({ frequency: 'weekly' })).toBe('Weekly');
	});

	it('formats weekly with interval', () => {
		expect(formatRecurrenceRule({ frequency: 'weekly', interval: 3 })).toBe('Every 3 weeks');
	});

	it('formats weekly with specific days', () => {
		const rule: RecurrenceRule = {
			frequency: 'weekly',
			days_of_week: [1, 3, 5] // Mon, Wed, Fri
		};
		expect(formatRecurrenceRule(rule)).toBe('Weekly on Mon, Wed, Fri');
	});

	it('formats weekly with interval and specific days', () => {
		const rule: RecurrenceRule = {
			frequency: 'weekly',
			interval: 2,
			days_of_week: [0, 6] // Sun, Sat
		};
		expect(formatRecurrenceRule(rule)).toBe('Every 2 weeks on Sun, Sat');
	});

	it('formats biweekly', () => {
		expect(formatRecurrenceRule({ frequency: 'biweekly' })).toBe('Every 2 weeks');
	});

	it('formats monthly', () => {
		expect(formatRecurrenceRule({ frequency: 'monthly' })).toBe('Monthly');
	});

	it('formats monthly with interval', () => {
		expect(formatRecurrenceRule({ frequency: 'monthly', interval: 3 })).toBe('Every 3 months');
	});

	it('formats yearly', () => {
		expect(formatRecurrenceRule({ frequency: 'yearly' })).toBe('Yearly');
	});

	it('formats yearly with interval', () => {
		expect(formatRecurrenceRule({ frequency: 'yearly', interval: 2 })).toBe('Every 2 years');
	});

	it('handles unknown frequency', () => {
		expect(formatRecurrenceRule({ frequency: 'custom' as RecurrenceRule['frequency'] })).toBe(
			'Custom'
		);
	});

	it('treats interval=1 same as no interval', () => {
		expect(formatRecurrenceRule({ frequency: 'daily', interval: 1 })).toBe('Daily');
		expect(formatRecurrenceRule({ frequency: 'weekly', interval: 1 })).toBe('Weekly');
		expect(formatRecurrenceRule({ frequency: 'monthly', interval: 1 })).toBe('Monthly');
		expect(formatRecurrenceRule({ frequency: 'yearly', interval: 1 })).toBe('Yearly');
	});

	it('ignores empty days_of_week array', () => {
		const rule: RecurrenceRule = {
			frequency: 'weekly',
			days_of_week: []
		};
		expect(formatRecurrenceRule(rule)).toBe('Weekly');
	});
});

describe('expandRecurrenceRule', () => {
	// Local-time constructor keeps tests timezone-agnostic (matches how
	// occurrences must preserve wall-clock time across DST).
	const d = (y: number, mo: number, day: number, h = 7, min = 40) =>
		new Date(y, mo - 1, day, h, min, 0, 0);

	it('expands weekly into the following week (the reported bug)', () => {
		// Idrott: seed Mon 2026-08-24, weekly — must appear Mon 2026-08-31
		const occ = expandRecurrenceRule(
			{ frequency: 'weekly' },
			d(2026, 8, 24),
			d(2026, 8, 31, 0, 0),
			d(2026, 9, 6, 23, 59)
		);
		expect(occ).toEqual([d(2026, 8, 31)]);
	});

	it('includes the seed occurrence when it falls in range', () => {
		const occ = expandRecurrenceRule(
			{ frequency: 'weekly' },
			d(2026, 8, 24),
			d(2026, 8, 23, 0, 0),
			d(2026, 8, 29, 23, 59)
		);
		expect(occ).toEqual([d(2026, 8, 24)]);
	});

	it('never yields occurrences before the seed start', () => {
		const occ = expandRecurrenceRule(
			{ frequency: 'daily' },
			d(2026, 8, 24),
			d(2026, 8, 20, 0, 0),
			d(2026, 8, 25, 23, 59)
		);
		expect(occ).toEqual([d(2026, 8, 24), d(2026, 8, 25)]);
	});

	it('expands daily with an interval', () => {
		const occ = expandRecurrenceRule(
			{ frequency: 'daily', interval: 3 },
			d(2026, 8, 24),
			d(2026, 8, 24, 0, 0),
			d(2026, 8, 31, 23, 59)
		);
		expect(occ).toEqual([d(2026, 8, 24), d(2026, 8, 27), d(2026, 8, 30)]);
	});

	it('expands every_other_day as a fixed 2-day step', () => {
		const occ = expandRecurrenceRule(
			{ frequency: 'every_other_day' },
			d(2026, 8, 24),
			d(2026, 8, 24, 0, 0),
			d(2026, 8, 29, 23, 59)
		);
		expect(occ).toEqual([d(2026, 8, 24), d(2026, 8, 26), d(2026, 8, 28)]);
	});

	it('expands biweekly as a fixed 2-week step', () => {
		const nextWeek = expandRecurrenceRule(
			{ frequency: 'biweekly' },
			d(2026, 8, 24),
			d(2026, 8, 31, 0, 0),
			d(2026, 9, 6, 23, 59)
		);
		expect(nextWeek).toEqual([]);
		const weekAfter = expandRecurrenceRule(
			{ frequency: 'biweekly' },
			d(2026, 8, 24),
			d(2026, 9, 7, 0, 0),
			d(2026, 9, 13, 23, 59)
		);
		expect(weekAfter).toEqual([d(2026, 9, 7)]);
	});

	it('expands monthly, clamping short months', () => {
		// Seed Jan 31 → Feb has no 31st in 2026, clamp to Feb 28
		const occ = expandRecurrenceRule(
			{ frequency: 'monthly' },
			d(2026, 1, 31),
			d(2026, 2, 1, 0, 0),
			d(2026, 3, 1, 0, 0)
		);
		expect(occ).toEqual([d(2026, 2, 28)]);
	});

	it('does not drift after clamping a short month', () => {
		// Jan 31 → Feb 28 (clamped) → Mar 31 again, not Mar 28
		const occ = expandRecurrenceRule(
			{ frequency: 'monthly' },
			d(2026, 1, 31),
			d(2026, 3, 1, 0, 0),
			d(2026, 3, 31, 23, 59)
		);
		expect(occ).toEqual([d(2026, 3, 31)]);
	});

	it('honors the week interval when days_of_week is set', () => {
		// Every 2 weeks on Mon+Wed, seeded Mon Aug 24: week of Aug 31 is skipped
		const occ = expandRecurrenceRule(
			{ frequency: 'weekly', interval: 2, days_of_week: [1, 3] },
			d(2026, 8, 24),
			d(2026, 8, 24, 0, 0),
			d(2026, 9, 9, 23, 59)
		);
		expect(occ).toEqual([d(2026, 8, 24), d(2026, 8, 26), d(2026, 9, 7), d(2026, 9, 9)]);
	});

	it('expands yearly', () => {
		const occ = expandRecurrenceRule(
			{ frequency: 'yearly' },
			d(2026, 8, 24),
			d(2027, 8, 1, 0, 0),
			d(2027, 8, 31, 23, 59)
		);
		expect(occ).toEqual([d(2027, 8, 24)]);
	});

	it('expands weekly with days_of_week within each week', () => {
		// Mon + Wed, seeded on Mon Aug 24
		const occ = expandRecurrenceRule(
			{ frequency: 'weekly', days_of_week: [1, 3] },
			d(2026, 8, 24),
			d(2026, 8, 24, 0, 0),
			d(2026, 9, 2, 23, 59)
		);
		expect(occ).toEqual([d(2026, 8, 24), d(2026, 8, 26), d(2026, 8, 31), d(2026, 9, 2)]);
	});

	it('stops after count occurrences, counting ones before the range', () => {
		const occ = expandRecurrenceRule(
			{ frequency: 'weekly', count: 2 },
			d(2026, 8, 24),
			d(2026, 8, 31, 0, 0),
			d(2026, 9, 30, 23, 59)
		);
		// Seed (#1) was before the range; only #2 lands, #3+ never exist
		expect(occ).toEqual([d(2026, 8, 31)]);
	});

	it('stops at end_date, treating a date-only string as inclusive', () => {
		const occ = expandRecurrenceRule(
			{ frequency: 'weekly', end_date: '2026-08-31' },
			d(2026, 8, 24),
			d(2026, 8, 24, 0, 0),
			d(2026, 9, 30, 23, 59)
		);
		expect(occ).toEqual([d(2026, 8, 24), d(2026, 8, 31)]);
	});

	it('preserves wall-clock time of day on every occurrence', () => {
		const occ = expandRecurrenceRule(
			{ frequency: 'daily' },
			d(2026, 8, 24, 16, 30),
			d(2026, 8, 25, 0, 0),
			d(2026, 8, 26, 23, 59)
		);
		expect(occ.map((o) => [o.getHours(), o.getMinutes()])).toEqual([
			[16, 30],
			[16, 30]
		]);
	});
});

describe('RECURRENCE_PRESETS', () => {
	it('has 7 presets including none', () => {
		expect(RECURRENCE_PRESETS).toHaveLength(7);
	});

	it('first preset is none with null value', () => {
		expect(RECURRENCE_PRESETS[0].value).toBeNull();
		expect(RECURRENCE_PRESETS[0].i18nKey).toBe('recurrence.none');
	});

	it('all presets have i18n keys', () => {
		for (const preset of RECURRENCE_PRESETS) {
			expect(preset.i18nKey).toMatch(/^recurrence\./);
		}
	});

	it('non-null presets have valid frequencies', () => {
		const validFreqs = ['daily', 'every_other_day', 'weekly', 'biweekly', 'monthly', 'yearly'];
		for (const preset of RECURRENCE_PRESETS) {
			if (preset.value !== null) {
				expect(validFreqs).toContain(preset.value.frequency);
			}
		}
	});
});
