<script lang="ts">
	import { Modal } from '$components/ui';
	import { _ } from '$lib/i18n';
	import { settingsStore } from '$stores';
	import { formatDateSmart, formatTimeRange } from '$utils';
	import type { DisplayEvent, ExternalEvent } from '$types';

	interface Props {
		event: DisplayEvent | null;
		onclose: () => void;
	}

	let { event, onclose }: Props = $props();

	const open = $derived(event !== null);
	const format24h = $derived(settingsStore.timeFormat === '24h');

	const external = $derived.by(() => {
		if (!event) return null;
		return event.original_event as ExternalEvent;
	});

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

<Modal {open} title={event?.title ?? ''} size="md" {onclose}>
	{#if event && external}
		<div class="space-y-4">
			<!-- Read-only badge + subscription source -->
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

			<!-- When -->
			<div>
				<div class="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">
					{$_('event.date')}
				</div>
				<div class="text-sm text-neutral-800 dark:text-neutral-100">{dateLabel}</div>
				<div class="text-sm text-neutral-600 dark:text-neutral-300">{timeLabel}</div>
			</div>

			<!-- Location -->
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

			<!-- Description -->
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
		</div>
	{/if}
</Modal>
