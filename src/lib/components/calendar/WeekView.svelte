<script lang="ts">
	import { browser } from '$app/env';
	import { goto } from '$app/navigation';
	import { calendar, settingsStore, routinesStore, weekLayoutStore } from '#stores';
	import { _ } from '#lib/i18n/index.js';
	import {
		computeEventLanes,
		computeVisibleHourRange,
		formatDayOfWeek,
		getContrastColor,
		getDaysInRange,
		getEventPosition,
		getWeekNumber,
		isToday,
		isSameDay,
		startOfWeek,
		endOfWeek
	} from '#utils';
	import type { DisplayEvent, EnergyLevel } from '#types';
	import { format } from 'date-fns';
	import { ChevronDown, ChevronUp, List } from '@lucide/svelte';
	import EventBlock from './EventBlock.svelte';
	import RoutineBlock from './RoutineBlock.svelte';
	import EventDetailModal from './EventDetailModal.svelte';

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

	const weekNumber = $derived(getWeekNumber(days[0], weekStartsOn));

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

	// Side-by-side lanes for items that overlap on screen, so narrow mobile
	// columns never stack blocks on top of each other untappably.
	function getLaidOutEventsForDay(
		day: Date
	): Array<{ item: ProcessedEvent; lane: number; laneCount: number }> {
		const processed = getProcessedEventsForDay(day, false);
		const lanes = computeEventLanes(
			processed.map((item) =>
				item.kind === 'single'
					? { start: item.event.start, end: item.event.end }
					: { start: item.start, end: item.end }
			)
		);
		return processed.map((item, i) => ({ item, ...lanes[i] }));
	}

	function laneStyle(lane: number, laneCount: number): string {
		if (laneCount <= 1) return '';
		const left = (lane / laneCount) * 100;
		const width = 100 / laneCount;
		return `left: calc(${left}% + 2px); width: calc(${width}% - 4px);`;
	}

	// Current time indicator
	let now = $state(new Date());
	const nowTimeString = $derived(format(now, 'HH:mm'));
	const hasToday = $derived(days.some((day) => isToday(day)));

	// Visible hour window: empty night hours are trimmed (never an event or
	// the now line); the expanders reveal the rest of the day on demand.
	const HOUR_PX = 60;
	let showEarlier = $state(false);
	let showLater = $state(false);
	const fittedRange = $derived(
		computeVisibleHourRange(
			days.flatMap((day) => getEventsForDay(day, false)),
			{ now: hasToday ? now : undefined }
		)
	);
	const startHour = $derived(showEarlier ? 0 : fittedRange.startHour);
	const endHour = $derived(showLater ? 24 : fittedRange.endHour);
	const windowMinutes = $derived((endHour - startHour) * 60);
	const visibleHours = $derived(
		Array.from({ length: endHour - startHour }, (_, i) => startHour + i)
	);

	// Map a full-day minute offset to a percentage of the visible window
	function toWindowPercent(minutes: number): number {
		return ((minutes - startHour * 60) / windowMinutes) * 100;
	}

	// getEventPosition works in percent of the full day; rescale to the window
	function windowPosition(start: Date, end: Date | undefined, day: Date) {
		const pos = getEventPosition(start, end, day);
		return {
			top: toWindowPercent((pos.top / 100) * 1440),
			height: ((pos.height / 100) * 1440 / windowMinutes) * 100
		};
	}

	const nowPosition = $derived(toWindowPercent(now.getHours() * 60 + now.getMinutes()));

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
			const scrollTarget = (nowPosition / 100) * windowMinutes - 200;
			timeGridRef.scrollTop = Math.max(0, scrollTarget);
		}
	});

	let eventDetail = $state<DisplayEvent | null>(null);

	function handleEventClick(event: DisplayEvent) {
		eventDetail = event;
	}

	// Tap-to-add: empty space in a day column opens the new-event form at
	// that day and (30-minute snapped) time; the all-day row makes an
	// all-day event. Event blocks are children of the column, so a click on
	// one bubbles here too — only act when the column itself was hit.
	const SNAP_MINUTES = 30;
	function handleColumnClick(e: MouseEvent, day: Date) {
		if (e.target !== e.currentTarget) return;
		const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const minutes = startHour * 60 + ((e.clientY - rect.top) / rect.height) * windowMinutes;
		const snapped = Math.max(
			startHour * 60,
			Math.min(endHour * 60 - SNAP_MINUTES, Math.floor(minutes / SNAP_MINUTES) * SNAP_MINUTES)
		);
		const hh = String(Math.floor(snapped / 60)).padStart(2, '0');
		const mm = String(snapped % 60).padStart(2, '0');
		goto(`/event/new?date=${format(day, 'yyyy-MM-dd')}&time=${hh}:${mm}`);
	}
	function handleAllDayClick(e: MouseEvent, day: Date) {
		if (e.target !== e.currentTarget) return;
		goto(`/event/new?date=${format(day, 'yyyy-MM-dd')}&allDay=1`);
	}
</script>

