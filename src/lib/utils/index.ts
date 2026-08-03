// Re-export commonly used date-fns functions
// Note: isToday, isSameDay, isSameMonth are exported from ./date with timezone awareness
export {
	addDays,
	addMonths,
	addWeeks,
	endOfMonth,
	endOfWeek,
	format,
	isValid,
	parseISO,
	startOfDay,
	startOfMonth,
	startOfWeek,
	subDays,
	subMonths,
	subWeeks
} from 'date-fns';
export * from './date';
export * from './externalEvents';
export * from './notifications';
export * from './recurrence';

// Class name utility
export function cn(...classes: (string | boolean | undefined | null)[]): string {
	return classes.filter(Boolean).join(' ');
}

// Color utilities
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	return result
		? {
				r: parseInt(result[1], 16),
				g: parseInt(result[2], 16),
				b: parseInt(result[3], 16)
			}
		: null;
}

export function getContrastColor(hex: string): 'white' | 'black' {
	const rgb = hexToRgb(hex);
	if (!rgb) return 'black';

	// Calculate relative luminance
	const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
	return luminance > 0.5 ? 'black' : 'white';
}

// Convert webcal:// to https://
export function normalizeCalendarUrl(url: string): string {
	return url.replace(/^webcal:\/\//i, 'https://');
}
