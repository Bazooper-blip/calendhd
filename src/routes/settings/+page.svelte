<script lang="ts">
	import { browser } from '$app/environment';
	import { settingsStore } from '$stores';
	import { Select, Toggle, Button } from '$components/ui';
	import { toast } from 'svelte-sonner';
	import { _, availableLocales } from '$lib/i18n';
	import {
		isNotificationSupported,
		getNotificationPermission,
		requestNotificationPermission,
		sendTestNotification,
		hasPushSubscription,
		subscribeToPush,
		savePushSubscription,
		unsubscribeFromPush,
		removePushSubscription
	} from '$utils';
	import { testServerNotification, getVapidPublicKey } from '$api/pocketbase';

	// Notification state
	let notificationSupported = $state(false);
	let notificationPermission = $state<NotificationPermission | 'unsupported'>('unsupported');
	let hasSubscription = $state(false);
	let notificationLoading = $state(false);
	let pushTestLoading = $state(false);

	// Initialize notification state on mount
	$effect(() => {
		if (browser) {
			notificationSupported = isNotificationSupported();
			notificationPermission = getNotificationPermission();

			// Check subscription status
			hasPushSubscription().then((has) => {
				hasSubscription = has;
			});
		}
	});

	async function handleEnableNotifications() {
		notificationLoading = true;
		try {
			// First request permission
			const permission = await requestNotificationPermission();
			notificationPermission = permission;

			if (permission === 'granted') {
				// Get VAPID public key from server
				const vapidKey = await getVapidPublicKey();
				if (!vapidKey) {
					toast.error($_('settings.pushNotConfigured'));
					return;
				}

				// Subscribe to push notifications
				const subscription = await subscribeToPush(vapidKey);
				if (subscription) {
					// Save subscription to server
					await savePushSubscription(subscription);
					hasSubscription = true;
					toast.success($_('settings.notificationsEnabled'));
				}
			} else if (permission === 'denied') {
				toast.error($_('settings.notificationsDenied'));
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : $_('settings.notificationsEnableFailed'));
		} finally {
			notificationLoading = false;
		}
	}

	async function handleDisableNotifications() {
		notificationLoading = true;
		try {
			await unsubscribeFromPush();
			await removePushSubscription();
			hasSubscription = false;
			toast.success($_('settings.notificationsDisabled'));
		} catch (error) {
			toast.error(error instanceof Error ? error.message : $_('settings.notificationsDisableFailed'));
		} finally {
			notificationLoading = false;
		}
	}

	async function handleTestNotification() {
		try {
			await sendTestNotification();
			toast.success($_('settings.testNotificationSent'));
		} catch (error) {
			toast.error(error instanceof Error ? error.message : $_('settings.testNotificationFailed'));
		}
	}

	async function handleTestPushNotification() {
		pushTestLoading = true;
		try {
			const result = await testServerNotification();
			if (result.success) {
				toast.success($_('settings.pushTestSuccess'));
			} else {
				toast.error(result.error || $_('settings.pushTestFail'));
			}
		} catch (error) {
			toast.error(error instanceof Error ? error.message : $_('settings.pushTestFail'));
		} finally {
			pushTestLoading = false;
		}
	}

	const viewOptions = $derived([
		{ value: 'day', label: $_('nav.day') },
		{ value: 'week', label: $_('nav.week') },
		{ value: 'month', label: $_('nav.month') }
	]);

	const weekStartOptions = $derived([
		{ value: '0', label: $_('settings.sunday') },
		{ value: '1', label: $_('settings.monday') },
		{ value: '6', label: $_('settings.saturday') }
	]);

	const timeFormatOptions = $derived([
		{ value: '12h', label: $_('settings.time12h') + ' (1:00 PM)' },
		{ value: '24h', label: $_('settings.time24h') + ' (13:00)' }
	]);

	const themeOptions = $derived([
		{ value: 'system', label: $_('settings.themeSystem') },
		{ value: 'light', label: $_('settings.themeLight') },
		{ value: 'dark', label: $_('settings.themeDark') }
	]);

	const densityOptions = $derived([
		{ value: 'compact', label: $_('settings.densityCompact') },
		{ value: 'comfortable', label: $_('settings.densityComfortable') },
		{ value: 'spacious', label: $_('settings.densitySpacious') }
	]);

	const languageOptions = availableLocales.map((l) => ({
		value: l.code,
		label: `${l.nativeName} (${l.name})`
	}));

	async function handleChange(key: string, value: any) {
		try {
			await settingsStore.update({ [key]: value });
			toast.success($_('settings.saved'));
		} catch (error) {
			toast.error($_('errors.saveSettings'));
		}
	}

	const accentPalettes = [
		{ value: 'sage', color: '#5f8069' },
		{ value: 'ocean', color: '#5b85a6' },
		{ value: 'lavender', color: '#8b7bab' },
		{ value: 'rose', color: '#b07a8a' },
		{ value: 'amber', color: '#a68b5b' },
		{ value: 'teal', color: '#5b9e96' }
	] as const;
