import type { Locale } from 'date-fns';
import {
	isThisWeek as dateFnsIsThisWeek,
	isThisYear as dateFnsIsThisYear,
	isToday as dateFnsIsToday,
	isTomorrow as dateFnsIsTomorrow,
	isYesterday as dateFnsIsYesterday,
	differenceInMinutes,
	eachDayOfInterval,
	format,
	formatDistanceToNow,
	setHours,
	setMinutes,
	startOfDay
} from 'date-fns';
import { enUS, sv } from 'date-fns/locale';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { dateConfig } from './date-config.svelte';

// Available locales
const locales: Record<string, Locale> = {
	en: enUS,
	sv: sv
};

// Set the global timezone for date formatting
export function setTimezone(tz: string): void {
	dateConfig.timezone = tz;
}

// Set the locale for date formatting (e.g., 'en', 'sv')
export function setDateLocale(localeCode: string): void {
	dateConfig.locale = locales[localeCode] || enUS;
}

// Set the first day of the week used by "this week"-style formatting
export function setWeekStartsOn(day: 0 | 1 | 6): void {
	dateConfig.weekStartsOn = day;
}

// Format time based on user preference and timezone
export function formatTime(date: Date, format24h: boolean = false): string {
	const formatStr = format24h ? 'HH:mm' : 'h:mm a';
	return formatInTimeZone(date, dateConfig.timezone, formatStr, { locale: dateConfig.locale });
}

// Format date with smart relative formatting (timezone-aware)
export function formatDateSmart(
	date: Date,
	translations?: { today?: string; tomorrow?: string; yesterday?: string }
): string {
	const zonedDate = toZonedTime(date, dateConfig.timezone);

	if (dateFnsIsToday(zonedDate)) return translations?.today || 'Today';
	if (dateFnsIsTomorrow(zonedDate)) return translations?.tomorrow || 'Tomorrow';
	if (dateFnsIsYesterday(zonedDate)) return translations?.yesterday || 'Yesterday';
	if (dateFnsIsThisWeek(zonedDate, { weekStartsOn: dateConfig.weekStartsOn })) {
		return formatInTimeZone(date, dateConfig.timezone, 'EEEE', { locale: dateConfig.locale });
	}
	if (dateFnsIsThisYear(zonedDate)) {
		return formatInTimeZone(date, dateConfig.timezone, 'MMM d', { locale: dateConfig.locale });
	}
	return formatInTimeZone(date, dateConfig.timezone, 'MMM d, yyyy', { locale: dateConfig.locale });
}

// Format date for month view header
export function formatMonthYear(date: Date): string {
	return formatInTimeZone(date, dateConfig.timezone, 'MMMM yyyy', { locale: dateConfig.locale });
}

// Format day of week
export function formatDayOfWeek(date: Date, short: boolean = false): string {
	const formatStr = short ? 'EEE' : 'EEEE';
	return formatInTimeZone(date, dateConfig.timezone, formatStr, { locale: dateConfig.locale });
}

// Format time range
export function formatTimeRange(start: Date, end?: Date, format24h: boolean = false): string {
	const startStr = formatTime(start, format24h);
	if (!end) return startStr;
	const endStr = formatTime(end, format24h);
	return `${startStr} - ${endStr}`;
}

// Get duration in human readable format
export function formatDuration(minutes: number): string {
	if (minutes < 60) {
		return `${minutes}m`;
	}
	const hours = Math.floor(minutes / 60);
	const mins = minutes % 60;
	if (mins === 0) {
		return `${hours}h`;
	}
	return `${hours}h ${mins}m`;
}

// Parse time string to date (for a given date)
export function parseTimeToDate(dateStr: string, timeStr: string): Date {
	const [hours, minutes] = timeStr.split(':').map(Number);
	const date = new Date(dateStr);
	return setMinutes(setHours(date, hours), minutes);
}

// Get array of days in a range
export function getDaysInRange(start: Date, end: Date): Date[] {
	return eachDayOfInterval({ start, end });
}

