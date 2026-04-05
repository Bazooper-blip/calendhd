<script lang="ts">
	import { t } from 'svelte-i18n';
	import { categoriesStore } from '$stores';
	import { Button, Input, Modal, ColorPicker, EmojiPicker } from '$components/ui';
	import { toast } from '$components/ui/Toast.svelte';
	import { cn } from '$utils';
	import type { Category } from '$types';

	let showModal = $state(false);
	let editingCategory = $state<Category | null>(null);
	let loading = $state(false);

	// Form state
	let name = $state('');
	let color = $state('#7C9885');
	let icon = $state('');

	function openCreateModal() {
		editingCategory = null;
		name = '';
		color = categoriesStore.getNextColor();
		icon = '';
		showModal = true;
	}

	function openEditModal(category: Category) {
		editingCategory = category;
		name = category.name;
		color = category.color;
		icon = category.icon || '';
		showModal = true;
	}

	function closeModal() {
		showModal = false;
		editingCategory = null;
	}

	async function handleSubmit() {
		if (!name.trim()) return;

		loading = true;

		try {
			const data = {
				name,
				color,
				icon: icon || undefined
			};

			if (editingCategory) {
				await categoriesStore.update(editingCategory.id, data);
				toast($t('category.updated') || $t('common.success'), 'success');
			} else {
				await categoriesStore.create(data);
				toast($t('category.created') || $t('common.success'), 'success');
			}
			closeModal();
		} catch (error) {
			toast(error instanceof Error ? error.message : $t('errors.generic'), 'error');
		} finally {
			loading = false;
		}
	}

	async function handleDelete(category: Category) {
		if (!confirm($t('category.deleteConfirm') || `Delete "${category.name}"?`)) {
			return;
		}

		try {
			await categoriesStore.delete(category.id);
			toast($t('category.deleted') || $t('common.success'), 'success');
		} catch (error) {
			toast(error instanceof Error ? error.message : $t('errors.generic'), 'error');
		}
	}
</script>

<div class="h-full overflow-y-auto">
	<div class="max-w-2xl mx-auto px-4 py-6">
		<div class="flex items-center justify-between mb-6">
			<h1 class="text-2xl font-bold text-neutral-800">{$t('category.title')}</h1>
			<Button onclick={openCreateModal}>
				<svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
				</svg>
				{$t('category.create')}
			</Button>
		</div>

		{#if categoriesStore.loading}
			<div class="flex items-center justify-center h-64">
				<div class="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin"></div>
			</div>
		{:else if categoriesStore.categories.length === 0}
			<div class="bg-white rounded-xl shadow-sm border border-neutral-100 p-8 text-center">
				<div class="w-12 h-12 bg-neutral-100 rounded-full flex items-center justify-center mx-auto mb-4">
					<svg class="w-6 h-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
					</svg>
				</div>
				<h3 class="text-lg font-medium text-neutral-800 mb-1">{$t('category.noCategories')}</h3>
				<p class="text-neutral-500 mb-4">{$t('category.noCategoriesDesc') || ''}</p>
				<Button onclick={openCreateModal}>{$t('category.create')}</Button>
			</div>
		{:else}
			<div class="space-y-2">
				{#each categoriesStore.categories as category}
					<div class="bg-white rounded-xl shadow-sm border border-neutral-100 p-4 flex items-center gap-4">
						<div
							class="w-10 h-10 rounded-lg flex items-center justify-center text-xl"
							style="background-color: {category.color}"
						>
							{#if category.icon}
								{category.icon}
							{:else}
								<svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
								</svg>
							{/if}
						</div>

						<div class="flex-1">
							<h3 class="font-medium text-neutral-800">{category.name}</h3>
						</div>

						<div class="flex items-center gap-2">
							<button
								type="button"
								onclick={() => openEditModal(category)}
								class="p-2 text-neutral-400 hover:text-neutral-600 transition-colors"
								aria-label={$t('category.edit')}
							>
								<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
								</svg>
							</button>
							<button
								type="button"
								onclick={() => handleDelete(category)}
								class="p-2 text-neutral-400 hover:text-red-500 transition-colors"
								aria-label={$t('category.delete')}
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
<Modal bind:open={showModal} title={editingCategory ? $t('category.edit') : $t('category.create')} size="sm">
	<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
		<div>
			<label for="name" class="block text-sm font-medium text-neutral-700 mb-1">
				{$t('category.name')}
			</label>
			<Input
				id="name"
				bind:value={name}
				placeholder={$t('category.name')}
				required
			/>
		</div>

		<div class="flex gap-4">
			<div class="flex-1">
				<label class="block text-sm font-medium text-neutral-700 mb-2">
					{$t('event.color')}
				</label>
				<ColorPicker bind:value={color} />
			</div>
			<div>
				<label class="block text-sm font-medium text-neutral-700 mb-2">
					{$t('category.icon') || 'Icon'}
				</label>
				<EmojiPicker value={icon} onSelect={(emoji) => icon = emoji} />
			</div>
		</div>

	</form>

	{#snippet footer()}
		<Button variant="ghost" onclick={closeModal}>{$t('common.cancel')}</Button>
		<Button onclick={handleSubmit} {loading} disabled={!name.trim()}>
			{editingCategory ? $t('common.save') : $t('common.create')}
		</Button>
	{/snippet}
</Modal>
