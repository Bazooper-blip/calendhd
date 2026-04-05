export * from './date';
export * from './recurrence';
export * from './notifications';

// Re-export commonly used date-fns functions
// Note: isToday, isSameDay, isSameMonth are exported from ./date with timezone awareness
export {
	format,
	parseISO,
	isValid,
	startOfWeek,
	endOfWeek,
	startOfMonth,
	endOfMonth,
	startOfDay,
	addDays,
	addWeeks,
	addMonths,
	subDays,
	subWeeks,
	subMonths
} from 'date-fns';

// Generate unique ID
export function generateId(): string {
	return `${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 11)}`;
}

// Debounce function
export function debounce<T extends (...args: any[]) => any>(
	fn: T,
	delay: number
): (...args: Parameters<T>) => void {
	let timeoutId: ReturnType<typeof setTimeout>;

	return (...args: Parameters<T>) => {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => fn(...args), delay);
	};
}

// Throttle function
export function throttle<T extends (...args: any[]) => any>(
	fn: T,
	limit: number
): (...args: Parameters<T>) => void {
	let inThrottle = false;

	return (...args: Parameters<T>) => {
		if (!inThrottle) {
			fn(...args);
			inThrottle = true;
			setTimeout(() => (inThrottle = false), limit);
		}
	};
}

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

// Adjust color brightness
export function adjustBrightness(hex: string, percent: number): string {
	const rgb = hexToRgb(hex);
	if (!rgb) return hex;

	const adjust = (value: number) =>
		Math.min(255, Math.max(0, Math.round(value + (255 * percent) / 100)));

	const r = adjust(rgb.r).toString(16).padStart(2, '0');
	const g = adjust(rgb.g).toString(16).padStart(2, '0');
	const b = adjust(rgb.b).toString(16).padStart(2, '0');

	return `#${r}${g}${b}`;
}

// Safe JSON parse
export function safeJsonParse<T>(json: string, fallback: T): T {
	try {
		return JSON.parse(json) as T;
	} catch {
		return fallback;
	}
}

// Format file size
export function formatFileSize(bytes: number): string {
	if (bytes === 0) return '0 B';
	const k = 1024;
	const sizes = ['B', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

// Validate URL
export function isValidUrl(string: string): boolean {
	try {
		new URL(string);
		return true;
	} catch {
		return false;
	}
}

// Convert webcal:// to https://
export function normalizeCalendarUrl(url: string): string {
	return url.replace(/^webcal:\/\//i, 'https://');
}
