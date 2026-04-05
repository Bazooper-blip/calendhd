<script lang="ts">
	import { cn, getContrastColor, formatTimeRange, formatDateSmart, formatRecurrenceRule } from '$utils';
	import { settingsStore, categoriesStore } from '$stores';
	import { EventIcon } from '$components/ui';
	import type { CalendarEvent, ExternalEvent } from '$types';

	interface Props {
		event: CalendarEvent | ExternalEvent;
		isExternal?: boolean;
		onclick?: () => void;
	}

	let { event, isExternal = false, onclick }: Props = $props();

	const format24h = $derived(settingsStore.timeFormat === '24h');

	const category = $derived(
		'category' in event && event.category
			? categoriesStore.getById(event.category)
			: null
	);

	const color = $derived(
		('color_override' in event && event.color_override) ||
		category?.color ||
		'#7C9885'
	);

	const textColor = $derived(getContrastColor(color));

	const hasRecurrence = $derived(
		'recurrence_rule' in event && event.recurrence_rule
	);
</script>

<button
	type="button"
	class={cn(
		'w-full p-4 rounded-xl text-left transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2',
		isExternal && 'border-l-4 border-secondary-500'
	)}
	style:background-color={color}
	style:color={textColor}
	{onclick}
>
	<div class="flex items-start justify-between gap-3">
		<div class="flex-1 min-w-0">
			<!-- Time -->
			<p class="text-sm opacity-80">
				{#if event.is_all_day}
					{formatDateSmart(new Date(event.start_time))} · All day
				{:else}
					{formatDateSmart(new Date(event.start_time))} ·
					{formatTimeRange(
						new Date(event.start_time),
						event.end_time ? new Date(event.end_time) : undefined,
						format24h
					)}
				{/if}
			</p>

			<!-- Title -->
			<h3 class="text-lg font-semibold mt-1 truncate flex items-center gap-1.5">
				{#if 'icon' in event && event.icon}
					<EventIcon icon={event.icon} size="lg" />
				{/if}
				{event.title}
			</h3>

			<!-- Category & recurrence -->
			<div class="flex items-center gap-2 mt-2 text-sm opacity-70">
				{#if category}
					<span class="flex items-center gap-1">
						<span class="w-2 h-2 rounded-full bg-white/50"></span>
						{category.name}
					</span>
				{/if}
				{#if hasRecurrence}
					<span class="flex items-center gap-1">
						<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
						</svg>
						{formatRecurrenceRule((event as CalendarEvent).recurrence_rule!)}
					</span>
				{/if}
				{#if isExternal}
					<span class="flex items-center gap-1">
						<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
						</svg>
						External
					</span>
				{/if}
			</div>

			<!-- Description preview -->
			{#if event.description}
				<p class="mt-2 text-sm opacity-60 line-clamp-2">
					{event.description}
				</p>
			{/if}
		</div>

		<!-- Completed indicator -->
		{#if 'completed_at' in event && event.completed_at}
			<div class="flex-shrink-0 p-1 bg-white/20 rounded-full">
				<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
				</svg>
			</div>
		{/if}
	</div>
</button>
