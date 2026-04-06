<script lang="ts" module>
	import { SvelteSet } from 'svelte/reactivity';
	// Module-level state: survives component re-creates
	const expandedRoutines = new SvelteSet<string>();
</script>

<script lang="ts">
	import { goto } from '$app/navigation';
	import { cn, getContrastColor, formatTime } from '$utils';
	import { calendar, settingsStore } from '$stores';
	import { EventIcon } from '$components/ui';
	import type { EnergyLevel } from '$types';

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

	interface Props {
		routine_template: string;
		routine_group_name: string;
		color: string;
		icon?: string;
		steps: RoutineStep[];
		style?: string;
		compact?: boolean;
		target_end_time?: string;
	}

	let {
		routine_template,
		routine_group_name,
		color,
		icon,
		steps,
		style = '',
		compact = false,
		target_end_time
	}: Props = $props();

	let expanded = $state(expandedRoutines.has(routine_template));

	const format24h = $derived(settingsStore.timeFormat === '24h');
	const textColor = $derived(getContrastColor(color));
	const completedCount = $derived(steps.filter((s) => s.is_completed).length);
	const allDone = $derived(completedCount === steps.length);

	const deadlineStatus = $derived.by(() => {
		if (!target_end_time || steps.length === 0) return 'on-track';
		const lastStep = steps[steps.length - 1];
		if (!lastStep.end) return 'on-track';

		const [h, m] = target_end_time.split(':').map(Number);
		const targetMin = h * 60 + m;
		const endMin = lastStep.end.getHours() * 60 + lastStep.end.getMinutes();
		const overBy = endMin - targetMin;

		if (overBy <= 0) return 'on-track';
		if (overBy <= 5) return 'warning';
		return 'over';
	});

	function toggleExpand() {
		expanded = !expanded;
		if (expanded) {
			expandedRoutines.add(routine_template);
		} else {
			expandedRoutines.delete(routine_template);
		}
	}

	function handleCheckbox(e: MouseEvent, stepId: string) {
		e.stopPropagation();
		calendar.toggleTaskComplete(stepId);
	}

	function handleEdit(e: MouseEvent) {
		e.stopPropagation();
		goto(`/routines/${routine_template}`);
	}
</script>

<button
	type="button"
	class={cn(
		'absolute inset-x-1 rounded-lg text-left transition-all hover:ring-2 hover:ring-primary-500 hover:ring-offset-1 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1',
		expanded ? 'z-10 ring-2 ring-primary-500/30 shadow-lg overflow-y-auto' : 'overflow-hidden'
	)}
	style="{expanded ? style.replace(/height:\s*[^;]+;?/, '') + 'height: auto;' : style} background-color: {color};"
	onclick={toggleExpand}
>
	<div class="px-2 py-1 h-full flex flex-col" style:color={textColor}>
		<!-- Header row: icon, name, progress, edit -->
		<div class="flex items-center gap-1">
			<span class={cn('font-semibold truncate flex-1 flex items-center gap-1', compact ? 'text-xs' : 'text-xs')}>
				{#if icon}
					<EventIcon icon={icon} size="sm" />
				{/if}
				{routine_group_name}
			</span>
			<!-- Progress pill -->
			<span class={cn(
				'flex-shrink-0 text-[10px] font-medium rounded-full px-1.5',
				allDone ? 'bg-white/30'
					: deadlineStatus === 'over' ? 'bg-red-500/30'
					: deadlineStatus === 'warning' ? 'bg-amber-500/30'
					: 'bg-black/10'
			)}>
				{completedCount}/{steps.length}
			</span>
			{#if target_end_time}
				<span class={cn(
					'flex-shrink-0 text-[9px] opacity-60',
					deadlineStatus === 'over' && 'opacity-90 text-red-200',
					deadlineStatus === 'warning' && 'opacity-80'
				)}>
					by {target_end_time}
				</span>
			{/if}
			<!-- Edit icon -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<span
				onclick={handleEdit}
				class="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
				role="link"
				tabindex="0"
				aria-label="Edit routine"
			>
				<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
				</svg>
			</span>
		</div>

		{#if expanded}
			<!-- Expanded: all steps with checkboxes -->
			<div class="mt-1 space-y-px overflow-y-auto flex-1">
				{#each steps as step (step.id)}
					<div class={cn(
						'flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors',
						compact ? 'text-[10px]' : 'text-[11px]'
					)}>
						<!-- Checkbox -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<span
							onclick={(e) => handleCheckbox(e, step.id)}
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
						{#if step.energy_level}
							<span class={cn(
								'flex-shrink-0 w-1.5 h-1.5 rounded-full',
								step.energy_level === 'low' && 'bg-green-400',
								step.energy_level === 'medium' && 'bg-amber-400',
								step.energy_level === 'high' && 'bg-red-400'
							)}></span>
						{/if}
						<span class={cn('truncate', step.is_completed && 'line-through opacity-60')}>
							{step.title}
						</span>
						<span class="flex-shrink-0 opacity-60 ml-auto">
							{#if step.timing_mode === 'flexible' && !step.is_completed}~{/if}{formatTime(step.start, format24h)}
						</span>
					</div>
				{/each}
			</div>
		{:else}
			<!-- Collapsed: first step + more -->
			<span class={cn('opacity-80 truncate', compact ? 'text-[10px]' : 'text-[11px]')}>
				{steps[0].title}{#if steps.length > 1}&ensp;<span class="opacity-70">(+{steps.length - 1} more)</span>{/if}
			</span>
		{/if}
	</div>
</button>
