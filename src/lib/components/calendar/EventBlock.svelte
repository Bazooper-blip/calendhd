<script lang="ts">
	import { cn, getContrastColor, formatTime, formatTimeRange } from '$utils';
	import { settingsStore, calendar } from '$stores';
	import { _ } from '$lib/i18n';
	import { EventIcon } from '$components/ui';
	import type { DisplayEvent } from '$types';

	interface Props {
		event: DisplayEvent;
		style?: string;
		compact?: boolean;
		onclick?: () => void;
		now?: Date;
	}

	let { event, style = '', compact = false, onclick, now }: Props = $props();

	const format24h = $derived(settingsStore.timeFormat === '24h');
	const textColor = $derived(getContrastColor(event.color));
	const isHappeningNow = $derived.by(() => {
		if (!now) return false;
		if (event.start > now) return false;
		if (event.end) return now < event.end;
		return now.getTime() < event.start.getTime() + 60_000;
	});

	function handleCheckboxClick(e: MouseEvent) {
		e.stopPropagation();
		calendar.toggleTaskComplete(event.id);
	}
</script>

<button
	type="button"
	class={cn(
		'absolute inset-x-1 rounded-lg overflow-hidden text-left transition-all hover:ring-2 hover:ring-primary-500 hover:ring-offset-1 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1 min-h-[40px]',
		event.is_external && 'opacity-80 border-l-4 border-l-secondary-500',
		event.is_task && 'border-l-4 border-l-amber-400',
		event.is_completed && 'opacity-60',
		isHappeningNow && 'ring-2 ring-primary-400 ring-offset-2 ring-offset-white dark:ring-offset-neutral-900 shadow-md'
	)}
	{style}
	style:background-color={event.color}
	{onclick}
>
	<div class="px-2 py-1 h-full flex items-start gap-2" style:color={textColor}>
		{#if event.is_task}
			<!-- Task checkbox -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<!-- svelte-ignore a11y_interactive_supports_focus -->
			<span
				onclick={handleCheckboxClick}
				class={cn(
					'flex-shrink-0 mt-0.5 w-4 h-4 rounded border-2 flex items-center justify-center transition-colors cursor-pointer',
					event.is_completed
						? 'bg-white/30 border-white/50'
						: 'border-white/70 hover:border-white'
				)}
				role="checkbox"
				aria-checked={event.is_completed}
				aria-label={event.is_completed ? $_('event.markIncomplete') : $_('event.markComplete')}
			>
				{#if event.is_completed}
					<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
						<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
					</svg>
				{/if}
			</span>
		{/if}
		<div class="flex-1 min-w-0 flex flex-col justify-center">
			{#if event.routine_group_name}
				<span class="text-[10px] opacity-70 truncate block" style:color={textColor}>{event.routine_group_name}</span>
			{/if}
			<span class={cn(
				'font-medium truncate flex items-center gap-1',
				compact ? 'text-xs' : 'text-sm leading-tight',
				event.is_completed && 'line-through opacity-80'
			)}>
				{#if event.icon}
					<EventIcon icon={event.icon} size="md" />
				{/if}
				{event.title}
				{#if event.energy_level}
					<span
						class="flex-shrink-0 w-1.5 h-1.5 rounded-full"
						class:bg-green-400={event.energy_level === 'low'}
						class:bg-amber-400={event.energy_level === 'medium'}
						class:bg-red-400={event.energy_level === 'high'}
					></span>
				{/if}
				{#if isHappeningNow}
					<span class="flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-white/30 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide">
						<span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
						{$_('event.now')}
					</span>
				{/if}
			</span>
			{#if !event.is_all_day}
				<span class={cn('opacity-80 truncate', compact ? 'text-[10px]' : 'text-xs')}>
					{#if compact}
						{formatTime(event.start, format24h)}
					{:else}
						{formatTimeRange(event.start, event.end, format24h)}
					{/if}
				</span>
			{:else if !compact}
				<span class="text-xs opacity-80 truncate">{$_('time.allDay')}</span>
			{/if}
			{#if event.is_external && !compact}
				<span class="text-xs opacity-70 truncate">
					{event.subscription_name}
				</span>
			{/if}
		</div>
	</div>
</button>
