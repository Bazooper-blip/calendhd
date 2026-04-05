<script lang="ts">
	import { goto } from '$app/navigation';
	import { calendar, settingsStore } from '$stores';
	import { EventIcon } from '$components/ui';
	import {
		formatDayOfWeek,
		getDaysInRange,
		isToday,
		isSameDay,
		isSameMonth,
		startOfWeek,
		endOfWeek,
		startOfMonth,
		endOfMonth
	} from '$utils';

	let { date = $bindable(new Date()) }: { date?: Date } = $props();

	const weekStartsOn = $derived(settingsStore.weekStartsOn);

	// Get all days to display (including days from adjacent months)
	const days = $derived(() => {
		const monthStart = startOfMonth(date);
		const monthEnd = endOfMonth(date);
		return getDaysInRange(
			startOfWeek(monthStart, { weekStartsOn }),
			endOfWeek(monthEnd, { weekStartsOn })
		);
	});

	// Get weekday headers
	const weekdays = $derived(() => {
		const firstWeek = days().slice(0, 7);
		return firstWeek.map((d) => formatDayOfWeek(d, true));
	});

	// Group days into weeks
	const weeks = $derived(() => {
		const allDays = days();
		const result: Date[][] = [];
		for (let i = 0; i < allDays.length; i += 7) {
			result.push(allDays.slice(i, i + 7));
		}
		return result;
	});

	// Get events for a specific day
	function getEventsForDay(day: Date) {
		return calendar.displayEvents.filter((e) => isSameDay(e.start, day)).slice(0, 3);
	}

	function hasMoreEvents(day: Date): number {
		const count = calendar.displayEvents.filter((e) => isSameDay(e.start, day)).length;
		return count > 3 ? count - 3 : 0;
	}

	function handleDayClick(day: Date) {
		calendar.setDate(day);
		calendar.setViewType('day');
	}

	function handleEventClick(event: import('$types').DisplayEvent) {
		if (event.is_external) {
			// External events are read-only, don't navigate to edit page
			return;
		}
		goto(`/event/${event.id}`);
	}
</script>

<div class="flex flex-col h-full">
	<!-- Weekday headers -->
	<div class="flex-shrink-0 grid grid-cols-7 border-b border-neutral-100">
		{#each weekdays() as weekday}
			<div class="px-2 py-3 text-center text-xs font-medium text-neutral-500 uppercase">
				{weekday}
			</div>
		{/each}
	</div>

	<!-- Calendar grid -->
	<div class="flex-1 grid grid-rows-{weeks().length} min-h-0">
		{#each weeks() as week}
			<div class="grid grid-cols-7 border-b border-neutral-100 last:border-b-0 min-h-0">
				{#each week as day}
					{@const inCurrentMonth = isSameMonth(day, date)}
					{@const dayEvents = getEventsForDay(day)}
					{@const moreCount = hasMoreEvents(day)}

					<button
						type="button"
						onclick={() => handleDayClick(day)}
						class="relative p-1 border-r border-neutral-100 last:border-r-0 text-left hover:bg-neutral-50 transition-colors min-h-0 overflow-hidden {inCurrentMonth
							? ''
							: 'bg-neutral-50'}"
					>
						<!-- Day number -->
						<div class="flex justify-end mb-1">
							<span
								class="w-7 h-7 flex items-center justify-center text-sm rounded-full {isToday(day)
									? 'bg-primary-500 text-white font-semibold'
									: inCurrentMonth
										? 'text-neutral-800'
										: 'text-neutral-400'}"
							>
								{day.getDate()}
							</span>
						</div>

						<!-- Events preview -->
						<div class="space-y-0.5 overflow-hidden">
							{#each dayEvents as event}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									class="px-1 py-0.5 rounded text-xs font-medium text-white truncate cursor-pointer hover:ring-1 hover:ring-white/50"
									style:background-color={event.color}
									onclick={(e) => { e.stopPropagation(); handleEventClick(event); }}
								>
									{#if event.is_all_day}
										<span class="inline-flex items-center gap-0.5">
											{#if event.icon}<EventIcon icon={event.icon} size="sm" />{/if}
											{event.title}
										</span>
									{:else}
										<span class="inline-flex items-center gap-0.5">
											<span class="opacity-70">{event.start.getHours()}:{event.start.getMinutes().toString().padStart(2, '0')}</span>
											{#if event.icon}<EventIcon icon={event.icon} size="sm" />{/if}
											{event.title}
										</span>
									{/if}
								</div>
							{/each}

							{#if moreCount > 0}
								<div class="px-1 text-xs text-neutral-500">
									+{moreCount} more
								</div>
							{/if}
						</div>
					</button>
				{/each}
			</div>
		{/each}
	</div>
</div>
