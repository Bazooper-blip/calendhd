import {
	format,
	isToday as dateFnsIsToday,
	isTomorrow as dateFnsIsTomorrow,
	isYesterday as dateFnsIsYesterday,
	isThisWeek as dateFnsIsThisWeek,
	isThisYear as dateFnsIsThisYear,
	differenceInMinutes,
	differenceInHours,
	differenceInDays,
	differenceInSeconds,
	addMinutes,
	setHours,
	setMinutes,
	startOfDay,
	endOfDay,
	eachDayOfInterval,
	eachHourOfInterval,
	getHours,
	getMinutes
} from 'date-fns';
import { formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { enUS, sv } from 'date-fns/locale';
import type { Locale } from 'date-fns';

// Available locales
const locales: Record<string, Locale> = {
	en: enUS,
	sv: sv
};

// Current timezone context - can be set by the app based on user settings
let currentTimezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone;
let currentLocale: Locale = enUS;

// Set the global timezone for date formatting
export function setTimezone(tz: string): void {
	currentTimezone = tz;
}

// Get the current timezone
export function getTimezone(): string {
	return currentTimezone;
}

// Set the locale for date formatting (e.g., 'en', 'sv')
export function setDateLocale(localeCode: string): void {
	currentLocale = locales[localeCode] || enUS;
}

// Get the current locale
export function getDateLocale(): Locale {
	return currentLocale;
}

// Convert a UTC date to the user's timezone
export function toUserTimezone(date: Date): Date {
	return toZonedTime(date, currentTimezone);
}

// Format time based on user preference and timezone
export function formatTime(date: Date, format24h: boolean = false): string {
	const formatStr = format24h ? 'HH:mm' : 'h:mm a';
	return formatInTimeZone(date, currentTimezone, formatStr, { locale: currentLocale });
}

// Format date with smart relative formatting (timezone-aware)
// Note: Returns localized "Today", "Tomorrow", "Yesterday" when available
export function formatDateSmart(date: Date, translations?: { today?: string; tomorrow?: string; yesterday?: string }): string {
	const zonedDate = toZonedTime(date, currentTimezone);

	if (dateFnsIsToday(zonedDate)) return translations?.today || 'Today';
	if (dateFnsIsTomorrow(zonedDate)) return translations?.tomorrow || 'Tomorrow';
	if (dateFnsIsYesterday(zonedDate)) return translations?.yesterday || 'Yesterday';
	if (dateFnsIsThisWeek(zonedDate, { weekStartsOn: 0 })) {
		return formatInTimeZone(date, currentTimezone, 'EEEE', { locale: currentLocale });
	}
	if (dateFnsIsThisYear(zonedDate)) {
		return formatInTimeZone(date, currentTimezone, 'MMM d', { locale: currentLocale });
	}
	return formatInTimeZone(date, currentTimezone, 'MMM d, yyyy', { locale: currentLocale });
}

// Format date for display
export function formatDate(date: Date, includeYear: boolean = true): string {
	const formatStr = includeYear ? 'MMMM d, yyyy' : 'MMMM d';
	return formatInTimeZone(date, currentTimezone, formatStr, { locale: currentLocale });
}

// Format date for month view header
export function formatMonthYear(date: Date): string {
	return formatInTimeZone(date, currentTimezone, 'MMMM yyyy', { locale: currentLocale });
}

// Format day of week
export function formatDayOfWeek(date: Date, short: boolean = false): string {
	const formatStr = short ? 'EEE' : 'EEEE';
	return formatInTimeZone(date, currentTimezone, formatStr, { locale: currentLocale });
}

// Format day number
export function formatDayNumber(date: Date): string {
	return formatInTimeZone(date, currentTimezone, 'd');
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

// Calculate duration between two dates in minutes
export function getDurationMinutes(start: Date, end: Date): number {
	return differenceInMinutes(end, start);
}

// Get time slots for a day (for time picker)
export function getTimeSlots(
	intervalMinutes: number = 30,
	startHour: number = 0,
	endHour: number = 24
): { value: string; label: string }[] {
	const slots: { value: string; label: string }[] = [];
	const today = new Date();

	let current = setHours(setMinutes(today, 0), startHour);
	const end = setHours(setMinutes(today, 0), endHour);

	while (current < end) {
		const hours = getHours(current);
		const minutes = getMinutes(current);
		const value = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
		const label = formatTime(current, false);

		slots.push({ value, label });
		current = addMinutes(current, intervalMinutes);
	}

	return slots;
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

// Get array of hours in a day
export function getHoursInDay(date: Date): Date[] {
	return eachHourOfInterval({
		start: startOfDay(date),
		end: endOfDay(date)
	}).slice(0, 24); // Exclude the 25th hour
}

// Calculate position and height for time-based event display
export function getEventPosition(
	start: Date,
	end: Date | undefined,
	dayStart: Date
): { top: number; height: number } {
	const startMinutes = differenceInMinutes(start, startOfDay(dayStart));
	const endMinutes = end
		? differenceInMinutes(end, startOfDay(dayStart))
		: startMinutes + 60; // Default 1 hour if no end

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

// Check if event spans multiple days (timezone-aware)
export function isMultiDayEvent(start: Date, end?: Date): boolean {
	if (!end) return false;
	const startZoned = toZonedTime(start, currentTimezone);
	const endZoned = toZonedTime(end, currentTimezone);
	return format(startZoned, 'yyyy-MM-dd') !== format(endZoned, 'yyyy-MM-dd');
}

// Timezone-aware isToday check
export function isToday(date: Date): boolean {
	const zonedDate = toZonedTime(date, currentTimezone);
	return dateFnsIsToday(zonedDate);
}

// Timezone-aware isSameDay check
export function isSameDay(date1: Date, date2: Date): boolean {
	const zoned1 = toZonedTime(date1, currentTimezone);
	const zoned2 = toZonedTime(date2, currentTimezone);
	return format(zoned1, 'yyyy-MM-dd') === format(zoned2, 'yyyy-MM-dd');
}

// Timezone-aware isSameMonth check
export function isSameMonth(date1: Date, date2: Date): boolean {
	const zoned1 = toZonedTime(date1, currentTimezone);
	const zoned2 = toZonedTime(date2, currentTimezone);
	return format(zoned1, 'yyyy-MM') === format(zoned2, 'yyyy-MM');
}

// Get reminder time description
export function formatReminderTime(minutesBefore: number): string {
	if (minutesBefore === 0) return 'At time of event';
	if (minutesBefore < 60) return `${minutesBefore} minutes before`;
	if (minutesBefore === 60) return '1 hour before';
	if (minutesBefore < 1440) {
		const hours = Math.floor(minutesBefore / 60);
		return `${hours} hour${hours > 1 ? 's' : ''} before`;
	}
	const days = Math.floor(minutesBefore / 1440);
	return `${days} day${days > 1 ? 's' : ''} before`;
}

// Common reminder options
export const REMINDER_OPTIONS = [
	{ value: 0, label: 'At time of event' },
	{ value: 5, label: '5 minutes before' },
	{ value: 10, label: '10 minutes before' },
	{ value: 15, label: '15 minutes before' },
	{ value: 30, label: '30 minutes before' },
	{ value: 60, label: '1 hour before' },
	{ value: 120, label: '2 hours before' },
	{ value: 1440, label: '1 day before' },
	{ value: 2880, label: '2 days before' }
];

// Format relative time (e.g., "5 minutes ago", "2 hours ago", "Yesterday")
export function formatRelativeTime(date: Date): string {
	const now = new Date();
	const secondsAgo = differenceInSeconds(now, date);
	const minutesAgo = differenceInMinutes(now, date);
	const hoursAgo = differenceInHours(now, date);
	const daysAgo = differenceInDays(now, date);

	if (secondsAgo < 60) {
		return 'Just now';
	}

	if (minutesAgo < 60) {
		return minutesAgo === 1 ? '1 minute ago' : `${minutesAgo} minutes ago`;
	}

	if (hoursAgo < 24) {
		return hoursAgo === 1 ? '1 hour ago' : `${hoursAgo} hours ago`;
	}

	if (daysAgo === 1) {
		return 'Yesterday';
	}

	if (daysAgo < 7) {
		return `${daysAgo} days ago`;
	}

	if (daysAgo < 30) {
		const weeks = Math.floor(daysAgo / 7);
		return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`;
	}

	if (daysAgo < 365) {
		const months = Math.floor(daysAgo / 30);
		return months === 1 ? '1 month ago' : `${months} months ago`;
	}

	const years = Math.floor(daysAgo / 365);
	return years === 1 ? '1 year ago' : `${years} years ago`;
}

// Get list of common timezones for picker
export function getCommonTimezones(): { value: string; label: string }[] {
	return [
		{ value: 'America/New_York', label: 'Eastern Time (US & Canada)' },
		{ value: 'America/Chicago', label: 'Central Time (US & Canada)' },
		{ value: 'America/Denver', label: 'Mountain Time (US & Canada)' },
		{ value: 'America/Los_Angeles', label: 'Pacific Time (US & Canada)' },
		{ value: 'America/Anchorage', label: 'Alaska' },
		{ value: 'Pacific/Honolulu', label: 'Hawaii' },
		{ value: 'America/Toronto', label: 'Eastern Time (Canada)' },
		{ value: 'America/Vancouver', label: 'Pacific Time (Canada)' },
		{ value: 'Europe/London', label: 'London' },
		{ value: 'Europe/Paris', label: 'Paris' },
		{ value: 'Europe/Berlin', label: 'Berlin' },
		{ value: 'Europe/Amsterdam', label: 'Amsterdam' },
		{ value: 'Europe/Rome', label: 'Rome' },
		{ value: 'Europe/Madrid', label: 'Madrid' },
		{ value: 'Europe/Zurich', label: 'Zurich' },
		{ value: 'Europe/Moscow', label: 'Moscow' },
		{ value: 'Asia/Dubai', label: 'Dubai' },
		{ value: 'Asia/Kolkata', label: 'Mumbai, Kolkata' },
		{ value: 'Asia/Singapore', label: 'Singapore' },
		{ value: 'Asia/Hong_Kong', label: 'Hong Kong' },
		{ value: 'Asia/Shanghai', label: 'Shanghai' },
		{ value: 'Asia/Tokyo', label: 'Tokyo' },
		{ value: 'Asia/Seoul', label: 'Seoul' },
		{ value: 'Australia/Sydney', label: 'Sydney' },
		{ value: 'Australia/Melbourne', label: 'Melbourne' },
		{ value: 'Pacific/Auckland', label: 'Auckland' },
		{ value: 'UTC', label: 'UTC' }
	];
}
