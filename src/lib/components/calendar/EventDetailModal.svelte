<script lang="ts">
	import { goto } from '$app/navigation';
	import { toast } from 'svelte-sonner';
	import { Button, Modal, Toggle } from '$components/ui';
	import { _ } from '$lib/i18n';
	import { calendar, categoriesStore, settingsStore } from '$stores';
	import { baseIcalUid, formatDateSmart, formatTimeRange } from '$utils';
	import { getPocketBase } from '$api/pocketbase';
	import ExternalEventReminderRow from './ExternalEventReminderRow.svelte';
	import type { DisplayEvent, ExternalEvent, CalendarEvent, CalendarSubscription } from '$types';

	interface Props {
		event: DisplayEvent | null;
		onclose: () => void;
	}

	let { event, onclose }: Props = $props();

	let subscription = $state<CalendarSubscription | null>(null);
	let subscriptionLoaded = $state(false);

	const open = $derived(event !== null);
	const format24h = $derived(settingsStore.timeFormat === '24h');

	const external = $derived(
		event && event.is_external ? (event.original_event as ExternalEvent) : null
	);

	const internal = $derived(
		event && !event.is_external ? (event.original_event as CalendarEvent) : null
	);

	const category = $derived(
		internal?.category ? categoriesStore.getById(internal.category) : null
	);
	const categoryColor = $derived(
		internal?.color_override || category?.color || '#7C9885'
	);

	function handleEdit() {
		if (!event) return;
		// event.id is a per-occurrence display key for recurring events —
		// editing must open the underlying record (the whole series).
		const id = event.original_event.id;
		onclose();
		goto(`/event/${id}`);
	}

	const externalPaused = $derived(external ? calendar.isExternalEventPaused(external) : false);

	// Pause is a recurring-events feature (matching the local event form,
	// where the toggle only appears when a repeat rule is set). Recurring
	// external occurrences are exactly the ones sync stamps with a
	// "::YYYYMMDDTHHMMSS" uid suffix, so a stripped base uid marks them.
	const externalRecurring = $derived(external ? baseIcalUid(external.uid) !== external.uid : false);

	async function handleExternalPauseChange(ext: ExternalEvent, paused: boolean) {
		try {
			if (paused) {
				await calendar.pauseExternalEvent(ext);
				toast.success($_('event.pausedToast'));
			} else {
				const pause = calendar.externalPauses.find(
					(p) => p.subscription === ext.subscription && p.ical_uid === baseIcalUid(ext.uid)
				);
				if (pause) await calendar.resumeExternalEvent(pause.id);
				toast.success($_('event.resumed'));
			}
		} catch (error) {
			console.error('Failed to toggle external event pause:', error);
			toast.error($_('errors.generic'));
		}
	}

	$effect(() => {
		if (!external) {
			subscription = null;
			subscriptionLoaded = false;
			return;
		}
		void loadSubscription(external.subscription);
	});

	async function loadSubscription(id: string) {
		subscriptionLoaded = false;
		try {
			const record = await getPocketBase()
				.collection('calendar_subscriptions')
				.getOne(id);
			subscription = record as unknown as CalendarSubscription;
		} catch {
			subscription = null;
		} finally {
			subscriptionLoaded = true;
		}
	}

	const dateLabel = $derived.by(() => {
		if (!event) return '';
		const t = {
			today: $_('common.today'),
			tomorrow: $_('common.tomorrow'),
			yesterday: $_('common.yesterday')
		};
		return formatDateSmart(event.start, t);
	});

	const timeLabel = $derived.by(() => {
		if (!event) return '';
		if (event.is_all_day) return $_('time.allDay');
		return formatTimeRange(event.start, event.end, format24h);
	});
</script>

{#snippet editFooter()}
	<Button onclick={handleEdit}>{$_('event.edit')}</Button>
{/snippet}

<Modal
	{open}
	title={event?.title ?? ''}
	size="md"
	{onclose}
	footer={event && !event.is_external ? editFooter : undefined}
>
	{#if event && external}
		<div class="space-y-4">
			<div class="flex items-center gap-2 flex-wrap">
				<span
					class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border-l-4"
					style:background-color="{event.color}20"
					style:border-left-color={event.color}
				>
					<span class="w-2 h-2 rounded-full" style:background-color={event.color}></span>
					<span class="text-neutral-700 dark:text-neutral-200">
						{event.subscription_name ?? $_('externalEvent.fromCalendar')}
					</span>
				</span>
				<span class="inline-flex items-center gap-1 rounded-full bg-neutral-100 dark:bg-neutral-700 px-2 py-1 text-xs text-neutral-600 dark:text-neutral-300">
					<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
					</svg>
					{$_('externalEvent.readOnly')}
				</span>
			</div>

			<div>
				<div class="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">
					{$_('event.date')}
				</div>
				<div class="text-sm text-neutral-800 dark:text-neutral-100">{dateLabel}</div>
				<div class="text-sm text-neutral-600 dark:text-neutral-300">{timeLabel}</div>
			</div>

			{#if external.location}
				<div>
					<div class="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">
						{$_('externalEvent.location')}
					</div>
					<div class="text-sm text-neutral-800 dark:text-neutral-100 whitespace-pre-line break-words">
						{external.location}
					</div>
				</div>
			{/if}

			{#if external.description}
				<div>
					<div class="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">
						{$_('event.description')}
					</div>
					<div class="text-sm text-neutral-800 dark:text-neutral-100 whitespace-pre-line break-words">
						{external.description}
					</div>
				</div>
			{/if}

			{#if subscriptionLoaded}
				<div class="pt-2 border-t border-neutral-100 dark:border-neutral-700">
					<div class="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-2">
						{$_('externalEvent.reminderHeader')}
					</div>
					<ExternalEventReminderRow {external} {subscription} />
				</div>
			{/if}

			{#if externalRecurring}
				<div class="pt-2 border-t border-neutral-100 dark:border-neutral-700">
					<Toggle
						checked={externalPaused}
						label={$_('event.pause')}
						description={$_('externalEvent.pauseDescription')}
						onchange={(checked) => handleExternalPauseChange(external, checked)}
					/>
				</div>
			{/if}
		</div>
	{:else if event && internal}
		<div class="space-y-4">
			{#if category}
				<div class="flex items-center gap-2 flex-wrap">
					<span
						class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border-l-4"
						style:background-color="{categoryColor}20"
						style:border-left-color={categoryColor}
					>
						<span class="w-2 h-2 rounded-full" style:background-color={categoryColor}></span>
						<span class="text-neutral-700 dark:text-neutral-200">{category.name}</span>
					</span>
				</div>
			{/if}

			<div>
				<div class="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">
					{$_('event.date')}
				</div>
				<div class="text-sm text-neutral-800 dark:text-neutral-100">{dateLabel}</div>
				<div class="text-sm text-neutral-600 dark:text-neutral-300">{timeLabel}</div>
			</div>

			{#if internal.description}
				<div>
					<div class="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">
						{$_('event.description')}
					</div>
					<div class="text-sm text-neutral-800 dark:text-neutral-100 whitespace-pre-line break-words">
						{internal.description}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</Modal>
