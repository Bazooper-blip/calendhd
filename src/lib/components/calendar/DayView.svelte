<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { calendar } from '$stores';
	import {
		formatDayOfWeek,
		getContrastColor,
		getEventPosition,
		isToday,
		isSameDay
	} from '$utils';
	import type { DisplayEvent, EnergyLevel } from '$types';
	import { format } from 'date-fns';
	import { EventIcon } from '$components/ui';
	import EventBlock from './EventBlock.svelte';
	import DayProgress from './DayProgress.svelte';

	/** A routine group merges multiple routine step events into one visual block. */
	interface RoutineGroup {
		kind: 'routine-group';
		routine_template: string;
		routine_group_name: string;
		color: string;
		icon?: string;
		start: Date;
		end: Date;
		steps: Array<{
			id: string;
			title: string;
			start: Date;
			end?: Date;
			icon?: string;
			energy_level?: EnergyLevel;
			is_completed: boolean;
		}>;
	}

	type ProcessedEvent =
		| { kind: 'single'; event: DisplayEvent }
		| RoutineGroup;

	let { date = $bindable(new Date()) }: { date?: Date } = $props();

	const allDayEvents = $derived(
		calendar.displayEvents.filter((e) => e.is_all_day && isSameDay(e.start, date))
	);

	const processedDayEvents = $derived.by(() => {
		const events = calendar.displayEvents.filter((e) => !e.is_all_day && isSameDay(e.start, date));

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
				steps: sorted.map((e) => ({
					id: e.id,
					title: e.title,
					start: e.start,
					end: e.end,
					icon: e.icon,
					energy_level: e.energy_level,
					is_completed: e.is_completed
				}))
			});
		}

		return processed;
	});

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

	function handleEventClick(event: DisplayEvent) {
		if (event.is_external) {
			// External events are read-only, don't navigate to edit page
			return;
		}
		goto(`/event/${event.id}`);
	}

	function handleRoutineClick(routineTemplate: string) {
		goto(`/routines/${routineTemplate}`);
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
				{#each processedDayEvents as item (item.kind === 'single' ? item.event.id : item.routine_template)}
					{#if item.kind === 'single'}
						{@const pos = getEventPosition(item.event.start, item.event.end, date)}
						<EventBlock
							event={item.event}
							style="top: {pos.top}%; height: {pos.height}%;"
							onclick={() => handleEventClick(item.event)}
						/>
					{:else}
						{@const pos = getEventPosition(item.start, item.end, date)}
						{@const textColor = getContrastColor(item.color)}
						<button
							type="button"
							class="absolute inset-x-1 rounded-lg overflow-hidden text-left transition-all hover:ring-2 hover:ring-primary-500 hover:ring-offset-1 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1"
							style="top: {pos.top}%; height: {pos.height}%; background-color: {item.color};"
							onclick={() => handleRoutineClick(item.routine_template)}
						>
							<div class="px-2 py-1 h-full flex flex-col" style:color={textColor}>
								<!-- Routine header -->
								<span class="text-xs font-semibold truncate flex items-center gap-1">
									{#if item.icon}
										<EventIcon icon={item.icon} size="sm" />
									{/if}
									{item.routine_group_name}
								</span>
								<!-- First step + more -->
								<span class="text-[11px] opacity-80 truncate">
									{item.steps[0].title}{#if item.steps.length > 1}&ensp;<span class="opacity-70">(+{item.steps.length - 1} more)</span>{/if}
								</span>
							</div>
						</button>
					{/if}
				{/each}
			</div>
		</div>
	</div>
</div>
