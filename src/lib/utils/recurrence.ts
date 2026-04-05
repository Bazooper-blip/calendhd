import {
	addDays,
	addWeeks,
	addMonths,
	addYears,
	isBefore,
	isAfter,
	isSameDay,
	startOfDay
} from 'date-fns';
import type { RecurrenceRule, CalendarEvent } from '$types';

// Expand recurrence rule into individual dates
export function expandRecurrence(
	rule: RecurrenceRule,
	startDate: Date,
	rangeStart: Date,
	rangeEnd: Date,
	maxOccurrences: number = 100
): Date[] {
	const dates: Date[] = [];
	let current = startOfDay(new Date(startDate));
	let count = 0;

	// Determine the end condition
	const endDate = rule.end_date ? new Date(rule.end_date) : null;
	const maxCount = rule.count || maxOccurrences;

	while (count < maxCount) {
		// Check if we've passed the end date
		if (endDate && isAfter(current, endDate)) break;

		// Check if we've passed the range end
		if (isAfter(current, rangeEnd)) break;

		// Add date if within range
		if (!isBefore(current, rangeStart)) {
			dates.push(new Date(current));
		}

		// Calculate next occurrence
		count++;
		current = getNextOccurrence(current, rule);
	}

	return dates;
}

// Get the next occurrence based on recurrence rule
function getNextOccurrence(current: Date, rule: RecurrenceRule): Date {
	const interval = rule.interval || 1;

	switch (rule.frequency) {
		case 'daily':
			return addDays(current, interval);

		case 'every_other_day':
			return addDays(current, 2);

		case 'weekly':
			if (rule.days_of_week && rule.days_of_week.length > 0) {
				return getNextWeeklyOccurrence(current, rule.days_of_week, interval);
			}
			return addWeeks(current, interval);

		case 'biweekly':
			return addWeeks(current, 2);

		case 'monthly':
			return addMonths(current, interval);

		case 'yearly':
			return addYears(current, interval);

		default:
			return addDays(current, 1);
	}
}

// Get next weekly occurrence considering specific days of week
function getNextWeeklyOccurrence(
	current: Date,
	daysOfWeek: number[],
	weekInterval: number
): Date {
	const currentDay = current.getDay();
	const sortedDays = [...daysOfWeek].sort((a, b) => a - b);

	// Find next day in current week
	const nextDayInWeek = sortedDays.find((d) => d > currentDay);

	if (nextDayInWeek !== undefined) {
		return addDays(current, nextDayInWeek - currentDay);
	}

	// Move to first day of next interval week
	const daysUntilFirstDay = 7 - currentDay + sortedDays[0] + (weekInterval - 1) * 7;
	return addDays(current, daysUntilFirstDay);
}

// Generate recurring event instances
export function generateRecurringInstances(
	event: CalendarEvent,
	rangeStart: Date,
	rangeEnd: Date
): CalendarEvent[] {
	if (!event.recurrence_rule) {
		return [event];
	}

	const instances: CalendarEvent[] = [];
	const startDate = new Date(event.start_time);
	const duration = event.end_time
		? new Date(event.end_time).getTime() - startDate.getTime()
		: 0;

	const dates = expandRecurrence(event.recurrence_rule, startDate, rangeStart, rangeEnd);

	for (const date of dates) {
		const instanceStart = new Date(date);
		instanceStart.setHours(startDate.getHours(), startDate.getMinutes(), 0, 0);

		const instance: CalendarEvent = {
			...event,
			id: `${event.id}_${date.toISOString()}`,
			start_time: instanceStart.toISOString(),
			end_time: duration ? new Date(instanceStart.getTime() + duration).toISOString() : undefined,
			recurrence_parent: event.id
		};

		instances.push(instance);
	}

	return instances;
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

// Recurrence presets for UI
export const RECURRENCE_PRESETS: { value: RecurrenceRule | null; label: string }[] = [
	{ value: null, label: 'Does not repeat' },
	{ value: { frequency: 'daily' }, label: 'Daily' },
	{ value: { frequency: 'every_other_day' }, label: 'Every other day' },
	{ value: { frequency: 'weekly' }, label: 'Weekly' },
	{ value: { frequency: 'biweekly' }, label: 'Every 2 weeks' },
	{ value: { frequency: 'monthly' }, label: 'Monthly' },
	{ value: { frequency: 'yearly' }, label: 'Yearly' }
];

// Check if two recurrence rules are equal
export function areRulesEqual(a?: RecurrenceRule, b?: RecurrenceRule): boolean {
	if (!a && !b) return true;
	if (!a || !b) return false;

	return (
		a.frequency === b.frequency &&
		(a.interval || 1) === (b.interval || 1) &&
		a.end_date === b.end_date &&
		a.count === b.count &&
		JSON.stringify(a.days_of_week?.sort()) === JSON.stringify(b.days_of_week?.sort())
	);
}
