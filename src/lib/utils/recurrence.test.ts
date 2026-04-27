import { describe, it, expect } from 'vitest';
import { formatRecurrenceRule, RECURRENCE_PRESETS } from './recurrence';
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
