<script lang="ts">
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { routinesStore } from '$stores';
	import { Button, Input, Select, ColorPicker, IconPicker } from '$components/ui';
	import { toast } from 'svelte-sonner';
	import type { RoutineStep, EnergyLevel } from '$types';

	// --- Form state ---
	let name = $state('');
	let icon = $state('');
	let color = $state('#7C9885');

	type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

	const ALL_DAYS: DayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

	const DAY_LABELS: Record<DayKey, string> = {
		mon: 'Mon',
		tue: 'Tue',
		wed: 'Wed',
		thu: 'Thu',
		fri: 'Fri',
		sat: 'Sat',
		sun: 'Sun'
	};

	let scheduleDays = $state<DayKey[]>(['mon', 'tue', 'wed', 'thu', 'fri']);
	let scheduleTime = $state('07:00');

	let steps = $state<RoutineStep[]>([
		{ title: '', duration_minutes: 10, energy_level: 'medium' }
	]);

	let saving = $state(false);

	// --- Derived ---
	const canSave = $derived(
		name.trim().length > 0 &&
			scheduleDays.length > 0 &&
			steps.every((s) => s.title.trim().length > 0)
	);

	// Timeline: compute start/end times for each step
	const timeline = $derived.by(() => {
		const [hStr, mStr] = scheduleTime.split(':');
		let cursor = parseInt(hStr ?? '7', 10) * 60 + parseInt(mStr ?? '0', 10);

		return steps.map((step) => {
			const startMin = cursor;
			const endMin = cursor + (step.duration_minutes ?? 0);
			cursor = endMin;

			const fmt = (total: number) => {
				const h = Math.floor(total / 60) % 24;
				const m = total % 60;
				return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
			};

			return {
				title: step.title,
				start: fmt(startMin),
				end: fmt(endMin),
				energy: step.energy_level ?? 'medium'
			};
		});
	});

	// --- Duration / Energy options ---
	const durationOptions = [5, 10, 15, 20, 30, 45, 60, 90, 120].map((m) => ({
		value: String(m),
		label: `${m} min`
	}));

	const energyOptions: { value: EnergyLevel; label: string }[] = [
		{ value: 'low', label: 'Low' },
		{ value: 'medium', label: 'Medium' },
		{ value: 'high', label: 'High' }
	];

	// --- Day toggle ---
	function toggleDay(day: DayKey) {
		if (scheduleDays.includes(day)) {
			scheduleDays = scheduleDays.filter((d) => d !== day);
		} else {
			scheduleDays = [...scheduleDays, day].sort(
				(a, b) => ALL_DAYS.indexOf(a) - ALL_DAYS.indexOf(b)
			);
		}
	}

	// --- Step management ---
	function addStep() {
		steps = [...steps, { title: '', duration_minutes: 10, energy_level: 'medium' }];
	}

	function removeStep(index: number) {
		if (steps.length <= 1) return;
		steps = steps.filter((_, i) => i !== index);
	}

	function moveStepUp(index: number) {
		if (index === 0) return;
		const next = [...steps];
		[next[index - 1], next[index]] = [next[index], next[index - 1]];
		steps = next;
	}

	function moveStepDown(index: number) {
		if (index === steps.length - 1) return;
		const next = [...steps];
		[next[index], next[index + 1]] = [next[index + 1], next[index]];
		steps = next;
	}

	function updateStepTitle(index: number, value: string) {
		const next = [...steps];
		next[index] = { ...next[index], title: value };
		steps = next;
	}

	function updateStepDuration(index: number, value: string) {
		const next = [...steps];
		next[index] = { ...next[index], duration_minutes: parseInt(value, 10) };
		steps = next;
	}

	function updateStepEnergy(index: number, value: string) {
		const next = [...steps];
		next[index] = { ...next[index], energy_level: value as EnergyLevel };
		steps = next;
	}

	// --- Energy dot color ---
	function energyDotClass(energy: string): string {
		if (energy === 'low') return 'bg-green-400';
		if (energy === 'high') return 'bg-red-400';
		return 'bg-amber-400';
	}

	// --- Save ---
	async function handleSave() {
		if (!canSave || saving) return;
		saving = true;
		try {
			await routinesStore.create({
				name,
				steps: $state.snapshot(steps),
				schedule: {
					days: $state.snapshot(scheduleDays) as any,
					time: scheduleTime
				},
				is_active: true,
				color: color || undefined,
				icon: icon || undefined
			});
			toast.success($t('routine.created'));
			await goto('/routines');
		} catch (err) {
			toast.error(err instanceof Error ? err.message : $t('errors.generic'));
		} finally {
			saving = false;
		}
	}
</script>

