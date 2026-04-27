import { describe, it, expect, beforeEach } from 'vitest';
import {
	setTimezone,
	setDateLocale,
	formatTime,
	formatDuration,
	formatTimeRange,
	formatMonthYear,
	formatDayOfWeek,
	parseTimeToDate,
	getDaysInRange,
	getEventPosition,
	isToday,
	isSameDay,
	isSameMonth,
	REMINDER_OPTIONS
} from './date';

// Use a fixed timezone for reproducible tests
beforeEach(() => {
	setTimezone('UTC');
	setDateLocale('en');
});

describe('formatTime', () => {
	const date = new Date('2026-04-05T14:30:00Z');

	it('formats in 12h mode', () => {
		expect(formatTime(date, false)).toBe('2:30 PM');
	});

	it('formats in 24h mode', () => {
		expect(formatTime(date, true)).toBe('14:30');
	});

	it('formats midnight in 12h', () => {
		const midnight = new Date('2026-04-05T00:00:00Z');
		expect(formatTime(midnight, false)).toBe('12:00 AM');
	});

	it('formats midnight in 24h', () => {
		const midnight = new Date('2026-04-05T00:00:00Z');
		expect(formatTime(midnight, true)).toBe('00:00');
	});

	it('respects timezone setting', () => {
		setTimezone('America/New_York'); // UTC-4 in April (EDT)
		expect(formatTime(date, true)).toBe('10:30');
	});
});

describe('formatDuration', () => {
	it('formats minutes only', () => {
		expect(formatDuration(30)).toBe('30m');
		expect(formatDuration(45)).toBe('45m');
	});

	it('formats exact hours', () => {
		expect(formatDuration(60)).toBe('1h');
		expect(formatDuration(120)).toBe('2h');
	});

	it('formats hours and minutes', () => {
		expect(formatDuration(90)).toBe('1h 30m');
		expect(formatDuration(150)).toBe('2h 30m');
	});

	it('handles zero', () => {
		expect(formatDuration(0)).toBe('0m');
	});
});

describe('formatTimeRange', () => {
	const start = new Date('2026-04-05T09:00:00Z');
	const end = new Date('2026-04-05T10:30:00Z');

	it('formats range with start and end', () => {
		expect(formatTimeRange(start, end, true)).toBe('09:00 - 10:30');
	});

	it('formats start only when no end', () => {
		expect(formatTimeRange(start, undefined, true)).toBe('09:00');
	});

	it('uses 12h format', () => {
		expect(formatTimeRange(start, end, false)).toBe('9:00 AM - 10:30 AM');
	});
});

describe('formatMonthYear', () => {
	it('formats month and year', () => {
		const date = new Date('2026-04-15T12:00:00Z');
		expect(formatMonthYear(date)).toBe('April 2026');
	});

	it('formats with Swedish locale', () => {
		setDateLocale('sv');
		const date = new Date('2026-04-15T12:00:00Z');
		expect(formatMonthYear(date)).toBe('april 2026');
	});
});

describe('formatDayOfWeek', () => {
	it('formats full day name', () => {
		const sunday = new Date('2026-04-05T12:00:00Z'); // April 5, 2026 is a Sunday
		expect(formatDayOfWeek(sunday)).toBe('Sunday');
	});

	it('formats short day name', () => {
		const sunday = new Date('2026-04-05T12:00:00Z');
		expect(formatDayOfWeek(sunday, true)).toBe('Sun');
	});
});

describe('parseTimeToDate', () => {
	it('parses time string to Date', () => {
		const result = parseTimeToDate('2026-04-05', '14:30');
		expect(result.getHours()).toBe(14);
		expect(result.getMinutes()).toBe(30);
	});

	it('parses midnight', () => {
		const result = parseTimeToDate('2026-04-05', '00:00');
		expect(result.getHours()).toBe(0);
		expect(result.getMinutes()).toBe(0);
	});

	it('parses end of day', () => {
		const result = parseTimeToDate('2026-04-05', '23:59');
		expect(result.getHours()).toBe(23);
		expect(result.getMinutes()).toBe(59);
	});
});

describe('getDaysInRange', () => {
	it('returns array of days inclusive', () => {
		const start = new Date('2026-04-01');
		const end = new Date('2026-04-03');
		const days = getDaysInRange(start, end);
		expect(days).toHaveLength(3);
	});

	it('returns single day when start equals end', () => {
		const date = new Date('2026-04-05');
		expect(getDaysInRange(date, date)).toHaveLength(1);
	});

	it('returns 7 days for a week', () => {
		const start = new Date('2026-04-05');
		const end = new Date('2026-04-11');
		expect(getDaysInRange(start, end)).toHaveLength(7);
	});
});

