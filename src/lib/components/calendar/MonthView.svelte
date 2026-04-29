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
	import type { DisplayEvent } from '$types';
	import ExternalEventModal from './ExternalEventModal.svelte';

	interface MonthRoutineGroup {
		kind: 'routine-group';
		routine_template: string;
		name: string;
		color: string;
		icon?: string;
		stepCount: number;
		start: Date;
	}

	type MonthItem =
		| { kind: 'single'; event: DisplayEvent }
		| MonthRoutineGroup;

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

	// Get processed items for a day (routine steps grouped into one entry)
	function getItemsForDay(day: Date): { items: MonthItem[]; moreCount: number } {
		const events = calendar.displayEvents.filter((e) => isSameDay(e.start, day));

		const routineEvents: DisplayEvent[] = [];
		const regularEvents: DisplayEvent[] = [];
		for (const event of events) {
			if (event.routine_template) {
				routineEvents.push(event);
			} else {
				regularEvents.push(event);
			}
		}

		// Group routine events by template
		const routineGroups = new Map<string, DisplayEvent[]>();
		for (const event of routineEvents) {
			const key = event.routine_template!;
			const group = routineGroups.get(key);
			if (group) {
				group.push(event);
			} else {
				routineGroups.set(key, [event]);
			}
		}

		const allItems: MonthItem[] = regularEvents.map((event) => ({
			kind: 'single' as const,
			event
		}));

		for (const [templateId, group] of routineGroups) {
			const sorted = group.toSorted((a, b) => a.start.getTime() - b.start.getTime());
			allItems.push({
				kind: 'routine-group',
				routine_template: templateId,
				name: sorted[0].routine_group_name ?? 'Routine',
				color: sorted[0].color,
				icon: sorted[0].icon,
				stepCount: group.length,
				start: sorted[0].start
			});
		}

		// Sort by start time
		allItems.sort((a, b) => {
			const aStart = a.kind === 'single' ? a.event.start : a.start;
			const bStart = b.kind === 'single' ? b.event.start : b.start;
			return aStart.getTime() - bStart.getTime();
		});

		const moreCount = allItems.length > 3 ? allItems.length - 3 : 0;
		return { items: allItems.slice(0, 3), moreCount };
	}

	function handleDayClick(day: Date) {
		calendar.setDate(day);
		calendar.setViewType('day');
	}

	let externalDetail = $state<DisplayEvent | null>(null);

	function handleEventClick(event: import('$types').DisplayEvent) {
		if (event.is_external) {
			externalDetail = event;
			return;
		}
		goto(`/event/${event.id}`);
	}
</script>

<div class="flex flex-col h-full">
	<!-- Weekday headers -->
	<div class="flex-shrink-0 grid grid-cols-7 border-b border-neutral-100 dark:border-neutral-800">
		{#each weekdays() as weekday}
			<div class="px-2 py-3 text-center text-xs font-medium text-neutral-500 dark:text-neutral-400 uppercase">
				{weekday}
			</div>
		{/each}
	</div>

	<!-- Calendar grid -->
	<div class="flex-1 grid grid-rows-{weeks().length} min-h-0">
		{#each weeks() as week}
			<div class="grid grid-cols-7 border-b border-neutral-100 dark:border-neutral-800 last:border-b-0 min-h-0">
				{#each week as day}
					{@const inCurrentMonth = isSameMonth(day, date)}
					{@const dayData = getItemsForDay(day)}

					<button
						type="button"
						onclick={() => handleDayClick(day)}
						class="relative p-1 border-r border-neutral-100 dark:border-neutral-800 last:border-r-0 text-left hover:bg-neutral-50 dark:hover:bg-neutral-700 transition-colors min-h-0 overflow-hidden {inCurrentMonth
							? ''
							: 'bg-neutral-50 dark:bg-neutral-900'}"
					>
						<!-- Day number -->
						<div class="flex justify-end mb-1">
							<span
								class="w-7 h-7 flex items-center justify-center text-sm rounded-full {isToday(day)
									? 'bg-primary-500 text-white font-semibold'
									: inCurrentMonth
										? 'text-neutral-800 dark:text-neutral-100'
										: 'text-neutral-400 dark:text-neutral-500'}"
							>
								{day.getDate()}
							</span>
						</div>

						<!-- Events preview -->
						<div class="space-y-0.5 overflow-hidden">
							{#each dayData.items as item}
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								{#if item.kind === 'single'}
									<div
										class="px-1 py-0.5 rounded text-xs font-medium text-white truncate cursor-pointer hover:ring-1 hover:ring-white/50"
										style:background-color={item.event.color}
										onclick={(e) => { e.stopPropagation(); handleEventClick(item.event); }}
									>
										{#if item.event.is_all_day}
											<span class="inline-flex items-center gap-0.5">
												{#if item.event.icon}<EventIcon icon={item.event.icon} size="sm" />{/if}
												{item.event.title}
											</span>
										{:else}
											<span class="inline-flex items-center gap-0.5">
												<span class="opacity-70">{item.event.start.getHours()}:{item.event.start.getMinutes().toString().padStart(2, '0')}</span>
												{#if item.event.icon}<EventIcon icon={item.event.icon} size="sm" />{/if}
												{item.event.title}
											</span>
										{/if}
									</div>
								{:else}
									<div
										class="px-1 py-0.5 rounded text-xs font-medium text-white truncate cursor-pointer hover:ring-1 hover:ring-white/50"
										style:background-color={item.color}
										onclick={(e) => { e.stopPropagation(); goto(`/routines/${item.routine_template}`); }}
									>
										<span class="inline-flex items-center gap-0.5">
											{#if item.icon}<EventIcon icon={item.icon} size="sm" />{/if}
											{item.name}
											<span class="opacity-70">({item.stepCount})</span>
										</span>
									</div>
								{/if}
							{/each}

							{#if dayData.moreCount > 0}
								<div class="px-1 text-xs text-neutral-500 dark:text-neutral-400">
									+{dayData.moreCount} more
								</div>
							{/if}
						</div>
					</button>
				{/each}
			</div>
		{/each}
	</div>
</div>

<ExternalEventModal event={externalDetail} onclose={() => (externalDetail = null)} />
