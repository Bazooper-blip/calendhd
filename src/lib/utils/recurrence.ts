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
