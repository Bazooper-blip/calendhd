<script lang="ts">
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { routinesStore } from '$stores';
	import { Button, Toggle, EventIcon } from '$components/ui';
	import { toast } from 'svelte-sonner';
	import type { RoutineTemplate } from '$types';

	const DAY_ABBR: Record<string, string> = {
		mon: 'Mon',
		tue: 'Tue',
		wed: 'Wed',
		thu: 'Thu',
		fri: 'Fri',
		sat: 'Sat',
		sun: 'Sun'
	};

	const WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'] as const;
	const WEEKEND = ['sat', 'sun'] as const;
	const ALL_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

	function formatSchedule(routine: RoutineTemplate): string {
		const days = routine.schedule?.days ?? [];
		const time = routine.schedule?.time ?? '';

		let dayLabel: string;

		if (days.length === 7) {
			dayLabel = 'Every day';
		} else if (
			days.length === 5 &&
			WEEKDAYS.every((d) => days.includes(d)) &&
			WEEKEND.every((d) => !days.includes(d))
		) {
			dayLabel = 'Mon\u2013Fri';
		} else if (
			days.length === 2 &&
			WEEKEND.every((d) => days.includes(d))
		) {
			dayLabel = 'Sat\u2013Sun';
		} else {
			dayLabel = days.map((d) => DAY_ABBR[d] ?? d).join(', ');
		}

		return time ? `${dayLabel} at ${time}` : dayLabel;
	}

	function totalDuration(routine: RoutineTemplate): number {
		return (routine.steps ?? []).reduce((sum, step) => sum + (step.duration_minutes ?? 0), 0);
	}

	async function handleToggleActive(routine: RoutineTemplate) {
		try {
			await routinesStore.toggleActive(routine.id);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : $t('errors.generic'));
		}
	}

	async function handleDelete(routine: RoutineTemplate) {
		if (!confirm($t('routine.deleteConfirm') || `Delete "${routine.name}"?`)) return;

		try {
			await routinesStore.delete(routine.id);
			toast.success($t('routine.deleted') || $t('common.success'));
		} catch (error) {
			toast.error(error instanceof Error ? error.message : $t('errors.generic'));
		}
	}
</script>

<div class="h-full overflow-y-auto">
	<div class="max-w-2xl mx-auto px-4 py-6">
		<div class="flex items-center justify-between mb-6">
			<h1 class="text-2xl font-bold text-neutral-800 dark:text-neutral-100">
				{$t('routine.title')}
			</h1>
			<Button onclick={() => goto('/routines/new')}>
				<svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				{$t('routine.create')}
			</Button>
		</div>

		{#if routinesStore.loading}
			<div class="flex items-center justify-center h-64">
				<div
					class="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin"
				></div>
			</div>
		{:else if routinesStore.routines.length === 0}
			<div
				class="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700 p-8 text-center"
			>
				<div
					class="w-12 h-12 bg-neutral-100 dark:bg-neutral-700 rounded-full flex items-center justify-center mx-auto mb-4"
				>
					<svg
						class="w-6 h-6 text-neutral-400"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
						/>
					</svg>
				</div>
				<h3 class="text-lg font-medium text-neutral-800 dark:text-neutral-100 mb-1">
					{$t('routine.noRoutines')}
				</h3>
				<p class="text-neutral-500 dark:text-neutral-400 mb-4">
					{$t('routine.noRoutinesDesc') || ''}
				</p>
				<Button onclick={() => goto('/routines/new')}>{$t('routine.create')}</Button>
			</div>
		{:else}
			<div class="space-y-2">
				{#each routinesStore.routines as routine (routine.id)}
					<div
						class="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700 p-4 flex items-center gap-4 transition-opacity {routine.is_active
							? ''
							: 'opacity-50'}"
					>
						<!-- Color swatch with icon -->
						<div
							class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
							style="background-color: {routine.color || '#7C9885'}"
						>
							{#if routine.icon}
								<EventIcon icon={routine.icon} size="md" class="text-white" />
							{:else}
								<svg
									class="w-5 h-5 text-white"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
									/>
								</svg>
							{/if}
						</div>

						<!-- Name and schedule summary -->
						<div class="flex-1 min-w-0">
							<h3 class="font-medium text-neutral-800 dark:text-neutral-100 truncate">
								{routine.name}
							</h3>
							<p class="text-sm text-neutral-500 dark:text-neutral-400 truncate">
								{formatSchedule(routine)}
								{#if (routine.steps ?? []).length > 0}
									&middot; {routine.steps.length}
									{routine.steps.length === 1 ? 'step' : 'steps'}
									{#if totalDuration(routine) > 0}
										&middot; {totalDuration(routine)} min
									{/if}
								{/if}
							</p>
						</div>

						<!-- Active toggle -->
						<Toggle
							checked={routine.is_active}
							onchange={() => handleToggleActive(routine)}
						/>

						<!-- Edit button -->
						<button
							type="button"
							onclick={() => goto(`/routines/${routine.id}`)}
							class="p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 transition-colors"
							aria-label={$t('routine.edit')}
						>
							<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
								/>
							</svg>
						</button>

						<!-- Delete button -->
						<button
							type="button"
							onclick={() => handleDelete(routine)}
							class="p-2 text-neutral-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
							aria-label={$t('routine.delete')}
						>
							<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
								/>
							</svg>
						</button>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>