// Calculate position and height for time-based event display
export function getEventPosition(
	start: Date,
	end: Date | undefined,
	dayStart: Date
): { top: number; height: number } {
	const startMinutes = differenceInMinutes(start, startOfDay(dayStart));
	const endMinutes = end ? differenceInMinutes(end, startOfDay(dayStart)) : startMinutes + 60; // Default 1 hour if no end

	// Convert to percentage of day (24 hours = 1440 minutes)
	const top = (startMinutes / 1440) * 100;
	const height = ((endMinutes - startMinutes) / 1440) * 100;

	// Minimum height of ~45 minutes (3.125%) to ensure title is visible
	const minHeight = 3.125;

	return {
		top: Math.max(0, top),
		height: Math.max(minHeight, Math.min(100 - top, height))
	};
}

// Assign side-by-side lanes to overlapping timed items so each stays
// individually visible/tappable. Items that overlap (transitively) form a
// cluster; every item in a cluster shares the same laneCount so widths line
// up. The visual footprint mirrors getEventPosition: no-end items occupy 60
// minutes, and everything occupies at least 45 minutes — two short
// back-to-back events overlap on screen even when they don't in time.
export function computeEventLanes(
	items: Array<{ start: Date; end?: Date }>
): Array<{ lane: number; laneCount: number }> {
	const MIN_FOOTPRINT_MS = 45 * 60_000;
	const starts = items.map((it) => it.start.getTime());
	const ends = items.map((it, i) => {
		const end = it.end ? it.end.getTime() : starts[i] + 60 * 60_000;
		return Math.max(end, starts[i] + MIN_FOOTPRINT_MS);
	});

	// Earlier start first; on ties the longer item first so it claims lane 0
	const order = items
		.map((_, i) => i)
		.sort((a, b) => starts[a] - starts[b] || ends[b] - ends[a]);

	const result = items.map(() => ({ lane: 0, laneCount: 1 }));

	let cluster: number[] = [];
	let laneEnds: number[] = []; // per-lane end time of its latest item
	let clusterEnd = -Infinity;

	const closeCluster = () => {
		for (const idx of cluster) result[idx].laneCount = laneEnds.length;
		cluster = [];
		laneEnds = [];
		clusterEnd = -Infinity;
	};

	for (const idx of order) {
		if (cluster.length > 0 && starts[idx] >= clusterEnd) closeCluster();
		let lane = laneEnds.findIndex((end) => end <= starts[idx]);
		if (lane === -1) {
			lane = laneEnds.length;
			laneEnds.push(ends[idx]);
		} else {
			laneEnds[lane] = ends[idx];
		}
		result[idx].lane = lane;
		cluster.push(idx);
		clusterEnd = Math.max(clusterEnd, ends[idx]);
	}
	closeCluster();

	return result;
}

// Timezone-aware isToday check
export function isToday(date: Date): boolean {
	const zonedDate = toZonedTime(date, dateConfig.timezone);
	return dateFnsIsToday(zonedDate);
}

// Timezone-aware isSameDay check
export function isSameDay(date1: Date, date2: Date): boolean {
	const zoned1 = toZonedTime(date1, dateConfig.timezone);
	const zoned2 = toZonedTime(date2, dateConfig.timezone);
	return format(zoned1, 'yyyy-MM-dd') === format(zoned2, 'yyyy-MM-dd');
}

// Timezone-aware isSameMonth check
export function isSameMonth(date1: Date, date2: Date): boolean {
	const zoned1 = toZonedTime(date1, dateConfig.timezone);
	const zoned2 = toZonedTime(date2, dateConfig.timezone);
	return format(zoned1, 'yyyy-MM') === format(zoned2, 'yyyy-MM');
}

// Common reminder options
export const REMINDER_OPTIONS = [
	{ value: 0, i18nKey: 'reminder.atTime' },
	{ value: 5, i18nKey: 'reminder.5min' },
	{ value: 10, i18nKey: 'reminder.10min' },
	{ value: 15, i18nKey: 'reminder.15min' },
	{ value: 30, i18nKey: 'reminder.30min' },
	{ value: 60, i18nKey: 'reminder.1hour' },
	{ value: 120, i18nKey: 'reminder.2hours' },
	{ value: 1440, i18nKey: 'reminder.1day' },
	{ value: 2880, i18nKey: 'reminder.2days' }
];

// Format relative time (e.g., "18 minutes ago" / "för 18 minuter sedan")
export function formatRelativeTime(date: Date): string {
	return formatDistanceToNow(date, { addSuffix: true, locale: dateConfig.locale });
}
