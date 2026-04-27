<script lang="ts">
	import { t } from 'svelte-i18n';
	import { format } from 'date-fns';
	import { Button, Input, Select, Toggle, ColorPicker, IconPicker } from '$components/ui';
	import { categoriesStore, templatesStore, settingsStore } from '$stores';
	import { REMINDER_OPTIONS, RECURRENCE_PRESETS, formatRecurrenceRule } from '$utils';
	import type { EventFormData, ReminderConfig, RecurrenceRule } from '$types';

	interface Props {
		initialData?: Partial<EventFormData>;
		onsubmit: (data: EventFormData) => void;
		oncancel?: () => void;
		loading?: boolean;
	}

	let { initialData = {}, onsubmit, oncancel, loading = false }: Props = $props();

	// Form state
	let title = $state(initialData.title || '');
	let description = $state(initialData.description || '');
	let startDate = $state(initialData.start_date || format(new Date(), 'yyyy-MM-dd'));
	let startTime = $state(initialData.start_time || '09:00');
	let endDate = $state(initialData.end_date || '');
	let endTime = $state(initialData.end_time || '');
	let isAllDay = $state(initialData.is_all_day || false);
	let isTask = $state(initialData.is_task || false);
	let category = $state(initialData.category || '');
	let colorOverride = $state(initialData.color_override || '');
	let icon = $state(initialData.icon || '');
	let reminders = $state<ReminderConfig[]>(
		initialData.reminders || settingsStore.defaultReminders
	);
	let recurrenceRule = $state<RecurrenceRule | undefined>(initialData.recurrence_rule);

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

	const recurrenceOptions = $derived(RECURRENCE_PRESETS.map((r, i) => ({
		value: i.toString(),
		label: $t(r.i18nKey)
	})));

	// Apply template
	function applyTemplate(templateId: string) {
		const template = templatesStore.getById(templateId);
		if (!template) return;

		if (template.category) category = template.category;
		if (template.color_override) colorOverride = template.color_override;
		if (template.icon) icon = template.icon;
		if (template.default_reminders) reminders = template.default_reminders;
		isAllDay = template.default_is_all_day;

		if (!isAllDay && template.default_duration_minutes && startTime) {
			const [hours, minutes] = startTime.split(':').map(Number);
			const endMinutes = hours * 60 + minutes + template.default_duration_minutes;
			const endHours = Math.floor(endMinutes / 60) % 24;
			const endMins = endMinutes % 60;
			endTime = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
			endDate = startDate;
		}
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

	// Handle recurrence change
	function setRecurrence(presetIndex: number) {
		recurrenceRule = RECURRENCE_PRESETS[presetIndex].value || undefined;
	}

	// Submit handler
	function handleSubmit(e: Event) {
		e.preventDefault();

		// Use $state.snapshot() to convert proxies to plain objects
		const data: EventFormData = {
			title,
			description: description || undefined,
			start_date: startDate,
			start_time: isAllDay ? undefined : startTime,
			end_date: endDate || undefined,
			end_time: isAllDay ? undefined : endTime || undefined,
			is_all_day: isAllDay,
			is_task: isTask,
			category: category || undefined,
			color_override: colorOverride || undefined,
			icon: icon || undefined,
			reminders: $state.snapshot(reminders),
			recurrence_rule: recurrenceRule ? $state.snapshot(recurrenceRule) : undefined
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
				/>
			</div>
		{/if}
	</div>

	{#if !isAllDay}
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
		<span class="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
			{$t('event.repeat')}
		</span>
		<Select
			options={recurrenceOptions}
			value={RECURRENCE_PRESETS.findIndex(
				(r) => JSON.stringify(r.value) === JSON.stringify(recurrenceRule || null)
			).toString()}
			onchange={(e) => setRecurrence(parseInt((e.target as HTMLSelectElement).value))}
		/>
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
