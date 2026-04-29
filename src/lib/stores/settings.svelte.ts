import { browser } from '$app/environment';
import { getUserSettings, updateUserSettings, getDefaultSettings } from '$api/pocketbase';
import { getLocalSettings, setLocalSettings } from '$db';
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
		get reduceAnimations() {
			return settings?.reduce_animations ?? defaults.reduce_animations;
		},
		get highContrast() {
			return settings?.high_contrast ?? defaults.high_contrast;
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
		async load() {
			if (!browser) return;

			loading = true;
			const userId = auth.user?.id;

			if (!userId) {
				settings = null;
				loading = false;
				return;
			}

			// Try to load from local DB first (for offline support)
			const localSettings = await getLocalSettings(userId);
			if (localSettings) {
				settings = localSettings;
				// Sync locale with i18n
				if (localSettings.locale) {
					setLocale(localSettings.locale);
					setDateLocale(localSettings.locale);
				}
				// Sync timezone with date utils
				if (localSettings.timezone) {
					setTimezone(localSettings.timezone);
				}
			}

			// Then try to sync from server
			try {
				const serverSettings = await getUserSettings();
				if (serverSettings) {
					settings = serverSettings;
					await setLocalSettings(serverSettings);
					// Sync locale with i18n
					if (serverSettings.locale) {
						setLocale(serverSettings.locale);
					setDateLocale(serverSettings.locale);
					}
					// Sync timezone with date utils
					if (serverSettings.timezone) {
						setTimezone(serverSettings.timezone);
					}
				} else if (localSettings) {
					// Server has no settings but we have local - clear stale local cache
					// The ID in local settings is no longer valid
					settings = null;
				}
			} catch {
				// Offline, use local settings
			}

			loading = false;
		},

		async update(changes: Partial<UserSettings>) {
			const userId = auth.user?.id;
			if (!userId) return;

			// If no settings exist yet, create with defaults + changes
			const baseSettings = settings || {
				...defaults,
				id: '',
				created: '',
				updated: '',
				user: userId
			} as UserSettings;

			// Optimistically update local state
			settings = { ...baseSettings, ...changes };

			// Sync locale with i18n if changed
			if (changes.locale) {
				setLocale(changes.locale);
				setDateLocale(changes.locale);
			}
			// Sync timezone with date utils if changed
			if (changes.timezone) {
				setTimezone(changes.timezone);
			}

			// Try to sync to server first (this will create settings if they don't exist)
			// Pass the existing ID if we have one to avoid creating duplicates
			try {
				const existingId = baseSettings.id || undefined;
				const serverSettings = await updateUserSettings(changes, existingId);
				settings = serverSettings;
				// Only save to local DB after we have a valid server response with ID
				await setLocalSettings(serverSettings);
			} catch (error) {
				console.error('Failed to update settings:', error);
				// Offline, keep local changes (but don't save to local DB without valid ID)
				if (baseSettings.id) {
					await setLocalSettings({ ...baseSettings, ...changes });
				}
			}
		}
	};
}

export const settingsStore = createSettingsStore();
