import type { Locale } from 'date-fns';
import { enUS } from 'date-fns/locale';

// Reactive holder for the app-wide date locale/timezone. Formatting helpers in
// date.ts read through this proxy, so strings rendered before user settings
// finish loading re-render when setDateLocale()/setTimezone() are called —
// a plain module variable would leave them stuck in English (see settings store).
export const dateConfig = $state({
	timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
	locale: enUS as Locale,
	weekStartsOn: 1 as 0 | 1 | 6 // Monday by default; a saved setting overrides
});
