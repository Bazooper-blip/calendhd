import { browser } from '$app/environment';
import { getUserSettings, updateUserSettings, getDefaultSettings } from '$api/pocketbase';
import { auth } from './auth.svelte';
import { setLocale } from '$lib/i18n';
import { setTimezone, setDateLocale } from '$lib/utils/date';
import type { UserSettings } from '$types';

// Settings store using Svelte 5 runes
function createSettingsStore() {
	let settings = $state<UserSettings | null>(null);
	let loading = $state(true);

	const defaults = getDefaultSettings();

	return {
		get settings() {
			return settings;
		},
		get loading() {
			return loading;
		},

		// Computed getters with defaults
		get defaultView() {
			return settings?.default_view ?? defaults.default_view;
		},
		get weekStartsOn() {
			return settings?.week_starts_on ?? defaults.week_starts_on;
		},
		get timeFormat() {
			return settings?.time_format ?? defaults.time_format;
		},
		get theme() {
			return settings?.theme ?? defaults.theme;
		},
		get locale() {
			return settings?.locale ?? defaults.locale;
		},
		get defaultReminders() {
			return settings?.default_reminders ?? defaults.default_reminders;
		},
		get notificationSound() {
			return settings?.notification_sound ?? defaults.notification_sound;
		},
		get colorPalette(): 'sage' | 'ocean' | 'lavender' | 'rose' | 'amber' | 'teal' {
			const val = settings?.color_palette;
			if (val === 'sage' || val === 'ocean' || val === 'lavender' || val === 'rose' || val === 'amber' || val === 'teal') {
				return val;
			}
			return 'sage';
		},
		get timezone() {
			return settings?.timezone ?? defaults.timezone;
		},
		get bufferMinutes() {
			return settings?.buffer_minutes ?? defaults.buffer_minutes ?? 10;
		},
		get density(): 'compact' | 'comfortable' | 'spacious' {
			return (settings?.density ?? defaults.density ?? 'comfortable') as 'compact' | 'comfortable' | 'spacious';
		},
		get dailyWinsEnabled() {
			return settings?.daily_wins_enabled ?? defaults.daily_wins_enabled ?? true;
		},
		get streakCelebrationEnabled() {
			return settings?.streak_celebration_enabled ?? defaults.streak_celebration_enabled ?? true;
		},
		get dayViewStyle(): 'timeline' | 'agenda' {
			const val = settings?.day_view_style ?? defaults.day_view_style;
			return val === 'agenda' ? 'agenda' : 'timeline';
		},

		async load() {
			if (!browser) return;

			loading = true;
			const userId = auth.user?.id;

			if (!userId) {
				settings = null;
				loading = false;
				return;
			}

			try {
				const serverSettings = await getUserSettings();
				settings = serverSettings;
				if (serverSettings?.locale) {
					setLocale(serverSettings.locale);
					setDateLocale(serverSettings.locale);
				}
				if (serverSettings?.timezone) {
					setTimezone(serverSettings.timezone);
				}
			} catch (error) {
				console.error('Failed to load settings:', error);
			}

			loading = false;
		},

		async update(changes: Partial<UserSettings>) {
			const userId = auth.user?.id;
			if (!userId) return;

			const existingId = settings?.id || undefined;
			const serverSettings = await updateUserSettings(changes, existingId);
			settings = serverSettings;

			// Apply UI side-effects from the persisted result
			if (serverSettings.locale) {
				setLocale(serverSettings.locale);
				setDateLocale(serverSettings.locale);
			}
			if (serverSettings.timezone) {
				setTimezone(serverSettings.timezone);
			}
		}
	};
}

export const settingsStore = createSettingsStore();
