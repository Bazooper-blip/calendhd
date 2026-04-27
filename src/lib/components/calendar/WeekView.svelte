<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { calendar, settingsStore, routinesStore } from '$stores';
	import {
		formatDayOfWeek,
		getDaysInRange,
		getEventPosition,
		isToday,
		isSameDay,
		startOfWeek,
		endOfWeek
	} from '$utils';
	import type { DisplayEvent, EnergyLevel } from '$types';
	import { format } from 'date-fns';
	import EventBlock from './EventBlock.svelte';
	import RoutineBlock from './RoutineBlock.svelte';

	/** A routine group merges multiple routine step events into one visual block. */
	interface RoutineGroup {
		kind: 'routine-group';
		routine_template: string;
		routine_group_name: string;
		color: string;
		icon?: string;
		start: Date;
		end: Date;
		target_end_time?: string;
		steps: Array<{
			id: string;
			title: string;
			start: Date;
			end?: Date;
			icon?: string;
			energy_level?: EnergyLevel;
			is_completed: boolean;
			timing_mode?: 'fixed' | 'flexible';
		}>;
	}

	type ProcessedEvent =
		| { kind: 'single'; event: DisplayEvent }
		| RoutineGroup;

	let { date = $bindable(new Date()) }: { date?: Date } = $props();

	const weekStartsOn = $derived(settingsStore.weekStartsOn);

	const days = $derived(
		getDaysInRange(
			startOfWeek(date, { weekStartsOn }),
			endOfWeek(date, { weekStartsOn })
		)
	);

	// Get raw events for a day
	function getEventsForDay(day: Date, allDay: boolean) {
		return calendar.displayEvents.filter(
			(e) => e.is_all_day === allDay && isSameDay(e.start, day)
		);
	}

	// Get processed events: routine steps grouped into single blocks
	function getProcessedEventsForDay(day: Date, allDay: boolean): ProcessedEvent[] {
		const events = getEventsForDay(day, allDay);

		// Separate routine events from regular events
		const routineEvents: DisplayEvent[] = [];
		const regularEvents: DisplayEvent[] = [];

		for (const event of events) {
			if (event.routine_template) {
				routineEvents.push(event);
			} else {
				regularEvents.push(event);
			}
		}

		// Group routine events by routine_template ID
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

		// Build merged routine group entries
		const processed: ProcessedEvent[] = regularEvents.map((event) => ({
			kind: 'single' as const,
			event
		}));

		for (const [templateId, group] of routineGroups) {
			// Sort steps by start time
			const sorted = group.toSorted((a, b) => a.start.getTime() - b.start.getTime());
			const earliest = sorted[0].start;
			const latest = sorted.reduce(
				(max, e) => (e.end && e.end.getTime() > max.getTime() ? e.end : max),
				sorted[0].end ?? sorted[0].start
			);

			processed.push({
				kind: 'routine-group',
				routine_template: templateId,
				routine_group_name: sorted[0].routine_group_name ?? 'Routine',
				color: sorted[0].color,
				icon: sorted[0].icon,
				start: earliest,
				end: latest,
				target_end_time: routinesStore.getById(templateId)?.target_end_time,
				steps: sorted.map((e) => ({
					id: e.id,
					title: e.title,
					start: e.start,
					end: e.end,
					icon: e.icon,
					energy_level: e.energy_level,
					is_completed: e.is_completed,
					timing_mode: routinesStore.getById(templateId)?.steps[
						e.routine_step_index ?? 0
					]?.timing_mode
				}))
			});
		}

		return processed;
	}

	// Current time indicator
	let now = $state(new Date());
	const nowPosition = $derived.by(() => {
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
			const scrollTarget = nowPosition / 100 * 1440 - 200;
			timeGridRef.scrollTop = Math.max(0, scrollTarget);
		}
	});

	function handleEventClick(event: DisplayEvent) {
		if (event.is_external) {
			return;
		}
		goto(`/event/${event.id}`);
	}

</script>

<div class="flex flex-col h-full">
	<!-- Week header -->
	<div class="flex-shrink-0 border-b border-neutral-100">
		<div class="grid grid-cols-7 gap-px">
			{#each days as day (day.getTime())}
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
			{#each days as day (day.getTime())}
				<div class="min-h-[2rem] p-1 space-y-0.5">
					{#each getEventsForDay(day, true) as event (event.id)}
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
			{#each Array(24) as _, hour (hour)}
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
					style="top: {nowPosition}%"
				>
					<span class="absolute -top-2 left-0 text-[10px] font-semibold text-red-500 bg-red-50 px-1 rounded">
						{nowTimeString}
					</span>
				</div>
			{/if}

			<!-- Day columns -->
			<div class="absolute left-14 right-0 top-0 bottom-0 grid grid-cols-7 gap-px">
				{#each days as day, dayIndex (day.getTime())}
					<div class="relative border-l border-neutral-100">
						<!-- Current time indicator -->
						{#if isToday(day)}
							<div
								class="absolute left-0 right-0 z-20 pointer-events-none"
								style="top: {nowPosition}%"
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
						{#each getProcessedEventsForDay(day, false) as item (item.kind === 'single' ? item.event.id : item.routine_template)}
							{#if item.kind === 'single'}
								{@const pos = getEventPosition(item.event.start, item.event.end, day)}
								<EventBlock
									event={item.event}
									style="top: {pos.top}%; height: {pos.height}%;"
									compact={true}
									onclick={() => handleEventClick(item.event)}
								/>
							{:else}
								{@const pos = getEventPosition(item.start, item.end, day)}
								<RoutineBlock
									routine_template={item.routine_template}
									routine_group_name={item.routine_group_name}
									color={item.color}
									icon={item.icon}
									steps={item.steps}
									style="top: {pos.top}%; height: {pos.height}%;"
									compact={true}
									target_end_time={item.target_end_time}
								/>
							{/if}
						{/each}
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>