<div class="h-full overflow-y-auto">
	<div class="max-w-2xl mx-auto px-4 py-6 space-y-6">
		<!-- Top bar -->
		<div class="flex items-center gap-3">
			<Button variant="ghost" size="sm" onclick={() => goto('/routines')}>
				<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
				</svg>
				{$t('common.back')}
			</Button>
			<h1 class="text-xl font-bold text-neutral-800 dark:text-neutral-100">
				{$t('routine.create')}
			</h1>
		</div>

		<!-- 1. Header: name / icon / color -->
		<div class="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700 p-4 space-y-4">
			<h2 class="text-sm font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wide">
				Details
			</h2>

			<div>
				<label for="routine-name" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
					{$t('routine.name')} <span class="text-red-500">*</span>
				</label>
				<Input
					id="routine-name"
					placeholder={$t('routine.name')}
					bind:value={name}
					required
				/>
			</div>

			<div>
				<p class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Icon</p>
				<IconPicker value={icon} onSelect={(v) => (icon = v)} />
			</div>

			<div>
				<p class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">Color</p>
				<ColorPicker bind:value={color} />
			</div>
		</div>

		<!-- 2. Schedule -->
		<div class="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700 p-4 space-y-4">
			<h2 class="text-sm font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wide">
				{$t('routine.schedule')}
			</h2>

			<div>
				<p class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
					{$t('routine.scheduleDays')}
				</p>
				<div class="flex gap-1.5 flex-wrap">
					{#each ALL_DAYS as day (day)}
						<button
							type="button"
							onclick={() => toggleDay(day)}
							class="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 {scheduleDays.includes(day)
								? 'bg-primary-500 text-white'
								: 'bg-neutral-100 dark:bg-neutral-700 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200 dark:hover:bg-neutral-600'}"
						>
							{DAY_LABELS[day]}
						</button>
					{/each}
				</div>
			</div>

			<div>
				<label for="schedule-time" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
					{$t('routine.scheduleTime')}
				</label>
				<Input id="schedule-time" type="time" bind:value={scheduleTime} class="max-w-[10rem]" />
			</div>
		</div>

		<!-- 3. Steps -->
		<div class="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700 p-4 space-y-4">
			<h2 class="text-sm font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wide">
				{$t('routine.steps')}
			</h2>

			<ol class="space-y-3">
				{#each steps as step, i (i)}
					<li class="rounded-lg border border-neutral-200 dark:border-neutral-600 p-3 space-y-3 bg-neutral-50 dark:bg-neutral-700/50">
						<div class="flex items-center gap-2">
							<span class="text-xs font-bold text-neutral-400 w-5 text-center">{i + 1}</span>

							<div class="flex-1">
								<Input
									placeholder={$t('routine.stepTitle')}
									value={step.title}
									oninput={(e) => updateStepTitle(i, (e.target as HTMLInputElement).value)}
									required
								/>
							</div>

							<!-- Reorder buttons -->
							<div class="flex flex-col gap-0.5">
								<button
									type="button"
									onclick={() => moveStepUp(i)}
									disabled={i === 0}
									class="p-1 rounded text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
									aria-label="Move step up"
								>
									<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7" />
									</svg>
								</button>
								<button
									type="button"
									onclick={() => moveStepDown(i)}
									disabled={i === steps.length - 1}
									class="p-1 rounded text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
									aria-label="Move step down"
								>
									<svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7" />
									</svg>
								</button>
							</div>

							<!-- Remove -->
							{#if steps.length > 1}
								<button
									type="button"
									onclick={() => removeStep(i)}
									class="p-1.5 rounded text-neutral-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
									aria-label={$t('routine.removeStep')}
								>
									<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
									</svg>
								</button>
							{/if}
						</div>

						<div class="flex gap-3 pl-7">
							<div class="flex-1">
								<label for="step-duration-{i}" class="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">
									{$t('routine.stepDuration')}
								</label>
								<Select
									id="step-duration-{i}"
									options={durationOptions}
									value={String(step.duration_minutes)}
									onchange={(e) => updateStepDuration(i, (e.target as HTMLSelectElement).value)}
								/>
							</div>
							<div class="flex-1">
								<label for="step-energy-{i}" class="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">
									Energy
								</label>
								<Select
									id="step-energy-{i}"
									options={energyOptions}
									value={step.energy_level ?? 'medium'}
									onchange={(e) => updateStepEnergy(i, (e.target as HTMLSelectElement).value)}
								/>
							</div>
						</div>
					</li>
				{/each}
			</ol>

			<!-- Add step -->
			<button
				type="button"
				onclick={addStep}
				class="w-full py-2.5 rounded-lg border-2 border-dashed border-neutral-300 dark:border-neutral-600 text-sm text-neutral-500 dark:text-neutral-400 hover:border-primary-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
			>
				+ {$t('routine.addStep')}
			</button>
		</div>

		<!-- 4. Timeline preview -->
		<div class="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700 p-4 space-y-3">
			<h2 class="text-sm font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wide">
				{$t('routine.timelinePreview')}
			</h2>

			{#if timeline.length === 0}
				<p class="text-sm text-neutral-400">Add steps to see the timeline.</p>
			{:else}
				<ol class="space-y-2">
					{#each timeline as item, i (i)}
						<li class="flex items-center gap-3">
							<div class="text-xs font-mono text-neutral-500 dark:text-neutral-400 w-24 shrink-0">
								{item.start} – {item.end}
							</div>
							<span class="w-2.5 h-2.5 rounded-full shrink-0 {energyDotClass(item.energy)}"></span>
							<span class="text-sm text-neutral-700 dark:text-neutral-200 truncate">
								{item.title || '…'}
							</span>
						</li>
					{/each}
				</ol>
			{/if}
		</div>

		<!-- Bottom actions -->
		<div class="flex justify-end gap-3 pb-8">
			<Button variant="secondary" onclick={() => goto('/routines')}>
				{$t('common.cancel')}
			</Button>
			<Button onclick={handleSave} disabled={!canSave} loading={saving}>
				{$t('common.create')}
			</Button>
		</div>
	</div>
</div>
