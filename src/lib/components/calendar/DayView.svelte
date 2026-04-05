<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { calendar } from '$stores';
	import { formatDayOfWeek, getEventPosition, isToday, isSameDay } from '$utils';
	import { format } from 'date-fns';
	import { EventIcon } from '$components/ui';
	import EventBlock from './EventBlock.svelte';
	import DayProgress from './DayProgress.svelte';

	let { date = $bindable(new Date()) }: { date?: Date } = $props();

	const dayEvents = $derived(
		calendar.displayEvents.filter((e) => !e.is_all_day && isSameDay(e.start, date))
	);

	const allDayEvents = $derived(
		calendar.displayEvents.filter((e) => e.is_all_day && isSameDay(e.start, date))
	);

	// Current time indicator position
	let now = $state(new Date());
	const nowPosition = $derived.by(() => {
		if (!isToday(date)) return null;
		const minutes = now.getHours() * 60 + now.getMinutes();
		return (minutes / 1440) * 100;
	});

	// Format current time for display
	const nowTimeString = $derived(format(now, 'HH:mm'));

	// Update current time every minute
	$effect(() => {
		const interval = setInterval(() => {
			now = new Date();
		}, 60000);
		return () => clearInterval(interval);
	});

	// Scroll to current time on mount
	let timeGridRef: HTMLDivElement | undefined = $state();
	$effect(() => {
		if (browser && timeGridRef && isToday(date)) {
			const scrollTarget = (nowPosition ?? 50) / 100 * 1440 - 200;
			timeGridRef.scrollTop = Math.max(0, scrollTarget);
		}
	});

	function handleEventClick(event: import('$types').DisplayEvent) {
		if (event.is_external) {
			// External events are read-only, don't navigate to edit page
			return;
		}
		goto(`/event/${event.id}`);
	}
</script>

<div class="flex flex-col h-full">
	<!-- Day progress indicator -->
	<DayProgress {date} />

	<!-- Day header -->
	<div class="flex-shrink-0 border-b border-neutral-100 px-4 py-2">
		<div class="flex items-center gap-2">
			<span class="text-sm text-neutral-500">{formatDayOfWeek(date)}</span>
			<span
				class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold {isToday(date)
					? 'bg-primary-500 text-white'
					: 'text-neutral-800'}"
			>
				{date.getDate()}
			</span>
		</div>
	</div>

	<!-- All-day events -->
	{#if allDayEvents.length > 0}
		<div class="flex-shrink-0 border-b border-neutral-100 px-4 py-2 space-y-1">
			{#each allDayEvents as event}
				<button
					type="button"
					class="w-full px-2 py-1 rounded text-left text-sm font-medium text-white truncate flex items-center gap-1"
					style:background-color={event.color}
					onclick={() => handleEventClick(event)}
				>
					{#if event.icon}
						<EventIcon icon={event.icon} size="md" />
					{/if}
					{event.title}
				</button>
			{/each}
		</div>
	{/if}

	<!-- Time grid -->
	<div class="flex-1 overflow-y-auto" bind:this={timeGridRef}>
		<div class="relative h-[1440px] mt-3">
			<!-- Hour lines -->
			{#each Array(24) as _, hour (hour)}
				<div
					class="absolute left-0 right-0 border-t border-neutral-100"
					style="top: {(hour / 24) * 100}%"
				>
					<span class="absolute -top-3 left-2 text-xs text-neutral-400 bg-white px-1 w-14">
						{hour.toString().padStart(2, '0')}:00
					</span>
				</div>
			{/each}

			<!-- Half-hour lines -->
			{#each Array(24) as _, hour (hour)}
				<div
					class="absolute left-16 right-0 border-t border-neutral-50"
					style="top: {((hour + 0.5) / 24) * 100}%"
				></div>
			{/each}

			<!-- Current time indicator -->
			{#if nowPosition !== null}
				<div
					class="absolute left-0 right-0 z-20 pointer-events-none"
					style="top: {nowPosition}%"
				>
					<div class="flex items-center">
						<!-- Time label -->
						<span class="text-[10px] font-semibold text-red-500 bg-red-50 px-1 rounded mr-1">
							{nowTimeString}
						</span>
						<!-- Dot with pulse animation -->
						<div class="relative">
							<div class="w-3 h-3 rounded-full bg-red-500"></div>
							<div class="absolute inset-0 w-3 h-3 rounded-full bg-red-500 animate-ping opacity-75"></div>
						</div>
						<!-- Line -->
						<div class="flex-1 h-0.5 bg-gradient-to-r from-red-500 to-red-300"></div>
					</div>
				</div>
			{/if}

			<!-- Events -->
			<div class="absolute left-16 right-2 top-0 bottom-0">
				{#each dayEvents as event}
					{@const pos = getEventPosition(event.start, event.end, date)}
					<EventBlock
						{event}
						style="top: {pos.top}%; height: {pos.height}%;"
						onclick={() => handleEventClick(event)}
					/>
				{/each}
			</div>
		</div>
	</div>
</div>
