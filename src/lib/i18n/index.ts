import { browser } from '$app/environment';
import { init, register, getLocaleFromNavigator, locale, waitLocale, addMessages } from 'svelte-i18n';

// Import default locale synchronously to avoid loading issues
import en from './locales/en.json';

// Add English translations synchronously
addMessages('en', en);

// Register Swedish as lazy-loaded
register('sv', () => import('./locales/sv.json'));

// Default locale and fallback
const defaultLocale = 'en';
const fallbackLocale = 'en';

let initialized = false;

// Initialize i18n
export function initI18n(initialLocale?: string) {
	if (initialized) return;
	initialized = true;

	// Get browser locale or use default
	let detectedLocale = initialLocale || defaultLocale;

	if (browser && !initialLocale) {
		const browserLocale = getLocaleFromNavigator();
		// Only use browser locale if it's one we support
		if (browserLocale && (browserLocale.startsWith('sv') || browserLocale.startsWith('en'))) {
			detectedLocale = browserLocale.startsWith('sv') ? 'sv' : 'en';
		}
	}

	init({
		fallbackLocale,
		initialLocale: detectedLocale
	});
}

// Wait for locale to be loaded (for SSR)
export { waitLocale };

// Set locale (for use in settings)
export function setLocale(newLocale: string) {
	locale.set(newLocale);
}

// Available locales for the settings UI
export const availableLocales = [
	{ code: 'en', name: 'English', nativeName: 'English' },
	{ code: 'sv', name: 'Swedish', nativeName: 'Svenska' }
];

// Re-export for convenience
export { locale, t, date, time, number, isLoading } from 'svelte-i18n';
// Use _ as alias for t (common convention)
export { t as _ } from 'svelte-i18n';
