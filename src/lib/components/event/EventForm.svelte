<script lang="ts">
	import { t } from 'svelte-i18n';
	import { addDays, format } from 'date-fns';
	import { Button, Input, Select, Toggle, ColorPicker, IconPicker } from '$components/ui';
	import { categoriesStore, templatesStore, settingsStore } from '$stores';
	import { REMINDER_OPTIONS, addMinutesToTime, timeCrossesMidnight } from '$utils';
	import type { EventFormData, ReminderConfig, RecurrenceRule } from '$types';
	import RecurrencePicker from './RecurrencePicker.svelte';

	interface Props {
		initialData?: Partial<EventFormData>;
		onsubmit: (data: EventFormData) => void;
		oncancel?: () => void;
		loading?: boolean;
	}

	let { initialData = {}, onsubmit, oncancel, loading = false }: Props = $props();

	const DEFAULT_DURATION_MINUTES = 60;

	// Initial values (computed once; the form owns its state after mount).
	// The edit page flags an existing timed event with no stored end as
	// open-ended ("I don't know how long this will take"). Otherwise the end
	// is prefilled (start + 1h, same day) so the user sees what they'll get
	// instead of a blank that silently meant "no end".
	const initialOpenEnded = !!initialData.open_ended && !initialData.is_all_day;
	const initialStartDate = initialData.start_date || format(new Date(), 'yyyy-MM-dd');
	const initialStartTime = initialData.start_time || '09:00';
	const initialHasEnd = !initialOpenEnded && !initialData.is_all_day;
	const initialEndTime =
		initialData.end_time ||
		(initialHasEnd ? addMinutesToTime(initialStartTime, DEFAULT_DURATION_MINUTES) : '');
	const initialEndDate =
		initialData.end_date ||
		(initialHasEnd ? endDateFor(initialStartDate, initialStartTime, initialEndTime) : '');

	// Form state
	let title = $state(initialData.title || '');
	let description = $state(initialData.description || '');
	let firstStep = $state(initialData.first_step || '');
	let startDate = $state(initialStartDate);
	let startTime = $state(initialStartTime);
	let isAllDay = $state(initialData.is_all_day || false);
	let openEnded = $state(initialOpenEnded);
	let endDate = $state(initialEndDate);
	let endTime = $state(initialEndTime);
	let isTask = $state(initialData.is_task || false);
	let category = $state(initialData.category || '');
	let colorOverride = $state(initialData.color_override || '');
	let icon = $state(initialData.icon || '');
	let reminders = $state<ReminderConfig[]>(
		initialData.reminders || settingsStore.defaultReminders
	);
	let recurrenceRule = $state<RecurrenceRule | undefined>(initialData.recurrence_rule);
	let isPaused = $state(initialData.is_paused || false);

	// Previous start values so edits can keep the duration / same-day end.
	let prevStartDate = initialStartDate;
	let prevStartTime = initialStartTime;

	function endDateFor(sDate: string, sTime: string, eTime: string): string {
		// Cross-midnight stop lands on the next day
		return timeCrossesMidnight(sTime, eTime)
			? format(addDays(new Date(`${sDate}T00:00:00`), 1), 'yyyy-MM-dd')
			: sDate;
	}

	// Moving the start drags the end along (duration preserved), unless the
	// user gave the event an explicit multi-day end date.
	function handleStartTimeChange() {
		if (isAllDay || openEnded) {
			prevStartTime = startTime;
			return;
		}
		const [ph, pm] = prevStartTime.split(':').map(Number);
		const [nh, nm] = startTime.split(':').map(Number);
		const shift = nh * 60 + nm - (ph * 60 + pm);
		if (endTime && Number.isFinite(shift)) {
			const prevEndDate = endDateFor(startDate, prevStartTime, endTime);
			endTime = addMinutesToTime(endTime, shift);
			if (!endDate || endDate === prevEndDate) {
				endDate = endDateFor(startDate, startTime, endTime);
			}
		}
		prevStartTime = startTime;
	}

	function handleStartDateChange() {
		if (!endDate || endDate === prevStartDate || endDate === endDateFor(prevStartDate, startTime, endTime)) {
			endDate = isAllDay || openEnded ? '' : endDateFor(startDate, startTime, endTime);
		}
		prevStartDate = startDate;
	}

	// Derived
	const categoryOptions = $derived(
		categoriesStore.categories.map((c) => ({
			value: c.id,
			label: c.name
		}))
	);

	const templateOptions = $derived(
		templatesStore.templates.map((t) => ({
			value: t.id,
			label: t.name
		}))
	);

	const reminderOptions = $derived(REMINDER_OPTIONS.map((r) => ({
		value: r.value.toString(),
		label: $t(r.i18nKey)
	})));

	// Apply template
	function applyTemplate(templateId: string) {
		const template = templatesStore.getById(templateId);
		if (!template) return;

		// The template's name is the natural default title; never clobber
		// something the user already typed.
		if (!title.trim()) title = template.name;
		if (!description.trim() && template.description) description = template.description;
		if (template.category) category = template.category;
		if (template.color_override) colorOverride = template.color_override;
		if (template.icon) icon = template.icon;
		if (template.default_reminders) reminders = template.default_reminders;
		if (template.recurrence_rule?.frequency) recurrenceRule = { ...template.recurrence_rule };
		isAllDay = template.default_is_all_day;

		if (!isAllDay && template.default_start_time && template.default_end_time) {
			// Template carries a specific time of day — prefill it; the user
			// still picks the date.
			openEnded = false;
			startTime = template.default_start_time;
			endTime = template.default_end_time;
			endDate = endDateFor(startDate, startTime, endTime);
		} else if (!isAllDay && template.default_duration_minutes && startTime) {
			openEnded = false;
			endTime = addMinutesToTime(startTime, template.default_duration_minutes);
			endDate = endDateFor(startDate, startTime, endTime);
		}
		prevStartTime = startTime;
	}

	// Handle reminder change
	function setReminder(index: number, minutesBefore: number) {
		reminders = reminders.map((r, i) =>
			i === index ? { ...r, minutes_before: minutesBefore } : r
		);
	}

	function addReminder() {
		reminders = [...reminders, { minutes_before: 10, type: 'notification' }];
	}

	function removeReminder(index: number) {
		reminders = reminders.filter((_, i) => i !== index);
	}

	// Submit handler
	function handleSubmit(e: Event) {
		e.preventDefault();

		const hasEnd = !isAllDay && !openEnded;
		const resolvedEndTime = hasEnd
			? endTime || addMinutesToTime(startTime, DEFAULT_DURATION_MINUTES)
			: undefined;
		const resolvedEndDate =
			hasEnd && resolvedEndTime
				? endDate || endDateFor(startDate, startTime, resolvedEndTime)
				: undefined;

		// Use $state.snapshot() to convert proxies to plain objects
		const data: EventFormData = {
			title,
			description: description || undefined,
			first_step: isTask ? firstStep || undefined : undefined,
			start_date: startDate,
			start_time: isAllDay ? undefined : startTime,
			end_date: resolvedEndDate,
			end_time: resolvedEndTime,
			is_all_day: isAllDay,
			is_task: isTask,
			category: category || undefined,
			color_override: colorOverride || undefined,
			icon: icon || undefined,
			reminders: $state.snapshot(reminders),
			recurrence_rule: recurrenceRule ? $state.snapshot(recurrenceRule) : undefined,
			// Pausing only makes sense for recurring events — dropping the
			// recurrence also clears any pause.
			is_paused: recurrenceRule ? isPaused : false
		};

		onsubmit(data);
	}
