<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { calendar, routinesStore, settingsStore } from '$stores';
	import { _ } from '$lib/i18n';
	import {
		formatDayOfWeek,
		getEventPosition,
		isToday,
		isSameDay
	} from '$utils';
	import type { DisplayEvent, EnergyLevel } from '$types';
	import { format } from 'date-fns';
	import { EventIcon } from '$components/ui';
	import EventBlock from './EventBlock.svelte';
	import RoutineBlock from './RoutineBlock.svelte';
	import DayProgress from './DayProgress.svelte';
	import DailyWinsBanner from './DailyWinsBanner.svelte';
	import ExternalEventModal from './ExternalEventModal.svelte';

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
				routine_group_name: sorted[0].routine_group_name ?? $_('calendar.routineFallback'),
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

	// Tight gaps: consecutive events whose gap is < bufferMinutes. Visual-only
	// indicator; we don't push the user's events around.
	const tightGaps = $derived.by((): Array<{ topPercent: number; minutes: number }> => {
		const buffer = settingsStore.bufferMinutes;
		if (buffer <= 0) return [];
		// Collect [start, end] pairs in time order, only events with explicit ends.
		const ranges: Array<{ start: Date; end: Date }> = [];
		for (const item of processedDayEvents) {
			if (item.kind === 'single') {
				if (item.event.end) ranges.push({ start: item.event.start, end: item.event.end });
			} else {
				ranges.push({ start: item.start, end: item.end });
			}
		}
		ranges.sort((a, b) => a.start.getTime() - b.start.getTime());
		const out: Array<{ topPercent: number; minutes: number }> = [];
		for (let i = 0; i < ranges.length - 1; i++) {
			const gapMs = ranges[i + 1].start.getTime() - ranges[i].end.getTime();
			if (gapMs <= 0) continue; // overlap or back-to-back
			const gapMin = Math.round(gapMs / 60_000);
			if (gapMin >= buffer) continue;
			const minutesFromMidnight = ranges[i].end.getHours() * 60 + ranges[i].end.getMinutes();
			out.push({ topPercent: (minutesFromMidnight / 1440) * 100, minutes: gapMin });
		}
		return out;
	});

	const nextUpcoming = $derived.by((): { title: string; minutesAway: number; icon?: string; color: string } | null => {
		if (!isToday(date)) return null;
		const nowMs = now.getTime();
		let bestDelta = Infinity;
		let best: { title: string; minutesAway: number; icon?: string; color: string } | null = null;
		for (const item of processedDayEvents) {
			const start = item.kind === 'single' ? item.event.start : item.start;
			const delta = start.getTime() - nowMs;
			if (delta <= 0 || delta >= bestDelta) continue;
			bestDelta = delta;
			if (item.kind === 'single') {
				best = {
					title: item.event.title,
					minutesAway: Math.round(delta / 60000),
					icon: item.event.icon,
					color: item.event.color
				};
			} else {
				best = {
					title: item.routine_group_name,
					minutesAway: Math.round(delta / 60000),
					icon: item.icon,
					color: item.color
				};
			}
		}
		return best;
	});

	function formatRelative(min: number): string {
		if (min < 60) return `${min} min`;
		if (min < 1440) {
			const h = Math.floor(min / 60);
			const m = min % 60;
			return m === 0 ? `${h}h` : `${h}h ${m}m`;
		}
		return $_('calendar.tomorrow');
	}

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

	let externalDetail = $state<DisplayEvent | null>(null);

	function handleEventClick(event: DisplayEvent) {
		if (event.is_external) {
			externalDetail = event;
			return;
		}
		goto(`/event/${event.id}`);
	}

</script>

<div class="flex flex-col h-full">
	<!-- Day progress indicator -->
	<DayProgress {date} />
	<DailyWinsBanner />

	<!-- Day header -->
	<div class="flex-shrink-0 border-b border-neutral-100 dark:border-neutral-800 px-4 py-2">
		<div class="flex items-center gap-2">
			<span class="text-sm text-neutral-500 dark:text-neutral-400">{formatDayOfWeek(date)}</span>
			<span
				class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold {isToday(date)
					? 'bg-primary-500 text-white'
					: 'text-neutral-800 dark:text-neutral-100'}"
			>
				{date.getDate()}
			</span>
			{#if nextUpcoming}
				<span class="ml-auto flex items-center gap-1.5 rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-1 text-xs">
					<span class="text-primary-700 dark:text-primary-300 font-medium">{$_('calendar.next')}</span>
					{#if nextUpcoming.icon}
						<EventIcon icon={nextUpcoming.icon} size="sm" />
					{/if}
					<span class="text-neutral-700 dark:text-neutral-200 truncate max-w-[14ch]">{nextUpcoming.title}</span>
					<span class="text-primary-700 dark:text-primary-300 font-medium">{$_('calendar.in')} {formatRelative(nextUpcoming.minutesAway)}</span>
				</span>
			{/if}
		</div>
	</div>

	<!-- All-day events -->
	{#if allDayEvents.length > 0}
		<div class="flex-shrink-0 border-b border-neutral-100 dark:border-neutral-800 px-4 py-2 space-y-1">
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
					class="absolute left-0 right-0 border-t border-neutral-100 dark:border-neutral-800"
					style="top: {(hour / 24) * 100}%"
				>
					<span class="absolute -top-3 left-2 text-xs text-neutral-400 dark:text-neutral-500 bg-white dark:bg-neutral-800 px-1 w-14">
						{hour.toString().padStart(2, '0')}:00
					</span>
				</div>
			{/each}

			<!-- Half-hour lines -->
			{#each Array(24) as _, hour (hour)}
				<div
					class="absolute left-16 right-0 border-t border-neutral-50 dark:border-neutral-900"
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

			<!-- Tight transition gaps: events scheduled with less than buffer-minutes between them -->
			{#each tightGaps as gap, i (i)}
				<div
					class="absolute left-16 right-2 z-10 pointer-events-none flex items-center"
					style="top: {gap.topPercent}%"
				>
					<div class="flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 text-[10px] text-amber-700 dark:text-amber-300">
						<span class="opacity-70">⏱</span>
						<span>{$_('calendar.tightGap', { values: { minutes: gap.minutes } })}</span>
					</div>
				</div>
			{/each}

			<!-- Events -->
			<div class="absolute left-16 right-2 top-0 bottom-0">
				{#each processedDayEvents as item (item.kind === 'single' ? item.event.id : item.routine_template)}
					{#if item.kind === 'single'}
						{@const pos = getEventPosition(item.event.start, item.event.end, date)}
						<EventBlock
							event={item.event}
							style="top: {pos.top}%; height: {pos.height}%;"
							onclick={() => handleEventClick(item.event)}
							compact={settingsStore.density === 'compact'}
							{now}
						/>
					{:else}
						{@const pos = getEventPosition(item.start, item.end, date)}
						<RoutineBlock
							routine_template={item.routine_template}
							routine_group_name={item.routine_group_name}
							color={item.color}
							icon={item.icon}
							steps={item.steps}
							style="top: {pos.top}%; height: {pos.height}%;"
							target_end_time={item.target_end_time}
							compact={settingsStore.density === 'compact'}
							{now}
							start={item.start}
							end={item.end}
						/>
					{/if}
				{/each}
			</div>
		</div>
	</div>
</div>

<ExternalEventModal event={externalDetail} onclose={() => (externalDetail = null)} />