<div class="flex flex-col h-full">
	<!-- Week header -->
	<div class="flex-shrink-0 border-b border-neutral-100 dark:border-neutral-800">
		<div class="flex">
			<div class="w-14 flex-shrink-0 flex flex-col items-center justify-center gap-1">
				<span class="text-xs font-medium text-neutral-400 dark:text-neutral-500">
					{$_('calendar.weekNumber', { values: { week: weekNumber } })}
				</span>
				<button
					type="button"
					onclick={() => weekLayoutStore.set('list')}
					class="p-1 rounded-md text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 dark:text-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-neutral-300"
					aria-label={$_('calendar.showAsList')}
					title={$_('calendar.showAsList')}
				>
					<List class="w-4 h-4" />
				</button>
			</div>
			<div class="flex-1 grid grid-cols-7 gap-px">
				{#each days as day (day.getTime())}
					<div class="px-2 py-2 text-center">
						<span class="text-xs text-neutral-500 dark:text-neutral-400">{formatDayOfWeek(day, true)}</span>
						<button
							type="button"
							onclick={() => goto(`/calendar/day/${format(day, 'yyyy-MM-dd')}`)}
							class="w-8 h-8 mx-auto mt-1 rounded-full flex items-center justify-center text-sm font-semibold transition-colors {isToday(day)
								? 'bg-primary-500 text-white'
								: 'text-neutral-800 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-700'}"
						>
							{day.getDate()}
						</button>
					</div>
				{/each}
			</div>
		</div>

		<!-- All-day events row -->
		<div class="grid grid-cols-7 gap-px border-t border-neutral-100 dark:border-neutral-800 pl-14">
			{#each days as day (day.getTime())}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="min-h-[2rem] p-1 space-y-0.5 cursor-pointer"
					onclick={(e) => handleAllDayClick(e, day)}
				>
					{#each getEventsForDay(day, true) as event (event.id)}
						<button
							type="button"
							class="w-full px-1 py-0.5 rounded text-left text-xs font-medium truncate"
							style:background-color={event.color}
							style:color={getContrastColor(event.color)}
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
		{#if fittedRange.startHour > 0}
			<button
				type="button"
				onclick={() => (showEarlier = !showEarlier)}
				class="w-full flex items-center justify-center gap-1 py-1.5 text-xs text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
			>
				{#if showEarlier}
					<ChevronDown class="w-3.5 h-3.5" />
					{$_('calendar.hideEarlierHours')}
				{:else}
					<ChevronUp class="w-3.5 h-3.5" />
					{$_('calendar.showEarlierHours')}
				{/if}
			</button>
		{/if}
		<div class="relative mt-3" style="height: {(endHour - startHour) * HOUR_PX}px">
			<!-- Hour lines and labels -->
			{#each visibleHours as hour (hour)}
				<div
					class="absolute left-0 right-0 border-t border-neutral-100 dark:border-neutral-800"
					style="top: {((hour - startHour) / (endHour - startHour)) * 100}%"
				>
					<span class="absolute -top-3 left-1 text-xs text-neutral-400 dark:text-neutral-500 bg-white dark:bg-neutral-800 px-1 w-12">
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
				{#each days as day (day.getTime())}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class="relative border-l border-neutral-100 dark:border-neutral-800 cursor-pointer"
						onclick={(e) => handleColumnClick(e, day)}
					>
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
						{#each getLaidOutEventsForDay(day) as { item, lane, laneCount } (item.kind === 'single' ? item.event.id : item.routine_template)}
							{#if item.kind === 'single'}
								{@const pos = windowPosition(item.event.start, item.event.end, day)}
								<EventBlock
									event={item.event}
									style="top: {pos.top}%; height: {pos.height}%; {laneStyle(lane, laneCount)}"
									compact={true}
									onclick={() => handleEventClick(item.event)}
								/>
							{:else}
								{@const pos = windowPosition(item.start, item.end, day)}
								<RoutineBlock
									routine_template={item.routine_template}
									routine_group_name={item.routine_group_name}
									color={item.color}
									icon={item.icon}
									steps={item.steps}
									style="top: {pos.top}%; height: {pos.height}%; {laneStyle(lane, laneCount)}"
									compact={true}
									target_end_time={item.target_end_time}
								/>
							{/if}
						{/each}
					</div>
				{/each}
			</div>
		</div>
		{#if fittedRange.endHour < 24}
			<button
				type="button"
				onclick={() => (showLater = !showLater)}
				class="w-full flex items-center justify-center gap-1 py-1.5 text-xs text-neutral-400 hover:text-neutral-600 dark:text-neutral-500 dark:hover:text-neutral-300"
			>
				{#if showLater}
					<ChevronUp class="w-3.5 h-3.5" />
					{$_('calendar.hideLaterHours')}
				{:else}
					<ChevronDown class="w-3.5 h-3.5" />
					{$_('calendar.showLaterHours')}
				{/if}
			</button>
		{/if}
	</div>
</div>

<EventDetailModal event={eventDetail} onclose={() => (eventDetail = null)} />
