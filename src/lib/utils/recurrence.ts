import { addDays, addMonths, addYears, endOfDay } from 'date-fns';
import type { RecurrenceRule } from '$types';

// Expand a recurrence rule into concrete occurrence start times within
// [rangeStart, rangeEnd] (inclusive), seed occurrence included when it falls
// in range. All stepping is done on local wall-clock time so occurrences keep
// their time of day across DST — mirrored in pb_hooks/pb_helpers.js
// (expandLocalRecurrence) for the TRMNL feed and reminder pipeline.
export function expandRecurrenceRule(
	rule: RecurrenceRule,
	seedStart: Date,
	rangeStart: Date,
	rangeEnd: Date
): Date[] {
	// Hard cap so a malformed rule can't spin. The loop breaks as soon as a
	// candidate passes rangeEnd, so this only bites when the seed is very far
	// behind the viewed range (~13 years for day-stepped frequencies).
	const MAX_ITERATIONS = 5000;

	const until = rule.end_date
		? /^\d{4}-\d{2}-\d{2}$/.test(rule.end_date)
			? endOfDay(new Date(`${rule.end_date}T00:00:00`))
			: new Date(rule.end_date)
		: null;
	const maxCount = rule.count && rule.count > 0 ? rule.count : Infinity;

	const daysOfWeek =
		rule.frequency === 'weekly' && rule.days_of_week && rule.days_of_week.length > 0
			? rule.days_of_week
			: null;

	// Each candidate is computed FROM THE SEED (never from the previous
	// occurrence) so monthly/yearly can clamp a short month (Jan 31 → Feb 28)
	// without drifting for the rest of the series. For weekly-with-days the
	// candidate advances day by day and is filtered by weekday + week parity.
	const interval = rule.interval && rule.interval > 0 ? rule.interval : 1;
	const candidate = (k: number): Date => {
		switch (rule.frequency) {
			case 'daily':
				return addDays(seedStart, k * interval);
			case 'every_other_day':
				return addDays(seedStart, k * 2);
			case 'weekly':
				return daysOfWeek ? addDays(seedStart, k) : addDays(seedStart, k * 7 * interval);
			case 'biweekly':
				return addDays(seedStart, k * 14);
			case 'monthly':
				return addMonths(seedStart, k * interval);
			case 'yearly':
				return addYears(seedStart, k * interval);
			default:
				// Unknown frequency: only the seed occurrence exists
				return k === 0 ? seedStart : addDays(rangeEnd, 1);
		}
	};

	// Weekly-with-days: a day qualifies when its weekday is listed AND its
	// week (counted in whole weeks from the seed's day) matches the interval.
	const matches = (occurrence: Date, k: number): boolean => {
		if (!daysOfWeek) return true;
		if (!daysOfWeek.includes(occurrence.getDay())) return false;
		const weeksFromSeed = Math.floor((k + seedStart.getDay()) / 7);
		return weeksFromSeed % interval === 0;
	};

	const occurrences: Date[] = [];
	let count = 0;
	for (let k = 0; k < MAX_ITERATIONS; k++) {
		const cursor = candidate(k);
		if (cursor > rangeEnd) break;
		if (until && cursor > until) break;
		if (matches(cursor, k)) {
			count++;
			if (count > maxCount) break;
			if (cursor >= rangeStart) occurrences.push(cursor);
		}
	}
	return occurrences;
}

// Get human readable recurrence description
export function formatRecurrenceRule(rule: RecurrenceRule): string {
	const interval = rule.interval || 1;

	switch (rule.frequency) {
		case 'daily':
			if (interval === 1) return 'Daily';
			return `Every ${interval} days`;

		case 'every_other_day':
			return 'Every other day';

		case 'weekly':
			if (rule.days_of_week && rule.days_of_week.length > 0) {
				const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
				const days = rule.days_of_week.map((d) => dayNames[d]).join(', ');
				if (interval === 1) return `Weekly on ${days}`;
				return `Every ${interval} weeks on ${days}`;
			}
			if (interval === 1) return 'Weekly';
			return `Every ${interval} weeks`;

		case 'biweekly':
			return 'Every 2 weeks';

		case 'monthly':
			if (interval === 1) return 'Monthly';
			return `Every ${interval} months`;

		case 'yearly':
			if (interval === 1) return 'Yearly';
			return `Every ${interval} years`;

		default:
			return 'Custom';
	}
}

// Recurrence presets for UI (i18n keys under "recurrence.*")
export const RECURRENCE_PRESETS: { value: RecurrenceRule | null; i18nKey: string }[] = [
	{ value: null, i18nKey: 'recurrence.none' },
	{ value: { frequency: 'daily' }, i18nKey: 'recurrence.daily' },
	{ value: { frequency: 'every_other_day' }, i18nKey: 'recurrence.everyOtherDay' },
	{ value: { frequency: 'weekly' }, i18nKey: 'recurrence.weekly' },
	{ value: { frequency: 'biweekly' }, i18nKey: 'recurrence.biweekly' },
	{ value: { frequency: 'monthly' }, i18nKey: 'recurrence.monthly' },
	{ value: { frequency: 'yearly' }, i18nKey: 'recurrence.yearly' }
];
