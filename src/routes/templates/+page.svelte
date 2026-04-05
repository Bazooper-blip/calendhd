<script lang="ts">
	import { t } from 'svelte-i18n';
	import { templatesStore, categoriesStore } from '$stores';
	import { Button, Input, Modal, Select, Toggle, ColorPicker } from '$components/ui';
	import { toast } from '$components/ui/Toast.svelte';
	import { REMINDER_OPTIONS, formatDuration } from '$utils';
	import type { Template, ReminderConfig } from '$types';

	let showModal = $state(false);
	let editingTemplate = $state<Template | null>(null);
	let loading = $state(false);

	// Form state
	let name = $state('');
	let category = $state('');
	let defaultDurationMinutes = $state(60);
	let defaultIsAllDay = $state(false);
	let defaultReminders = $state<ReminderConfig[]>([{ minutes_before: 10, type: 'notification' }]);
	let description = $state('');
	let colorOverride = $state('');

	const categoryOptions = $derived([
		{ value: '', label: 'No category' },
		...categoriesStore.categories.map((c) => ({ value: c.id, label: c.name }))
	]);

	const durationOptions = [
		{ value: '15', label: '15 minutes' },
		{ value: '30', label: '30 minutes' },
		{ value: '45', label: '45 minutes' },
		{ value: '60', label: '1 hour' },
		{ value: '90', label: '1.5 hours' },
		{ value: '120', label: '2 hours' },
		{ value: '180', label: '3 hours' },
		{ value: '240', label: '4 hours' }
	];

	function openCreateModal() {
		editingTemplate = null;
		name = '';
		category = '';
		defaultDurationMinutes = 60;
		defaultIsAllDay = false;
		defaultReminders = [{ minutes_before: 10, type: 'notification' }];
		description = '';
		colorOverride = '';
		showModal = true;
	}

	function openEditModal(template: Template) {
		editingTemplate = template;
		name = template.name;
		category = template.category || '';
		defaultDurationMinutes = template.default_duration_minutes;
		defaultIsAllDay = template.default_is_all_day;
		defaultReminders = template.default_reminders;
		description = template.description || '';
		colorOverride = template.color_override || '';
		showModal = true;
	}

	function closeModal() {
		showModal = false;
		editingTemplate = null;
	}

	async function handleSubmit() {
		if (!name.trim()) return;

		loading = true;

		try {
			// Use $state.snapshot() to convert proxy to plain object for API
			const data = {
				name,
				category: category || undefined,
				default_duration_minutes: defaultDurationMinutes,
				default_is_all_day: defaultIsAllDay,
				default_reminders: $state.snapshot(defaultReminders),
				description: description || undefined,
				color_override: colorOverride || undefined
			};

			if (editingTemplate) {
				await templatesStore.update(editingTemplate.id, data);
				toast($t('template.updated') || $t('common.success'), 'success');
			} else {
				await templatesStore.create(data);
				toast($t('template.created') || $t('common.success'), 'success');
			}
			closeModal();
		} catch (error) {
			toast(error instanceof Error ? error.message : $t('errors.generic'), 'error');
		} finally {
			loading = false;
		}
	}

	async function handleDelete(template: Template) {
		if (!confirm($t('template.deleteConfirm') || `Delete "${template.name}"?`)) return;

		try {
			await templatesStore.delete(template.id);
			toast($t('template.deleted') || $t('common.success'), 'success');
		} catch (error) {
			toast(error instanceof Error ? error.message : $t('errors.generic'), 'error');
		}
	}
</script>

