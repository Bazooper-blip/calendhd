<script lang="ts">
	import { browser } from '$app/env';
	import { goto } from '$app/navigation';
	import { calendar, settingsStore, weekLayoutStore } from '#stores';
	import { _ } from '#lib/i18n/index.js';
	import {
		buildWeekListDays,
		cn,
		format,
		formatDayOfWeek,
		formatTime,
		getContrastColor,
		getDaysInRange,
		getWeekNumber,
		isToday,
		startOfWeek,
		endOfWeek
	} from '#utils';
	import type { WeekListItem } from '#utils';
	import type { DisplayEvent } from '#types';
	import { Check, LayoutGrid, Plus } from '@lucide/svelte';
	import { EventIcon } from '#components/ui/index.js';
	import EventDetailModal from './EventDetailModal.svelte';

	// Week as one row per day: every event readable at a glance, no time grid
	// to scroll. A busy day simply gets a taller row (no "+N more").
	let { date = $bindable(new Date()) }: { date?: Date } = $props();

	const weekStartsOn = $derived(settingsStore.weekStartsOn);
	const format24h = $derived(settingsStore.timeFormat === '24h');

	const days = $derived(
		getDaysInRange(startOfWeek(date, { weekStartsOn }), endOfWeek(date, { weekStartsOn }))
	);
	const weekNumber = $derived(getWeekNumber(days[0], weekStartsOn));

	let now = $state(new Date());
	$effect(() => {
		const interval = setInterval(() => {
			now = new Date();
		}, 60_000);
		return () => clearInterval(interval);
	});

	const weekDays = $derived(
		buildWeekListDays({
			events: calendar.displayEvents,
			days,
			now,
			routineFallback: $_('calendar.routineFallback')
		})
	);

	// Bring today's row into view when the list opens on the current week
	let listRef: HTMLDivElement | undefined = $state();
	$effect(() => {
		if (!browser || !listRef || !days.some((d) => isToday(d))) return;
		listRef.querySelector('[data-today]')?.scrollIntoView({ block: 'nearest' });
	});

	function formatRelative(min: number): string {
		if (min < 60) return `${min} min`;
		const h = Math.floor(min / 60);
		const m = min % 60;
		return m === 0 ? `${h}h` : `${h}h ${m}m`;
	}

	function minutesUntil(target: Date): number {
		return Math.max(0, Math.round((target.getTime() - now.getTime()) / 60_000));
	}

	let eventDetail = $state<DisplayEvent | null>(null);

	function openDay(day: Date) {
		goto(`/calendar/day/${format(day, 'yyyy-MM-dd')}`);
	}

	// Routines are checked off step by step in the day view, so a routine
	// line opens that day; a plain event opens its detail modal.
	function handleItemClick(item: WeekListItem, day: Date) {
		if (item.kind === 'event') eventDetail = item.event;
		else openDay(day);
	}

	// Tap-to-add: empty space in a day's row opens the new-event form for
	// that day. Items are children of the row, so only act on a direct hit.
	function handleRowClick(e: MouseEvent, day: Date) {
		if (e.target !== e.currentTarget) return;
		goto(`/event/new?date=${format(day, 'yyyy-MM-dd')}`);
	}
</script>

