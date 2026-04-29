<script lang="ts">
	import { _ } from '$lib/i18n';
	import { toast } from 'svelte-sonner';
	import {
		upsertExternalEventReminderRemote,
		deleteExternalEventReminderRemote
	} from '$api/pocketbase';
	import {
		upsertExternalEventReminder,
		deleteExternalEventReminder,
		getExternalEventReminder
	} from '$db';
	import type { CalendarSubscription, ExternalEvent } from '$types';

	interface Props {
		external: ExternalEvent;
		subscription: CalendarSubscription | null;
	}

	let { external, subscription }: Props = $props();

	type Mode = 'default' | 'off' | 'custom';

	let mode = $state<Mode>('default');
	let customMinutes = $state<number>(15);
	let saving = $state(false);
	let loaded = $state(false);

	const remindersEnabled = $derived(subscription?.reminders_enabled ?? false);
	const defaultMinutes = $derived(subscription?.default_reminder_minutes ?? 15);

	$effect(() => {
		void hydrate(external.subscription, external.uid);
	});

	async function hydrate(subscriptionId: string, uid: string) {
		loaded = false;
		const row = await getExternalEventReminder(subscriptionId, uid);
		if (!row) {
			mode = 'default';
		} else if (row.disabled) {
			mode = 'off';
		} else if (row.minutes_before !== null && row.minutes_before !== undefined) {
			mode = 'custom';
			customMinutes = row.minutes_before;
		} else {
			mode = 'default';
		}
		loaded = true;
	}

	async function persist() {
		if (!subscription) return;
		saving = true;
		try {
			if (mode === 'default') {
				await deleteExternalEventReminderRemote(external.subscription, external.uid);
				await deleteExternalEventReminder(external.subscription, external.uid);
			} else if (mode === 'off') {
				await upsertExternalEventReminderRemote(
					external.subscription,
					external.uid,
					null,
					true
				);
				await upsertExternalEventReminder({
					user: external.user,
					subscription: external.subscription,
					ical_uid: external.uid,
					minutes_before: undefined,
					disabled: true
				});
			} else {
				await upsertExternalEventReminderRemote(
					external.subscription,
					external.uid,
					customMinutes,
					false
				);
				await upsertExternalEventReminder({
					user: external.user,
					subscription: external.subscription,
					ical_uid: external.uid,
					minutes_before: customMinutes,
					disabled: false
				});
			}
			toast.success($_('externalEvent.reminderSaved'));
		} catch (err) {
			toast.error($_('errors.generic'));
		} finally {
			saving = false;
		}
	}

	function onModeChange(newMode: Mode) {
		mode = newMode;
		void persist();
	}

	function onCustomMinutesChange(value: number) {
		customMinutes = value;
		if (mode === 'custom') void persist();
	}

	const minuteOptions = [5, 10, 15, 30, 60, 120, 1440];
</script>

{#if !remindersEnabled}
	<div class="text-xs text-neutral-500 dark:text-neutral-400">
		{$_('externalEvent.remindersOffForSubscription')}
	</div>
{:else if loaded}
	<div class="space-y-2">
		<div class="flex flex-wrap items-center gap-2">
			<label class="inline-flex items-center gap-1.5 text-sm">
				<input
					type="radio"
					name="reminder-mode"
					value="default"
					checked={mode === 'default'}
					disabled={saving}
					onchange={() => onModeChange('default')}
				/>
				<span class="text-neutral-700 dark:text-neutral-200">
					{$_('externalEvent.reminderUseDefault', { values: { minutes: defaultMinutes } })}
				</span>
			</label>
			<label class="inline-flex items-center gap-1.5 text-sm">
				<input
					type="radio"
					name="reminder-mode"
					value="custom"
					checked={mode === 'custom'}
					disabled={saving}
					onchange={() => onModeChange('custom')}
				/>
				<span class="text-neutral-700 dark:text-neutral-200">{$_('externalEvent.reminderCustom')}</span>
			</label>
			<label class="inline-flex items-center gap-1.5 text-sm">
				<input
					type="radio"
					name="reminder-mode"
					value="off"
					checked={mode === 'off'}
					disabled={saving}
					onchange={() => onModeChange('off')}
				/>
				<span class="text-neutral-700 dark:text-neutral-200">{$_('externalEvent.reminderOff')}</span>
			</label>
		</div>

		{#if mode === 'custom'}
			<select
				bind:value={customMinutes}
				disabled={saving}
				onchange={() => onCustomMinutesChange(customMinutes)}
				class="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-sm text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
			>
				{#each minuteOptions as m (m)}
					<option value={m}>
						{m < 60
							? $_('time.minutes', { values: { count: m } })
							: m === 1440
								? `1 ${$_('time.day')}`
								: $_('time.hours', { values: { count: m / 60 } })}
					</option>
				{/each}
			</select>
		{/if}
	</div>
{/if}
