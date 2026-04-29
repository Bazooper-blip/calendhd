<script lang="ts">
	import { t } from 'svelte-i18n';
	import { categoriesStore } from '$stores';
	import { Button, Input, Modal, ColorPicker } from '$components/ui';
	import { toast } from 'svelte-sonner';
	import { cn } from '$utils';
	import type { Category } from '$types';

	let showModal = $state(false);
	let editingCategory = $state<Category | null>(null);
	let loading = $state(false);

	// Form state
	let name = $state('');
	let color = $state('#7C9885');
	let icon = $state('');
	let emojiSearch = $state('');

	// Emoji data with searchable names
	const emojiData: [string, string][] = [
		['🌅','sunrise'],['💊','pill medication'],['🍽️','dinner meal'],['🌙','moon night'],['🧹','broom cleaning'],['🚿','shower'],['💤','sleep'],['💼','briefcase work'],['💻','laptop computer'],['📞','phone call'],['📝','memo notes'],['🎯','target goal'],['📅','calendar date'],['🏥','hospital'],['🦷','tooth dentist'],['🧠','brain therapy'],['🏃','running exercise'],['🧘','yoga meditation'],['☕','coffee'],['🎂','birthday cake'],['🎉','party celebration'],['🎮','gaming'],['🎵','music'],['👥','group people'],['🚗','car driving'],['✈️','airplane travel flight'],['🛒','shopping cart'],['📦','package delivery'],['⚡','lightning energy'],['⭐','star favorite'],
		['🏠','house home'],['🛏️','bed bedroom'],['🪴','plant'],['🔑','key'],['🧺','laundry basket'],['🪥','toothbrush'],['🚰','water tap'],['🛁','bathtub'],['🧴','lotion'],['🪞','mirror'],['💡','lightbulb idea'],['🔒','lock'],['🏡','house garden'],
		['📧','email'],['📊','chart analytics'],['📋','clipboard'],['✅','check done'],['📌','pin'],['🗓️','calendar'],['📈','trending up'],['✏️','pencil edit'],['🖊️','pen'],['📎','paperclip'],['🗂️','folder files'],['📁','folder'],['🖥️','desktop monitor'],['⏰','alarm clock time'],['🔔','bell notification'],['📢','megaphone'],['🤝','handshake meeting'],['👔','tie business'],
		['🩺','stethoscope doctor'],['💉','syringe vaccine'],['❤️','heart love'],['🩹','bandage'],['🌡️','thermometer temperature'],['🧪','test tube lab'],['👁️','eye vision'],['😷','mask sick'],['🤒','fever ill'],['♿','wheelchair accessibility'],
		['🏋️','gym weights'],['🚴','cycling bike'],['🏊','swimming'],['⚽','soccer football'],['🎾','tennis'],['💪','muscle strength'],['🚶','walking'],['🤸','gymnastics'],['🏄','surfing'],['💧','water drop'],
		['🍵','tea'],['🥤','drink beverage'],['🍔','burger'],['🍕','pizza'],['🍜','noodles ramen'],['🍳','cooking egg'],['🥐','croissant breakfast'],['🍰','cake dessert'],['🥗','salad healthy'],['🍎','apple fruit'],['🍷','wine'],
		['🎁','gift present'],['🍽️','restaurant dining'],['💐','flowers bouquet'],['🥂','cheers toast'],['🎊','confetti'],['🎈','balloon'],['🥳','party face'],['💌','love letter'],
		['🚌','bus'],['🚆','train'],['🏨','hotel'],['🗺️','map'],['🚲','bicycle'],['⛽','gas fuel'],['🧳','luggage suitcase'],['🏖️','beach vacation'],['🌍','earth globe world'],
		['🌸','cherry blossom flower'],['🌳','tree'],['☀️','sun sunny'],['🌈','rainbow'],['❄️','snowflake cold winter'],['🔥','fire hot'],['🌊','wave ocean'],['⛰️','mountain'],['🌧️','rain'],['🌱','seedling grow'],['🍀','clover luck'],
		['📷','camera photo'],['🎧','headphones'],['🧩','puzzle'],['🔧','wrench tool'],['⚙️','gear settings'],['🏆','trophy winner'],['🚨','siren urgent alert'],['🔄','refresh sync'],['❌','cross cancel'],
		['📚','books study'],['🎓','graduation school'],['📖','book reading'],['🗣️','speaking language'],['🎒','backpack'],['🔬','microscope science'],
		['💰','money'],['💳','credit card payment'],['🏦','bank'],['🧾','receipt bill'],['💵','dollar cash'],
		['👶','baby'],['🏫','school building'],['🎨','art painting'],['🎭','theater drama'],['🧸','teddy bear toy'],['🧒','child kid'],['👦','boy'],['👧','girl'],['👨‍👩‍👧','family'],['🍼','baby bottle'],
		['🐕','dog'],['🐱','cat'],['🐾','paw pet'],['🐟','fish'],['🐴','horse'],['🐰','rabbit bunny'],['🐦','bird']
	];

	const emojiByCategory: { name: string; emojis: [string, string][] }[] = [
		{ name: 'Suggested', emojis: emojiData.slice(0, 30) },
		{ name: 'Routine & Home', emojis: emojiData.slice(30, 43) },
		{ name: 'Work', emojis: emojiData.slice(43, 61) },
		{ name: 'Health', emojis: emojiData.slice(61, 71) },
		{ name: 'Fitness', emojis: emojiData.slice(71, 81) },
		{ name: 'Food', emojis: emojiData.slice(81, 92) },
		{ name: 'Social', emojis: emojiData.slice(92, 100) },
		{ name: 'Travel', emojis: emojiData.slice(100, 109) },
		{ name: 'Nature', emojis: emojiData.slice(109, 120) },
		{ name: 'Objects', emojis: emojiData.slice(120, 129) },
		{ name: 'Education', emojis: emojiData.slice(129, 135) },
		{ name: 'Finance', emojis: emojiData.slice(135, 140) },
		{ name: 'Kids & Family', emojis: emojiData.slice(140, 150) },
		{ name: 'Pets', emojis: emojiData.slice(150) }
	];

	const filteredEmojiCategories = $derived(
		emojiSearch
			? (() => {
				const q = emojiSearch.toLowerCase();
				const matched = emojiData.filter(([, name]) => name.includes(q));
				return matched.length > 0 ? [{ name: 'Results', emojis: matched }] : [];
			})()
			: emojiByCategory
	);

	function openCreateModal() {
		editingCategory = null;
		name = '';
		color = categoriesStore.getNextColor();
		icon = '';
		emojiSearch = '';
		showModal = true;
	}

	function openEditModal(category: Category) {
		editingCategory = category;
		name = category.name;
		color = category.color;
		icon = category.icon || '';
		emojiSearch = '';
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
				toast.success($t('category.updated') || $t('common.success'));
			} else {
				await categoriesStore.create(data);
				toast.success($t('category.created') || $t('common.success'));
			}
			closeModal();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : $t('errors.generic'));
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
			toast.success($t('category.deleted') || $t('common.success'));
		} catch (error) {
			toast.error(error instanceof Error ? error.message : $t('errors.generic'));
		}
	}