</script>

<div class="h-full overflow-y-auto">
	<div class="max-w-2xl mx-auto px-4 py-6">
		<h1 class="text-2xl font-bold text-neutral-800 dark:text-neutral-100 mb-6">{$_('settings.title')}</h1>

		<div class="space-y-6">
			<!-- Appearance Settings -->
			<section class="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700 p-6">
				<h2 class="text-lg font-semibold text-neutral-800 dark:text-neutral-100 mb-4">{$_('settings.appearance')}</h2>

				<div class="space-y-4">
					<div>
						<label for="theme" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
							{$_('settings.theme')}
						</label>
						<Select
							id="theme"
							options={themeOptions}
							value={settingsStore.theme}
							onchange={(e) => handleChange('theme', (e.target as HTMLSelectElement).value)}
						/>
					</div>

					<div>
						<label for="language" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
							{$_('settings.language')}
						</label>
						<Select
							id="language"
							options={languageOptions}
							value={settingsStore.locale}
							onchange={(e) => handleChange('locale', (e.target as HTMLSelectElement).value)}
						/>
					</div>

					<div>
						<span class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
							{$_('settings.accentColor')}
						</span>
						<div class="flex flex-wrap gap-3">
							{#each accentPalettes as palette}
								<button
									type="button"
									onclick={() => handleChange('color_palette', palette.value)}
									aria-label={$_(`settings.accent${palette.value.charAt(0).toUpperCase() + palette.value.slice(1)}`)}
									class="group flex flex-col items-center gap-1.5"
								>
									<div
										class="w-10 h-10 rounded-full flex items-center justify-center transition-all {settingsStore.colorPalette === palette.value
											? 'ring-2 ring-offset-2 ring-offset-white dark:ring-offset-neutral-800 ring-primary-500 scale-110'
											: 'hover:scale-105'}"
										style:background-color={palette.color}
									>
										{#if settingsStore.colorPalette === palette.value}
											<svg class="w-5 h-5 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
												<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
											</svg>
										{/if}
									</div>
									<span class="text-xs text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition-colors">
										{$_(`settings.accent${palette.value.charAt(0).toUpperCase() + palette.value.slice(1)}`)}
									</span>
								</button>
							{/each}
						</div>
					</div>
				</div>
			</section>

			<!-- Calendar Settings -->
			<section class="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700 p-6">
				<h2 class="text-lg font-semibold text-neutral-800 dark:text-neutral-100 mb-4">{$_('settings.calendar')}</h2>

				<div class="space-y-4">
					<div>
						<label for="default-view" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
							{$_('settings.defaultView')}
						</label>
						<Select
							id="default-view"
							options={viewOptions}
							value={settingsStore.defaultView}
							onchange={(e) => handleChange('default_view', (e.target as HTMLSelectElement).value)}
						/>
					</div>

					<div>
						<label for="week-starts" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
							{$_('settings.weekStartsOn')}
						</label>
						<Select
							id="week-starts"
							options={weekStartOptions}
							value={settingsStore.weekStartsOn.toString()}
							onchange={(e) => handleChange('week_starts_on', parseInt((e.target as HTMLSelectElement).value))}
						/>
					</div>

					<div>
						<label for="time-format" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
							{$_('settings.timeFormat')}
						</label>
						<Select
							id="time-format"
							options={timeFormatOptions}
							value={settingsStore.timeFormat}
							onchange={(e) => handleChange('time_format', (e.target as HTMLSelectElement).value)}
						/>
					</div>
				</div>
			</section>

			<!-- Accessibility Settings -->
			<section class="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700 p-6">
				<h2 class="text-lg font-semibold text-neutral-800 dark:text-neutral-100 mb-4">{$_('settings.accessibility')}</h2>

				<div class="space-y-4">
					<Toggle
						checked={settingsStore.reduceAnimations}
						onchange={(checked) => handleChange('reduce_animations', checked)}
						label={$_('settings.reduceAnimations')}
						description={$_('settings.reduceAnimationsDescription')}
					/>

					<Toggle
						checked={settingsStore.highContrast}
						onchange={(checked) => handleChange('high_contrast', checked)}
						label={$_('settings.highContrast')}
						description={$_('settings.highContrastDescription')}
					/>

					<div>
						<label for="density" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
							{$_('settings.density')}
						</label>
						<p class="text-xs text-neutral-500 dark:text-neutral-400 mb-2">{$_('settings.densityDescription')}</p>
						<Select
							id="density"
							options={densityOptions}
							value={settingsStore.density}
							onchange={(e) => handleChange('density', (e.target as HTMLSelectElement).value)}
						/>
					</div>

					<div>
						<label for="buffer-minutes" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
							{$_('settings.bufferMinutes')}
						</label>
						<p class="text-xs text-neutral-500 dark:text-neutral-400 mb-2">{$_('settings.bufferMinutesDescription')}</p>
						<input
							id="buffer-minutes"
							type="number"
							min="0"
							max="60"
							step="5"
							value={settingsStore.bufferMinutes}
							onchange={(e) => handleChange('buffer_minutes', parseInt((e.target as HTMLInputElement).value) || 0)}
							class="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100 border-neutral-200 dark:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary-500"
						/>
					</div>

					<Toggle
						checked={settingsStore.dailyWinsEnabled}
						onchange={(checked) => handleChange('daily_wins_enabled', checked)}
						label={$_('settings.dailyWins')}
						description={$_('settings.dailyWinsDescription')}
					/>

					<Toggle
						checked={settingsStore.streakCelebrationEnabled}
						onchange={(checked) => handleChange('streak_celebration_enabled', checked)}
						label={$_('settings.streakCelebration')}
						description={$_('settings.streakCelebrationDescription')}
					/>
				</div>
			</section>

			<!-- Push Notifications -->
			<section class="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700 p-6">
				<h2 class="text-lg font-semibold text-neutral-800 dark:text-neutral-100 mb-4">{$_('settings.notifications')}</h2>

				<div class="space-y-4">
					<p class="text-sm text-neutral-600 dark:text-neutral-400">
						{$_('settings.pushNotificationsDesc') || 'Receive push notifications for event reminders directly on your device, even when the app is closed.'}
					</p>

					{#if !notificationSupported}
						<div class="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
							<p class="text-sm text-amber-700 dark:text-amber-300">
								{$_('settings.notificationsNotSupported') || 'Push notifications are not supported on this device/browser. Try installing the app or using a different browser.'}
							</p>
						</div>
					{:else if notificationPermission === 'denied'}
						<div class="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg">
							<p class="text-sm text-red-700 dark:text-red-300">
								{$_('settings.notificationsBlocked') || 'Notifications are blocked. Please enable them in your browser/device settings.'}
							</p>
						</div>
					{:else if hasSubscription}
						<div class="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg">
							<div class="flex items-start justify-between">
								<div>
									<p class="text-sm font-medium text-green-700 dark:text-green-300">
										✓ {$_('settings.pushEnabled') || 'Push notifications enabled'}
									</p>
									<p class="text-xs text-green-600 dark:text-green-400 mt-1">
										{$_('settings.pushEnabledDesc') || 'You will receive reminders for your events on this device'}
									</p>
								</div>
							</div>
							<div class="flex gap-2 mt-3">
								<Button variant="ghost" size="sm" onclick={handleTestNotification}>
									{$_('settings.testLocal') || 'Test Local'}
								</Button>
								<Button variant="ghost" size="sm" onclick={handleTestPushNotification} loading={pushTestLoading}>
									{$_('settings.testPush') || 'Test Push'}
								</Button>
								<Button variant="ghost" size="sm" onclick={handleDisableNotifications} loading={notificationLoading}>
									{$_('settings.disable') || 'Disable'}
								</Button>
							</div>
						</div>
					{:else}
						<div class="p-4 bg-neutral-50 dark:bg-neutral-900 rounded-lg">
							<p class="text-sm text-neutral-600 dark:text-neutral-400 mb-3">
								{$_('settings.notificationsDescription') || 'Enable push notifications to receive reminders for your events.'}
							</p>
							<Button onclick={handleEnableNotifications} loading={notificationLoading}>
								<svg class="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
								</svg>
								{$_('settings.enablePushNotifications') || 'Enable Push Notifications'}
							</Button>
						</div>
					{/if}

					<Toggle
						checked={settingsStore.notificationSound}
						onchange={(checked) => handleChange('notification_sound', checked)}
						label={$_('settings.notificationSound')}
						description={$_('settings.notificationSoundDescription') || 'Play a sound with notifications'}
					/>
				</div>
			</section>

			<!-- Timezone -->
			<section class="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700 p-6">
				<h2 class="text-lg font-semibold text-neutral-800 dark:text-neutral-100 mb-4">Time Zone</h2>

				<p class="text-sm text-neutral-600 dark:text-neutral-400">
					Current timezone: <strong class="text-neutral-800 dark:text-neutral-200">{settingsStore.timezone}</strong>
				</p>
				<p class="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
					Timezone is automatically detected from your device
				</p>
			</section>
		</div>
	</div>
</div>