<div class="flex flex-col h-full">
	<div class="flex-shrink-0 flex items-center gap-3 px-3 py-2 border-b border-neutral-100 dark:border-neutral-800">
		<span class="text-xs font-medium text-neutral-400 dark:text-neutral-500">
			{$_('calendar.weekNumber', { values: { week: weekNumber } })}
		</span>
		<button
			type="button"
			onclick={() => weekLayoutStore.set('grid')}
			class="ml-auto inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-200"
		>
			<LayoutGrid class="w-3.5 h-3.5" />
			{$_('calendar.showAsGrid')}
		</button>
	</div>

	<div
		class="flex-1 overflow-y-auto divide-y divide-neutral-100 dark:divide-neutral-800"
		bind:this={listRef}
	>
		{#each weekDays as day (day.date.getTime())}
			{@const today = isToday(day.date)}
			{@const empty = day.allDay.length === 0 && day.items.length === 0}
			<div
				class={cn('flex gap-3 px-3 py-2', today && 'bg-primary-50/60 dark:bg-primary-900/20')}
				data-today={today || undefined}
			>
				<button
					type="button"
					onclick={() => openDay(day.date)}
					class="w-10 flex-shrink-0 flex flex-col items-center self-start pt-0.5 rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-700"
				>
					<span class="text-xs text-neutral-500 dark:text-neutral-400">{formatDayOfWeek(day.date, true)}</span>
					<span
						class={cn(
							'w-7 h-7 rounded-full flex items-center justify-center text-sm font-semibold',
							today ? 'bg-primary-500 text-white' : 'text-neutral-800 dark:text-neutral-100'
						)}
					>
						{day.date.getDate()}
					</span>
				</button>

				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="flex-1 min-w-0 min-h-[2.75rem] space-y-1 cursor-pointer"
					onclick={(e) => handleRowClick(e, day.date)}
				>
					{#if day.allDay.length > 0}
						<div class="flex flex-wrap gap-1">
							{#each day.allDay as event (event.id)}
								<button
									type="button"
									class="max-w-full px-2 py-0.5 rounded-md text-xs font-medium truncate inline-flex items-center gap-1"
									style:background-color={event.color}
									style:color={getContrastColor(event.color)}
									onclick={() => (eventDetail = event)}
								>
									{#if event.icon}
										<EventIcon icon={event.icon} size="sm" />
									{/if}
									<span class="truncate">{event.title}</span>
								</button>
							{/each}
						</div>
					{/if}

					{#each day.items as item (item.kind === 'event' ? item.event.id : item.routine_template)}
						{@const title = item.kind === 'event' ? item.event.title : item.name}
						{@const color = item.kind === 'event' ? item.event.color : item.color}
						{@const icon = item.kind === 'event' ? item.event.icon : item.icon}
						{@const taskDone =
							item.kind === 'event' && item.event.is_task && item.event.is_completed}
						<button
							type="button"
							onclick={() => handleItemClick(item, day.date)}
							class={cn(
								'w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-700',
								item.status === 'past' && 'opacity-50',
								item.status === 'now' &&
									'ring-2 ring-primary-400 bg-primary-50 dark:bg-primary-900/30 dark:ring-primary-500',
								item.status === 'next' && 'bg-white dark:bg-neutral-800'
							)}
						>
							<span class="w-14 flex-shrink-0 text-xs tabular-nums text-neutral-500 dark:text-neutral-400">
								{formatTime(item.start, format24h)}
							</span>
							<span class="w-1 self-stretch flex-shrink-0 rounded-full" style:background-color={color}></span>
							{#if icon}
								<EventIcon {icon} size="sm" />
							{/if}
							<span
								class={cn(
									'flex-1 min-w-0 truncate text-sm text-neutral-800 dark:text-neutral-100',
									taskDone && 'line-through'
								)}
							>
								{title}
							</span>
							{#if item.kind === 'routine'}
								<span class="flex-shrink-0 inline-flex items-center gap-0.5 text-xs text-neutral-500 dark:text-neutral-400">
									<Check class="w-3 h-3" />
									{item.done}/{item.total}
								</span>
							{/if}
							{#if item.status === 'now'}
								<span class="flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-primary-500 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
									<span class="w-1.5 h-1.5 rounded-full bg-white animate-pulse"></span>
									{item.kind === 'event' && item.event.is_open_ended
										? $_('time.ongoing')
										: $_('event.now')}
								</span>
							{:else if item.status === 'next'}
								<span class="flex-shrink-0 text-xs font-medium text-primary-700 dark:text-primary-300">
									{$_('calendar.in')} {formatRelative(minutesUntil(item.start))}
								</span>
							{/if}
						</button>
					{/each}

					{#if empty}
						<button
							type="button"
							onclick={() => goto(`/event/new?date=${format(day.date, 'yyyy-MM-dd')}`)}
							class="w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-sm text-neutral-400 hover:bg-neutral-100 dark:text-neutral-500 dark:hover:bg-neutral-700"
						>
							{$_('calendar.nothingPlanned')}
							<Plus class="w-4 h-4" />
						</button>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>

<EventDetailModal event={eventDetail} onclose={() => (eventDetail = null)} />
