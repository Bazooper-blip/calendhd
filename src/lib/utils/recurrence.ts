import type { RecurrenceRule } from '$types';

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