describe('getEventPosition', () => {
	// Use local dates to avoid timezone offset issues with startOfDay
	it('calculates correct height for a 1-hour event', () => {
		const dayStart = new Date(2026, 3, 5); // April 5, local
		const start = new Date(2026, 3, 5, 12, 0); // noon local
		const end = new Date(2026, 3, 5, 13, 0); // 1pm local
		const pos = getEventPosition(start, end, dayStart);

		// 720min / 1440 * 100 = 50%
		expect(pos.top).toBeCloseTo(50, 1);
		// 60min / 1440 * 100 ≈ 4.17%
		expect(pos.height).toBeCloseTo(4.17, 1);
	});

	it('defaults to 1 hour when no end time', () => {
		const dayStart = new Date(2026, 3, 5);
		const start = new Date(2026, 3, 5, 10, 0);
		const pos = getEventPosition(start, undefined, dayStart);

		// 600min / 1440 * 100 ≈ 41.67%
		expect(pos.top).toBeCloseTo(41.67, 1);
		// Default 60min
		expect(pos.height).toBeCloseTo(4.17, 1);
	});

	it('enforces minimum height for short events', () => {
		const dayStart = new Date(2026, 3, 5);
		const start = new Date(2026, 3, 5, 10, 0);
		const end = new Date(2026, 3, 5, 10, 5); // 5 minutes
		const pos = getEventPosition(start, end, dayStart);

		expect(pos.height).toBe(3.125);
	});

	it('positions event at start of day at top=0', () => {
		const dayStart = new Date(2026, 3, 5);
		const start = new Date(2026, 3, 5, 0, 0);
		const end = new Date(2026, 3, 5, 1, 0);
		const pos = getEventPosition(start, end, dayStart);

		expect(pos.top).toBe(0);
		expect(pos.height).toBeCloseTo(4.17, 1);
	});

	it('height is proportional to duration', () => {
		const dayStart = new Date(2026, 3, 5);
		const start = new Date(2026, 3, 5, 8, 0);

		const pos2h = getEventPosition(start, new Date(2026, 3, 5, 10, 0), dayStart);
		const pos4h = getEventPosition(start, new Date(2026, 3, 5, 12, 0), dayStart);

		// 4h should be exactly 2x the height of 2h (both above min height)
		expect(pos4h.height).toBeCloseTo(pos2h.height * 2, 1);
	});
});

describe('isToday', () => {
	it('returns true for today', () => {
		expect(isToday(new Date())).toBe(true);
	});

	it('returns false for yesterday', () => {
		const yesterday = new Date();
		yesterday.setDate(yesterday.getDate() - 1);
		expect(isToday(yesterday)).toBe(false);
	});
});

describe('isSameDay', () => {
	it('returns true for same day', () => {
		const a = new Date('2026-04-05T09:00:00Z');
		const b = new Date('2026-04-05T21:00:00Z');
		expect(isSameDay(a, b)).toBe(true);
	});

	it('returns false for different days', () => {
		const a = new Date('2026-04-05T09:00:00Z');
		const b = new Date('2026-04-06T09:00:00Z');
		expect(isSameDay(a, b)).toBe(false);
	});

	it('handles timezone edge cases', () => {
		setTimezone('America/New_York');
		// April 5 23:00 UTC = April 5 19:00 ET — same day
		const a = new Date('2026-04-05T23:00:00Z');
		// April 6 03:00 UTC = April 5 23:00 ET — still same day
		const b = new Date('2026-04-06T03:00:00Z');
		expect(isSameDay(a, b)).toBe(true);
	});
});

describe('isSameMonth', () => {
	it('returns true for same month', () => {
		const a = new Date('2026-04-01T00:00:00Z');
		const b = new Date('2026-04-30T23:59:59Z');
		expect(isSameMonth(a, b)).toBe(true);
	});

	it('returns false for different months', () => {
		const a = new Date('2026-04-30T00:00:00Z');
		const b = new Date('2026-05-01T00:00:00Z');
		expect(isSameMonth(a, b)).toBe(false);
	});
});

describe('REMINDER_OPTIONS', () => {
	it('has correct i18n keys for all values', () => {
		expect(REMINDER_OPTIONS).toHaveLength(9);
		expect(REMINDER_OPTIONS[0]).toEqual({ value: 0, i18nKey: 'reminder.atTime' });
		expect(REMINDER_OPTIONS[8]).toEqual({ value: 2880, i18nKey: 'reminder.2days' });
	});

	it('has strictly increasing values', () => {
		for (let i = 1; i < REMINDER_OPTIONS.length; i++) {
			expect(REMINDER_OPTIONS[i].value).toBeGreaterThan(REMINDER_OPTIONS[i - 1].value);
		}
	});

	it('all have i18nKey property', () => {
		for (const opt of REMINDER_OPTIONS) {
			expect(opt.i18nKey).toBeDefined();
			expect(opt.i18nKey).toMatch(/^reminder\./);
		}
	});
});