</script>

<form onsubmit={handleSubmit} class="space-y-6">
	<!-- Template selector -->
	{#if templateOptions.length > 0}
		<div>
			<span class="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
				{$t('template.startFrom')}
			</span>
			<Select
				options={templateOptions}
				placeholder={$t('template.selectTemplate')}
				onchange={(e) => applyTemplate((e.target as HTMLSelectElement).value)}
			/>
		</div>
	{/if}

	<!-- Title -->
	<div>
		<label for="title" class="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
			{$t('event.title')} <span class="text-red-500">*</span>
		</label>
		<Input
			id="title"
			bind:value={title}
			placeholder={$t('event.title')}
			required
		/>
	</div>

	<!-- Icon -->
	<div>
		<span class="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
			{$t('event.icon')}
			<span class="text-neutral-400 dark:text-neutral-500 font-normal">({$t('common.optional')})</span>
		</span>
		<IconPicker value={icon} onSelect={(v) => icon = v} />
	</div>

	<!-- Event type toggles -->
	<div class="space-y-3">
		<Toggle
			bind:checked={isAllDay}
			label={$t('event.allDay')}
			description={$t('event.allDayDescription')}
		/>
		<Toggle
			bind:checked={isTask}
			label={$t('event.isTask')}
			description={$t('event.isTaskDescription')}
		/>
	</div>

	<!-- First-step extraction (ADHD): when this is a task, prompt for the
	     first physical action — what reminders show instead of the abstract title. -->
	{#if isTask}
		<div class="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-900/10 p-3">
			<label for="first-step" class="block text-sm font-medium text-amber-800 dark:text-amber-300 mb-1">
				{$t('event.firstStep')}
				<span class="text-neutral-400 dark:text-neutral-500 font-normal">({$t('common.optional')})</span>
			</label>
			<p class="text-xs text-amber-700 dark:text-amber-400 mb-2">
				{$t('event.firstStepHelp')}
			</p>
			<Input
				id="first-step"
				bind:value={firstStep}
				placeholder={$t('event.firstStepPlaceholder')}
			/>
		</div>
	{/if}

	<!-- Date and time -->
	<div class="grid grid-cols-2 gap-4">
		<div>
			<label for="start-date" class="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
				{$t('event.startDate')} <span class="text-red-500">*</span>
			</label>
			<Input
				id="start-date"
				type="date"
				bind:value={startDate}
				onchange={handleStartDateChange}
				required
			/>
		</div>
		{#if !isAllDay}
			<div>
				<label for="start-time" class="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
					{$t('event.startTime')}
				</label>
				<Input
					id="start-time"
					type="time"
					bind:value={startTime}
					onchange={handleStartTimeChange}
				/>
			</div>
		{/if}
	</div>

	{#if !isAllDay}
		<!-- Open-ended: "I know when it starts, not when it ends" -->
		<Toggle
			bind:checked={openEnded}
			label={$t('event.openEnded')}
			description={$t('event.openEndedDescription')}
		/>

		{#if !openEnded}
			<div class="grid grid-cols-2 gap-4">
				<div>
					<label for="end-date" class="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
						{$t('event.endDate')}
					</label>
					<Input
						id="end-date"
						type="date"
						bind:value={endDate}
					/>
				</div>
				<div>
					<label for="end-time" class="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
						{$t('event.endTime')}
					</label>
					<Input
						id="end-time"
						type="time"
						bind:value={endTime}
					/>
				</div>
			</div>
		{/if}
	{/if}

	<!-- Category -->
	{#if categoryOptions.length > 0}
		<div>
			<label for="category" class="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
				{$t('event.category')}
			</label>
			<Select
				id="category"
				options={categoryOptions}
				bind:value={category}
				placeholder={$t('category.selectCategory')}
			/>
		</div>
	{/if}

	<!-- Color override -->
	<div>
		<span class="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
			{$t('event.color')}
		</span>
		<ColorPicker bind:value={colorOverride} />
	</div>

	<!-- Recurrence -->
	<div>
		<label for="recurrence" class="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
			{$t('event.repeat')}
		</label>
		<RecurrencePicker id="recurrence" bind:value={recurrenceRule} {startDate} />
		{#if recurrenceRule}
			<div class="mt-3 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-900/40 p-3">
				<Toggle
					bind:checked={isPaused}
					label={$t('event.pause')}
					description={$t('event.pauseDescription')}
				/>
			</div>
		{/if}
	</div>

	<!-- Reminders -->
	<div>
		<div class="flex items-center justify-between mb-2">
			<span class="block text-sm font-medium text-neutral-700 dark:text-neutral-200">
				{$t('event.reminders')}
			</span>
			<Button variant="ghost" size="sm" onclick={addReminder}>
				{$t('event.addReminder')}
			</Button>
		</div>
		<div class="space-y-2">
			{#each reminders as reminder, index}
				<div class="flex items-center gap-2">
					<Select
						options={reminderOptions}
						value={reminder.minutes_before.toString()}
						onchange={(e) => setReminder(index, parseInt((e.target as HTMLSelectElement).value))}
						class="flex-1"
					/>
					<button
						type="button"
						onclick={() => removeReminder(index)}
						class="p-2 text-neutral-400 dark:text-neutral-500 hover:text-red-500 transition-colors"
						aria-label={$t('common.remove')}
					>
						<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
			{/each}
		</div>
	</div>

	<!-- Description -->
	<div>
		<label for="description" class="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
			{$t('event.description')}
		</label>
		<textarea
			id="description"
			bind:value={description}
			placeholder={$t('event.description')}
			rows="3"
			class="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
		></textarea>
	</div>

	<!-- Actions -->
	<div class="flex items-center justify-end gap-3 pt-4 border-t border-neutral-100 dark:border-neutral-700">
		{#if oncancel}
			<Button variant="ghost" onclick={oncancel} disabled={loading}>
				{$t('common.cancel')}
			</Button>
		{/if}
		<Button type="submit" {loading} disabled={!title.trim()}>
			{$t('event.save')}
		</Button>
	</div>
</form>