</script>

<div class="h-full overflow-y-auto">
	<div class="max-w-2xl mx-auto px-4 py-6">
		<div class="flex items-center justify-between mb-6">
			<h1 class="text-2xl font-bold text-neutral-800 dark:text-neutral-100">{$t('category.title')}</h1>
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
			<div class="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700 p-8 text-center">
				<div class="w-12 h-12 bg-neutral-100 dark:bg-neutral-700 rounded-full flex items-center justify-center mx-auto mb-4">
					<svg class="w-6 h-6 text-neutral-400 dark:text-neutral-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
					</svg>
				</div>
				<h3 class="text-lg font-medium text-neutral-800 dark:text-neutral-100 mb-1">{$t('category.noCategories')}</h3>
				<p class="text-neutral-500 dark:text-neutral-400 mb-4">{$t('category.noCategoriesDesc') || ''}</p>
				<Button onclick={openCreateModal}>{$t('category.create')}</Button>
			</div>
		{:else}
			<div class="space-y-2">
				{#each categoriesStore.categories as category}
					<div class="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700 p-4 flex items-center gap-4">
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
							<h3 class="font-medium text-neutral-800 dark:text-neutral-100">{category.name}</h3>
						</div>

						<div class="flex items-center gap-2">
							<button
								type="button"
								onclick={() => openEditModal(category)}
								class="p-2 text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
								aria-label={$t('category.edit')}
							>
								<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
								</svg>
							</button>
							<button
								type="button"
								onclick={() => handleDelete(category)}
								class="p-2 text-neutral-400 dark:text-neutral-500 hover:text-red-500 transition-colors"
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
<Modal bind:open={showModal} title={editingCategory ? $t('category.edit') : $t('category.create')} size="md">
	<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
		<div>
			<label for="name" class="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
				{$t('category.name')}
			</label>
			<Input
				id="name"
				bind:value={name}
				placeholder={$t('category.name')}
				required
			/>
		</div>

		<div>
			<span class="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
				{$t('event.color')}
			</span>
			<ColorPicker bind:value={color} />
		</div>

		<div>
			<label class="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-2">
				{$t('category.icon') || 'Icon'}
				{#if icon}
					<button type="button" onclick={() => icon = ''} class="ml-2 text-xs text-neutral-400 dark:text-neutral-500 hover:text-neutral-600 dark:hover:text-neutral-300">({$t('event.removeIcon')})</button>
				{/if}
			</label>
			{#if icon}
				<div class="flex items-center gap-2 mb-2">
					<span class="text-2xl">{icon}</span>
				</div>
			{/if}
			<div class="max-h-60 overflow-y-auto border border-neutral-200 dark:border-neutral-600 rounded-lg p-2">
				<input
					type="text"
					bind:value={emojiSearch}
					placeholder={$t('common.search')}
					class="w-full px-3 py-1.5 mb-2 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
				/>
				{#each filteredEmojiCategories as category}
					<div class="mb-2">
						<h4 class="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-1 px-1">{category.name}</h4>
						<div class="grid grid-cols-8 gap-1">
							{#each category.emojis as [emoji, emojiName]}
								<button
									type="button"
									onclick={() => icon = emoji}
									title={emojiName}
									class={cn(
										'w-8 h-8 flex items-center justify-center text-lg hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors',
										icon === emoji ? 'bg-primary-100 ring-2 ring-primary-400' : ''
									)}
								>
									{emoji}
								</button>
							{/each}
						</div>
					</div>
				{/each}
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
