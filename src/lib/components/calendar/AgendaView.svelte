<script lang="ts" module>
	import { SvelteSet } from 'svelte/reactivity';
	// Persist routine-expand state across re-renders (matches RoutineBlock pattern)
	const expandedRoutines = new SvelteSet<string>();
</script>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { browser } from '$app/environment';
	import { calendar, routinesStore, settingsStore } from '$stores';
	import { _ } from '$lib/i18n';
	import {
		addDays,
		cn,
		formatTime,
		formatTimeRange,
		getContrastColor,
		isToday,
		isSameDay
	} from '$utils';
	import type { DisplayEvent, EnergyLevel } from '$types';
	import { EventIcon } from '$components/ui';
	import ExternalEventModal from './ExternalEventModal.svelte';

	interface RoutineStep {
		id: string;
		title: string;
		start: Date;
		end?: Date;
		icon?: string;
		energy_level?: EnergyLevel;
		is_completed: boolean;
		timing_mode?: 'fixed' | 'flexible';
	}

	interface RoutineGroup {
		kind: 'routine-group';
		routine_template: string;
		routine_group_name: string;
		color: string;
		icon?: string;
		start: Date;
		end: Date;
		target_end_time?: string;
		steps: RoutineStep[];
	}

	type ProcessedEvent =
		| { kind: 'single'; event: DisplayEvent }
		| RoutineGroup;

	type GapRow = { kind: 'gap'; from: Date; to: Date; minutes: number };
	type AgendaRow = { kind: 'event'; item: ProcessedEvent } | GapRow;

	// Only show "Free for ~X" rows for gaps at least this long, so
	// back-to-back days don't get cluttered. Fixed value — not a setting.
	const MIN_GAP_MINUTES = 20;

	let { date }: { date: Date } = $props();

	let now = $state(new Date());
	$effect(() => {
		if (!browser) return;
		const interval = setInterval(() => {
			now = new Date();
		}, 60_000);
		return () => clearInterval(interval);
	});

	const format24h = $derived(settingsStore.timeFormat === '24h');

	const allDayEvents = $derived(
		calendar.displayEvents.filter((e) => e.is_all_day && isSameDay(e.start, date))
	);

	// Same routine-grouping logic as DayView, kept self-contained so the agenda
	// component can be reasoned about on its own.
	const processedDayEvents = $derived.by((): ProcessedEvent[] => {
		const events = calendar.displayEvents.filter(
			(e) => !e.is_all_day && isSameDay(e.start, date)
		);
		const routineEvents: DisplayEvent[] = [];
		const regularEvents: DisplayEvent[] = [];
		for (const e of events) {
			if (e.routine_template) routineEvents.push(e);
			else regularEvents.push(e);
		}
		const routineGroups = new Map<string, DisplayEvent[]>();
		for (const e of routineEvents) {
			const key = e.routine_template!;
			const group = routineGroups.get(key);
			if (group) group.push(e);
			else routineGroups.set(key, [e]);
		}
		const processed: ProcessedEvent[] = regularEvents.map((event) => ({
			kind: 'single' as const,
			event
		}));
		for (const [templateId, group] of routineGroups) {
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
		// Sort everything by start time
		return processed.sort((a, b) => {
			const aStart = a.kind === 'single' ? a.event.start : a.start;
			const bStart = b.kind === 'single' ? b.event.start : b.start;
			return aStart.getTime() - bStart.getTime();
		});
	});

	// Tomorrow's first event, for the footer preview (today only). The calendar
	// store's day-view range includes tomorrow for exactly this.
	const tomorrowFirst = $derived.by((): DisplayEvent | null => {
		if (!isToday(date)) return null;
		const tomorrow = addDays(date, 1);
		const events = calendar.displayEvents.filter((e) => isSameDay(e.start, tomorrow));
		if (events.length === 0) return null;
		const timed = events.filter((e) => !e.is_all_day);
		if (timed.length === 0) return events[0];
		return timed.toSorted((a, b) => a.start.getTime() - b.start.getTime())[0];
	});

	function itemStart(item: ProcessedEvent): Date {
		return item.kind === 'single' ? item.event.start : item.start;
	}
	function itemEnd(item: ProcessedEvent): Date | undefined {
		return item.kind === 'single' ? item.event.end : item.end;
	}
	function itemEndOrStartPlus(item: ProcessedEvent): Date {
		const end = itemEnd(item);
		if (end) return end;
		// Single-point items: treat as ended 1 min after start
		return new Date(itemStart(item).getTime() + 60_000);
	}

	function isHappeningNow(item: ProcessedEvent, n: Date): boolean {
		const start = itemStart(item);
		const end = itemEnd(item);
		if (start > n) return false;
		if (end) return n < end;
		return n.getTime() < start.getTime() + 60_000;
	}

	// Split into Earlier / Now / Upcoming. For non-today dates everything goes
	// to "Upcoming" (i.e. one flat list) since past/now/future is meaningless.
	const sections = $derived.by(() => {
		const past: ProcessedEvent[] = [];
		const current: ProcessedEvent[] = [];
		const upcoming: ProcessedEvent[] = [];
		if (!isToday(date)) {
			return { past, current, upcoming: processedDayEvents };
		}
		for (const item of processedDayEvents) {
			if (isHappeningNow(item, now)) {
				current.push(item);
			} else if (itemEndOrStartPlus(item) <= now) {
				past.push(item);
			} else {
				upcoming.push(item);
			}
		}
		return { past, current, upcoming };
	});

	// Interleave "Free for ~X" gap rows between upcoming items.
	const upcomingWithGaps = $derived.by((): AgendaRow[] => {
		const out: AgendaRow[] = [];
		// Anchor previous-end: end of "happening now" if there is one, else
		// "now" itself on today, else undefined (no prior anchor for non-today).
		let prevEnd: Date | undefined;
		if (sections.current.length > 0) {
			prevEnd = itemEndOrStartPlus(sections.current[sections.current.length - 1]);
		} else if (isToday(date)) {
			prevEnd = now;
		}
		for (const item of sections.upcoming) {
			const start = itemStart(item);
			if (prevEnd) {
				const gapMs = start.getTime() - prevEnd.getTime();
				const gapMin = Math.round(gapMs / 60_000);
				if (gapMin >= MIN_GAP_MINUTES) {
					out.push({ kind: 'gap', from: prevEnd, to: start, minutes: gapMin });
				}
			}
			out.push({ kind: 'event', item });
			prevEnd = itemEndOrStartPlus(item);
		}
		return out;
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

	function minutesLeft(item: ProcessedEvent): number | null {
		const end = itemEnd(item);
		if (!end) return null;
		return Math.max(0, Math.round((end.getTime() - now.getTime()) / 60_000));
	}

	let earlierExpanded = $state(false);

	function toggleRoutine(templateId: string) {
		if (expandedRoutines.has(templateId)) expandedRoutines.delete(templateId);
		else expandedRoutines.add(templateId);
	}

	function handleEventClick(event: DisplayEvent) {
		if (event.is_external) {
			externalDetail = event;
			return;
		}
		goto(`/event/${event.id}`);
	}

	function handleStepCheckbox(e: MouseEvent, stepId: string) {
		e.stopPropagation();
		calendar.toggleTaskComplete(stepId);
	}

	function handleSingleCheckbox(e: MouseEvent, eventId: string) {
		e.stopPropagation();
		calendar.toggleTaskComplete(eventId);
	}

	function handleRoutineEdit(e: MouseEvent, templateId: string) {
		e.stopPropagation();
		goto(`/routines/${templateId}`);
	}

	let externalDetail = $state<DisplayEvent | null>(null);
</script>

<div class="flex-1 overflow-y-auto px-4 py-3 space-y-4">
	<!-- All-day events -->
	{#if allDayEvents.length > 0}
		<section class="space-y-1.5">
			<h3 class="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 px-1">
				{$_('time.allDay')}
			</h3>
			<div class="space-y-1">
				{#each allDayEvents as event (event.id)}
					<button
						type="button"
						class="w-full px-3 py-2 rounded-lg text-left text-sm font-medium truncate flex items-center gap-2"
						style:background-color={event.color}
						style:color={getContrastColor(event.color)}
						onclick={() => handleEventClick(event)}
					>
						{#if event.icon}
							<EventIcon icon={event.icon} size="md" />
						{/if}
						<span class="truncate">{event.title}</span>
					</button>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Empty-state -->
	{#if processedDayEvents.length === 0 && allDayEvents.length === 0}
		<div class="text-center py-12 text-neutral-400 dark:text-neutral-500">
			<p class="text-sm">{$_('event.noEvents')}</p>
		</div>
	{/if}

	<!-- Earlier today (collapsible) -->
	{#if sections.past.length > 0}
		<section>
			<button
				type="button"
				onclick={() => (earlierExpanded = !earlierExpanded)}
				class="w-full flex items-center gap-2 px-1 py-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors"
				aria-expanded={earlierExpanded}
			>
				<svg
					class="w-3 h-3 transition-transform {earlierExpanded ? 'rotate-90' : ''}"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2.5"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
				</svg>
				<span>{$_('agenda.earlierToday', { values: { count: sections.past.length } })}</span>
			</button>
			{#if earlierExpanded}
				<div class="mt-2 space-y-1">
					{#each sections.past as item (item.kind === 'single' ? item.event.id : item.routine_template)}
						{@render compactRow(item, true)}
					{/each}
				</div>
			{/if}
		</section>
	{/if}

	<!-- Now -->
	{#if sections.current.length > 0}
		<section class="space-y-2">
			<h3 class="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-primary-700 dark:text-primary-300 px-1">
				<span class="relative inline-flex items-center justify-center">
					<span class="w-2 h-2 rounded-full bg-primary-500"></span>
					<span class="absolute w-2 h-2 rounded-full bg-primary-500 animate-ping opacity-75"></span>
				</span>
				{$_('agenda.now')}
			</h3>
			<div class="space-y-2">
				{#each sections.current as item (item.kind === 'single' ? item.event.id : item.routine_template)}
					{@render bigCard(item, 'now')}
				{/each}
			</div>
		</section>
	{/if}

	<!-- Upcoming (with free-time gap rows interleaved) -->
	{#if sections.upcoming.length > 0}
		<section class="space-y-2">
			<h3 class="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 px-1">
				{isToday(date) ? $_('agenda.upcoming') : $_('agenda.allEvents')}
			</h3>
			<div class="space-y-1.5">
				{#each upcomingWithGaps as row, idx (idx)}
					{#if row.kind === 'gap'}
						<div class="flex items-center gap-2 px-1 py-1 text-xs text-neutral-400 dark:text-neutral-500">
							<div class="flex-1 h-px bg-neutral-200 dark:bg-neutral-700"></div>
							<span class="px-2 italic">
								{$_('agenda.freeFor', { values: { duration: formatRelative(row.minutes) } })}
							</span>
							<div class="flex-1 h-px bg-neutral-200 dark:bg-neutral-700"></div>
						</div>
					{:else}
						{@const isNextUp = isToday(date)
							&& idx === upcomingWithGaps.findIndex((r) => r.kind === 'event')}
						{#if isNextUp}
							{@render bigCard(row.item, 'next')}
						{:else}
							{@render compactRow(row.item, false)}
						{/if}
					{/if}
				{/each}
			</div>
		</section>
	{/if}

	<!-- Tomorrow preview: soften the day boundary without cluttering today -->
	{#if tomorrowFirst}
		<div class="flex items-center gap-1.5 px-1 pt-3 border-t border-neutral-100 dark:border-neutral-800 text-xs text-neutral-400 dark:text-neutral-500">
			<span class="flex-shrink-0">{$_('common.tomorrow')}:</span>
			{#if tomorrowFirst.icon}<EventIcon icon={tomorrowFirst.icon} size="sm" />{/if}
			<span class="truncate">{tomorrowFirst.title}</span>
			{#if !tomorrowFirst.is_all_day}
				<span class="flex-shrink-0 tabular-nums">{formatTime(tomorrowFirst.start, format24h)}</span>
			{/if}
		</div>
	{/if}
</div>

<!-- Big card render (for "now" and "next") -->
{#snippet bigCard(item: ProcessedEvent, variant: 'now' | 'next')}
	{@const textColor = getContrastColor(item.kind === 'single' ? item.event.color : item.color)}
	{@const bgColor = item.kind === 'single' ? item.event.color : item.color}
	{#if item.kind === 'single'}
		{@const ev = item.event}
		{@const left = minutesLeft(item)}
		<button
			type="button"
			onclick={() => handleEventClick(ev)}
			class={cn(
				'w-full rounded-xl text-left shadow-sm transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary-500',
				variant === 'now' && 'ring-2 ring-primary-400 ring-offset-2 ring-offset-white dark:ring-offset-neutral-900',
				ev.is_completed && 'opacity-60'
			)}
			style:background-color={bgColor}
		>
			<div class="px-4 py-3 flex items-start gap-3" style:color={textColor}>
				{#if ev.is_task}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<!-- svelte-ignore a11y_interactive_supports_focus -->
					<span
						onclick={(e) => handleSingleCheckbox(e, ev.id)}
						class={cn(
							'flex-shrink-0 mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors cursor-pointer',
							ev.is_completed ? 'bg-white/30 border-white/50' : 'border-white/70 hover:border-white'
						)}
						role="checkbox"
						aria-checked={ev.is_completed}
						aria-label={ev.is_completed ? $_('event.markIncomplete') : $_('event.markComplete')}
					>
						{#if ev.is_completed}
							<svg class="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
							</svg>
						{/if}
					</span>
				{/if}
				<div class="flex-1 min-w-0">
					{#if ev.routine_group_name}
						<span class="text-[10px] opacity-70 truncate block">{ev.routine_group_name}</span>
					{/if}
					<div class="flex items-center gap-2 font-semibold text-base">
						{#if ev.icon}
							<EventIcon icon={ev.icon} size="md" />
						{/if}
						<span class={cn('truncate', ev.is_completed && 'line-through opacity-80')}>{ev.title}</span>
						{#if ev.energy_level}
							<span
								class="flex-shrink-0 w-2 h-2 rounded-full"
								class:bg-green-300={ev.energy_level === 'low'}
								class:bg-amber-300={ev.energy_level === 'medium'}
								class:bg-red-300={ev.energy_level === 'high'}
							></span>
						{/if}
					</div>
					<div class="mt-1 flex items-center gap-2 text-xs opacity-90">
						<span>{formatTimeRange(ev.start, ev.end, format24h)}</span>
						{#if variant === 'now' && left !== null}
							<span class="px-1.5 py-0.5 rounded-full bg-white/25 font-medium">
								{$_('agenda.minLeft', { values: { duration: formatRelative(left) } })}
							</span>
						{:else if variant === 'next'}
							<span class="px-1.5 py-0.5 rounded-full bg-white/25 font-medium">
								{$_('calendar.in')} {formatRelative(minutesUntil(ev.start))}
							</span>
						{/if}
					</div>
					{#if ev.is_external}
						<span class="block mt-1 text-[10px] opacity-70 truncate">{ev.subscription_name}</span>
					{/if}
				</div>
			</div>
		</button>
	{:else}
		{@const completedCount = item.steps.filter((s) => s.is_completed).length}
		{@const expanded = expandedRoutines.has(item.routine_template)}
		<button
			type="button"
			onclick={() => toggleRoutine(item.routine_template)}
			class={cn(
				'w-full rounded-xl text-left shadow-sm transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary-500',
				variant === 'now' && 'ring-2 ring-primary-400 ring-offset-2 ring-offset-white dark:ring-offset-neutral-900'
			)}
			style:background-color={bgColor}
		>
			<div class="px-4 py-3" style:color={textColor}>
				<div class="flex items-center gap-2">
					{#if item.icon}
						<EventIcon icon={item.icon} size="md" />
					{/if}
					<span class="font-semibold text-base truncate flex-1">{item.routine_group_name}</span>
					<span class="flex-shrink-0 text-xs font-medium rounded-full bg-white/25 px-2 py-0.5">
						{completedCount}/{item.steps.length}
					</span>
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<span
						onclick={(e) => handleRoutineEdit(e, item.routine_template)}
						class="flex-shrink-0 opacity-70 hover:opacity-100 transition-opacity cursor-pointer"
						role="link"
						tabindex="0"
						aria-label={$_('routine.edit')}
					>
						<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
						</svg>
					</span>
				</div>
				<div class="mt-1 flex items-center gap-2 text-xs opacity-90">
					<span>{formatTime(item.start, format24h)} – {formatTime(item.end, format24h)}</span>
					{#if variant === 'next'}
						<span class="px-1.5 py-0.5 rounded-full bg-white/25 font-medium">
							{$_('calendar.in')} {formatRelative(minutesUntil(item.start))}
						</span>
					{/if}
				</div>
				{#if expanded}
					<div class="mt-2 space-y-0.5">
						{#each item.steps as step (step.id)}
							<div class="flex items-center gap-2 text-xs px-1 py-0.5">
								<!-- svelte-ignore a11y_click_events_have_key_events -->
								<span
									onclick={(e) => handleStepCheckbox(e, step.id)}
									class={cn(
										'flex-shrink-0 w-3.5 h-3.5 rounded border-[1.5px] flex items-center justify-center cursor-pointer transition-colors',
										step.is_completed
											? 'bg-white/30 border-white/50'
											: 'border-white/70 hover:border-white'
									)}
									role="checkbox"
									tabindex="0"
									aria-checked={step.is_completed}
								>
									{#if step.is_completed}
										<svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
											<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
										</svg>
									{/if}
								</span>
								<span class={cn('truncate flex-1', step.is_completed && 'line-through opacity-60')}>
									{step.title}
								</span>
								<span class="opacity-70">
									{#if step.timing_mode === 'flexible' && !step.is_completed}~{/if}{formatTime(step.start, format24h)}
								</span>
							</div>
						{/each}
					</div>
				{:else}
					<span class="mt-1 block text-xs opacity-80 truncate">
						{item.steps[0].title}{#if item.steps.length > 1}&ensp;<span class="opacity-70">(+{item.steps.length - 1} {$_('agenda.moreSteps')})</span>{/if}
					</span>
				{/if}
			</div>
		</button>
	{/if}
{/snippet}

<!-- Compact row render (for past + later-today items) -->
{#snippet compactRow(item: ProcessedEvent, dimmed: boolean)}
	{@const start = itemStart(item)}
	{@const end = itemEnd(item)}
	{@const color = item.kind === 'single' ? item.event.color : item.color}
	{#if item.kind === 'single'}
		{@const ev = item.event}
		<button
			type="button"
			onclick={() => handleEventClick(ev)}
			class={cn(
				'w-full flex items-center gap-3 px-2 py-1.5 rounded-lg text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500',
				dimmed && 'opacity-55',
				ev.is_completed && !dimmed && 'opacity-60'
			)}
		>
			<span class="flex-shrink-0 text-xs tabular-nums text-neutral-500 dark:text-neutral-400 w-14">
				{formatTime(start, format24h)}
			</span>
			<span
				class="flex-shrink-0 w-1 self-stretch rounded-full"
				style:background-color={color}
			></span>
			{#if ev.is_task}
				<!-- svelte-ignore a11y_click_events_have_key_events -->
				<span
					onclick={(e) => handleSingleCheckbox(e, ev.id)}
					class={cn(
						'flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center cursor-pointer transition-colors',
						ev.is_completed
							? 'bg-primary-500 border-primary-500'
							: 'border-neutral-300 dark:border-neutral-600 hover:border-primary-500'
					)}
					role="checkbox"
					tabindex="0"
					aria-checked={ev.is_completed}
					aria-label={ev.is_completed ? $_('event.markIncomplete') : $_('event.markComplete')}
				>
					{#if ev.is_completed}
						<svg class="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
							<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
						</svg>
					{/if}
				</span>
			{/if}
			{#if ev.icon}
				<EventIcon icon={ev.icon} size="md" />
			{/if}
			<span class={cn(
				'min-w-0 truncate text-neutral-800 dark:text-neutral-100',
				ev.is_completed && 'line-through'
			)}>
				{ev.title}
			</span>
			<!-- End time hugs the title; a far-right time reads as detached from its row -->
			{#if end}
				<span class="flex-shrink-0 text-xs text-neutral-400 dark:text-neutral-500 tabular-nums">
					&ndash;&thinsp;{formatTime(end, format24h)}
				</span>
			{/if}
			<span class="flex-1"></span>
			{#if ev.energy_level}
				<span
					class="flex-shrink-0 w-1.5 h-1.5 rounded-full"
					class:bg-green-400={ev.energy_level === 'low'}
					class:bg-amber-400={ev.energy_level === 'medium'}
					class:bg-red-400={ev.energy_level === 'high'}
				></span>
			{/if}
		</button>
	{:else}
		{@const completedCount = item.steps.filter((s) => s.is_completed).length}
		{@const expanded = expandedRoutines.has(item.routine_template)}
		<div
			class={cn(
				'rounded-lg',
				dimmed && 'opacity-55'
			)}
		>
			<button
				type="button"
				onclick={() => toggleRoutine(item.routine_template)}
				class="w-full flex items-center gap-3 px-2 py-1.5 text-left text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800/50 rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500"
			>
				<span class="flex-shrink-0 text-xs tabular-nums text-neutral-500 dark:text-neutral-400 w-14">
					{formatTime(start, format24h)}
				</span>
				<span
					class="flex-shrink-0 w-1 self-stretch rounded-full"
					style:background-color={color}
				></span>
				{#if item.icon}
					<EventIcon icon={item.icon} size="md" />
				{/if}
				<span class="flex-1 truncate text-neutral-800 dark:text-neutral-100 font-medium">
					{item.routine_group_name}
				</span>
				<span class="flex-shrink-0 text-[10px] font-medium rounded-full bg-neutral-100 dark:bg-neutral-700 px-1.5 py-0.5 text-neutral-600 dark:text-neutral-300">
					{completedCount}/{item.steps.length}
				</span>
				<svg
					class="w-3 h-3 text-neutral-400 transition-transform {expanded ? 'rotate-90' : ''}"
					fill="none"
					viewBox="0 0 24 24"
					stroke="currentColor"
					stroke-width="2.5"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" />
				</svg>
			</button>
			{#if expanded}
				<div class="mt-0.5 ml-[5.25rem] mr-2 mb-1 space-y-0.5">
					{#each item.steps as step (step.id)}
						<div class="flex items-center gap-2 text-xs px-1 py-0.5">
							<!-- svelte-ignore a11y_click_events_have_key_events -->
							<span
								onclick={(e) => handleStepCheckbox(e, step.id)}
								class={cn(
									'flex-shrink-0 w-3.5 h-3.5 rounded border-2 flex items-center justify-center cursor-pointer transition-colors',
									step.is_completed
										? 'bg-primary-500 border-primary-500'
										: 'border-neutral-300 dark:border-neutral-600 hover:border-primary-500'
								)}
								role="checkbox"
								tabindex="0"
								aria-checked={step.is_completed}
							>
								{#if step.is_completed}
									<svg class="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20">
										<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
									</svg>
								{/if}
							</span>
							<span class={cn('truncate flex-1 text-neutral-700 dark:text-neutral-200', step.is_completed && 'line-through opacity-60')}>
								{step.title}
							</span>
							<span class="text-neutral-400 dark:text-neutral-500 tabular-nums">
								{#if step.timing_mode === 'flexible' && !step.is_completed}~{/if}{formatTime(step.start, format24h)}
							</span>
						</div>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
{/snippet}

<ExternalEventModal event={externalDetail} onclose={() => (externalDetail = null)} />