<div class="h-full overflow-y-auto">
	<div class="max-w-2xl mx-auto px-4 py-6">
		<div class="flex items-center justify-between mb-6">
			<h1 class="text-2xl font-bold text-neutral-800">{$t('template.title')}</h1>
			<Button onclick={openCreateModal}>
				<svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				{$t('template.create')}
			</Button>
		</div>

		{#if templatesStore.loading}
			<div class="flex items-center justify-center h-64">
				<div class="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin"></div>
			</div>
		{:else if templatesStore.templates.length === 0}
			<div class="bg-white rounded-xl shadow-sm border border-neutral-100 p-8 text-center">
				<div class="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
					<svg class="w-6 h-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
					</svg>
				</div>
				<h3 class="text-lg font-medium text-neutral-800 mb-1">{$t('template.noTemplates')}</h3>
				<p class="text-neutral-500 mb-4">{$t('template.noTemplatesDesc') || ''}</p>
				<Button onclick={openCreateModal}>{$t('template.create')}</Button>
			</div>
		{:else}
			<div class="space-y-2">
				{#each templatesStore.templates as template}
					{@const cat = template.category ? categoriesStore.getById(template.category) : null}
					<div class="bg-white rounded-xl shadow-sm border border-neutral-100 p-4 flex items-center gap-4">
						<div
							class="w-10 h-10 rounded-lg flex items-center justify-center"
							style="background-color: {template.color_override || cat?.color || '#7C9885'}"
						>
							<svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6z" />
							</svg>
						</div>

						<div class="flex-1">
							<h3 class="font-medium text-neutral-800">{template.name}</h3>
							<p class="text-sm text-neutral-500">
								{template.default_is_all_day ? $t('time.allDay') : formatDuration(template.default_duration_minutes)}
								{#if cat}
									· {cat.name}
								{/if}
							</p>
						</div>

						<div class="flex items-center gap-2">
							<button
								type="button"
								onclick={() => openEditModal(template)}
								class="p-2 text-neutral-400 hover:text-neutral-600 transition-colors"
								aria-label={$t('template.edit')}
							>
								<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
								</svg>
							</button>
							<button
								type="button"
								onclick={() => handleDelete(template)}
								class="p-2 text-neutral-400 hover:text-red-500 transition-colors"
								aria-label={$t('template.delete')}
							>
								<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
								</svg>
							</button>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<!-- Create/Edit Modal -->
<Modal bind:open={showModal} title={editingTemplate ? $t('template.edit') : $t('template.create')}>
	<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
		<div>
			<label for="name" class="block text-sm font-medium text-neutral-700 mb-1">
				{$t('template.name')}
			</label>
			<Input
				id="name"
				bind:value={name}
				placeholder={$t('template.name')}
				required
			/>
		</div>

		<div>
			<label for="category" class="block text-sm font-medium text-neutral-700 mb-1">
				{$t('event.category')}
			</label>
			<Select
				id="category"
				options={categoryOptions}
				bind:value={category}
			/>
		</div>

		<Toggle
			bind:checked={defaultIsAllDay}
			label={$t('event.allDay')}
		/>

		{#if !defaultIsAllDay}
			<div>
				<label for="duration" class="block text-sm font-medium text-neutral-700 mb-1">
					{$t('template.defaultDuration')}
				</label>
				<Select
					id="duration"
					options={durationOptions}
					value={defaultDurationMinutes.toString()}
					onchange={(e) => defaultDurationMinutes = parseInt((e.target as HTMLSelectElement).value)}
				/>
			</div>
		{/if}

		<div>
			<label class="block text-sm font-medium text-neutral-700 mb-2">
				{$t('event.color')} ({$t('common.optional')})
			</label>
			<ColorPicker bind:value={colorOverride} />
		</div>

		<div>
			<label for="description" class="block text-sm font-medium text-neutral-700 mb-1">
				{$t('event.description')} ({$t('common.optional')})
			</label>
			<textarea
				id="description"
				bind:value={description}
				placeholder={$t('event.description')}
				rows="2"
				class="w-full px-3 py-2 rounded-lg border border-neutral-200 bg-white text-neutral-800 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
			></textarea>
		</div>

	</form>

	{#snippet footer()}
		<Button variant="ghost" onclick={closeModal}>{$t('common.cancel')}</Button>
		<Button onclick={handleSubmit} {loading} disabled={!name.trim()}>
			{editingTemplate ? $t('common.save') : $t('common.create')}
		</Button>
	{/snippet}
</Modal>
