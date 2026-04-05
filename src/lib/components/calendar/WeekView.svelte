<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { calendar, settingsStore } from '$stores';
	import {
		formatDayOfWeek,
		getDaysInRange,
		getEventPosition,
		isToday,
		isSameDay,
		startOfWeek,
		endOfWeek
	} from '$utils';
	import { format } from 'date-fns';
	import EventBlock from './EventBlock.svelte';

	let { date = $bindable(new Date()) }: { date?: Date } = $props();

	const weekStartsOn = $derived(settingsStore.weekStartsOn);

	const days = $derived(
		getDaysInRange(
			startOfWeek(date, { weekStartsOn }),
			endOfWeek(date, { weekStartsOn })
		)
	);

	// Group events by day
	function getEventsForDay(day: Date, allDay: boolean) {
		return calendar.displayEvents.filter(
			(e) => e.is_all_day === allDay && isSameDay(e.start, day)
		);
	}

	// Current time indicator
	let now = $state(new Date());
	const nowPosition = $derived(() => {
		const minutes = now.getHours() * 60 + now.getMinutes();
		return (minutes / 1440) * 100;
	});
	const nowTimeString = $derived(format(now, 'HH:mm'));
	const hasToday = $derived(days.some((day) => isToday(day)));

	$effect(() => {
		const interval = setInterval(() => {
			now = new Date();
		}, 60000);
		return () => clearInterval(interval);
	});

	// Scroll to current time on mount
	let timeGridRef: HTMLDivElement | undefined = $state();
	$effect(() => {
		if (browser && timeGridRef && hasToday) {
			const scrollTarget = nowPosition() / 100 * 1440 - 200;
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
	<!-- Week header -->
	<div class="flex-shrink-0 border-b border-neutral-100">
		<div class="grid grid-cols-7 gap-px">
			{#each days as day}
				<div class="px-2 py-2 text-center">
					<span class="text-xs text-neutral-500">{formatDayOfWeek(day, true)}</span>
					<button
						type="button"
						onclick={() => {
							calendar.setDate(day);
							calendar.setViewType('day');
						}}
						class="w-8 h-8 mx-auto mt-1 rounded-full flex items-center justify-center text-sm font-semibold transition-colors {isToday(day)
							? 'bg-primary-500 text-white'
							: 'text-neutral-800 hover:bg-neutral-100'}"
					>
						{day.getDate()}
					</button>
				</div>
			{/each}
		</div>

		<!-- All-day events row -->
		<div class="grid grid-cols-7 gap-px border-t border-neutral-100">
			{#each days as day}
				<div class="min-h-[2rem] p-1 space-y-0.5">
					{#each getEventsForDay(day, true) as event}
						<button
							type="button"
							class="w-full px-1 py-0.5 rounded text-left text-xs font-medium text-white truncate"
							style:background-color={event.color}
							onclick={() => handleEventClick(event)}
						>
							{event.title}
						</button>
					{/each}
				</div>
			{/each}
		</div>
	</div>

	<!-- Time grid -->
	<div class="flex-1 overflow-y-auto" bind:this={timeGridRef}>
		<div class="relative h-[1440px] mt-3">
			<!-- Hour lines and labels -->
			{#each Array(24) as _, hour}
				<div
					class="absolute left-0 right-0 border-t border-neutral-100"
					style="top: {(hour / 24) * 100}%"
				>
					<span class="absolute -top-3 left-1 text-xs text-neutral-400 bg-white px-1 w-12">
						{hour.toString().padStart(2, '0')}:00
					</span>
				</div>
			{/each}

			<!-- Current time label in left margin -->
			{#if hasToday}
				<div
					class="absolute left-0 z-30 pointer-events-none"
					style="top: {nowPosition()}%"
				>
					<span class="absolute -top-2 left-0 text-[10px] font-semibold text-red-500 bg-red-50 px-1 rounded">
						{nowTimeString}
					</span>
				</div>
			{/if}

			<!-- Day columns -->
			<div class="absolute left-14 right-0 top-0 bottom-0 grid grid-cols-7 gap-px">
				{#each days as day, dayIndex}
					<div class="relative border-l border-neutral-100">
						<!-- Current time indicator -->
						{#if isToday(day)}
							<div
								class="absolute left-0 right-0 z-20 pointer-events-none"
								style="top: {nowPosition()}%"
							>
								<div class="flex items-center">
									<!-- Dot with pulse -->
									<div class="relative">
										<div class="w-2.5 h-2.5 rounded-full bg-red-500"></div>
										<div class="absolute inset-0 w-2.5 h-2.5 rounded-full bg-red-500 animate-ping opacity-75"></div>
									</div>
									<!-- Line -->
									<div class="flex-1 h-0.5 bg-gradient-to-r from-red-500 to-red-300"></div>
								</div>
							</div>
						{/if}

						<!-- Events -->
						{#each getEventsForDay(day, false) as event}
							{@const pos = getEventPosition(event.start, event.end, day)}
							<EventBlock
								{event}
								style="top: {pos.top}%; height: {pos.height}%;"
								compact={true}
								onclick={() => handleEventClick(event)}
							/>
						{/each}
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>
