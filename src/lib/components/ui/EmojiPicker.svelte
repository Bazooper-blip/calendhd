<script lang="ts">
	import { cn } from '$utils';

	interface Props {
		value?: string;
		onSelect?: (emoji: string) => void;
		class?: string;
	}

	let { value = '', onSelect, class: className }: Props = $props();

	let isOpen = $state(false);
	let searchQuery = $state('');

	// Common emoji categories for calendar/productivity use
	const emojiCategories = [
		{
			name: 'Common',
			emojis: ['📅', '📆', '🗓️', '⏰', '🔔', '✅', '❌', '⭐', '💡', '📝', '📌', '🎯', '🏠', '💼', '📧', '📞']
		},
		{
			name: 'Activities',
			emojis: ['🏃', '🚶', '🧘', '💪', '🏋️', '🚴', '🏊', '⚽', '🎾', '🎮', '🎬', '🎵', '📚', '✈️', '🚗', '🛒']
		},
		{
			name: 'Health',
			emojis: ['💊', '🏥', '🩺', '🧠', '❤️', '😴', '🥗', '🍎', '💧', '🧘‍♀️', '🦷', '👁️', '💉', '🩹', '🧪', '🌡️']
		},
		{
			name: 'Work',
			emojis: ['💻', '📊', '📈', '💰', '🏦', '📁', '📋', '✏️', '🖊️', '📎', '🗂️', '💳', '🎓', '👔', '🤝', '📢']
		},
		{
			name: 'People',
			emojis: ['👨‍👩‍👧', '👶', '🧒', '👦', '👧', '🧑', '👨', '👩', '🧓', '👴', '👵', '🐕', '🐈', '🎂', '🎉', '🎁']
		},
		{
			name: 'Food',
			emojis: ['☕', '🍵', '🥤', '🍔', '🍕', '🍜', '🍱', '🥡', '🍳', '🥐', '🍰', '🍪', '🥛', '🍺', '🍷', '🧁']
		},
		{
			name: 'Nature',
			emojis: ['🌸', '🌺', '🌻', '🌳', '🌴', '🌊', '⛰️', '🌙', '☀️', '🌈', '❄️', '🔥', '💨', '🌍', '🌵', '🍀']
		},
		{
			name: 'Objects',
			emojis: ['🔑', '🔒', '💎', '🎀', '🧸', '🎈', '🎨', '🔧', '🔨', '💡', '🔋', '📷', '🎥', '🎧', '🕹️', '🧩']
		}
	];

	const allEmojis = $derived(
		emojiCategories.flatMap(cat => cat.emojis)
	);

	const filteredEmojis = $derived(
		searchQuery
			? allEmojis.filter(emoji => emoji.includes(searchQuery))
			: null
	);

	function selectEmoji(emoji: string) {
		onSelect?.(emoji);
		isOpen = false;
		searchQuery = '';
	}

	function clearEmoji() {
		onSelect?.('');
		isOpen = false;
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.emoji-picker-container')) {
			isOpen = false;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class={cn('emoji-picker-container relative', className)}>
	<!-- Trigger button -->
	<button
		type="button"
		onclick={() => isOpen = !isOpen}
		class="w-12 h-12 rounded-lg border-2 border-dashed border-neutral-300 hover:border-primary-400 flex items-center justify-center text-2xl transition-colors bg-white dark:bg-neutral-800"
	>
		{#if value}
			{value}
		{:else}
			<svg class="w-5 h-5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
		{/if}
	</button>

	<!-- Dropdown -->
	{#if isOpen}
		<div class="absolute z-50 mt-2 w-72 bg-white dark:bg-neutral-800 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
			<!-- Search -->
			<div class="p-2 border-b border-neutral-100 dark:border-neutral-700">
				<input
					type="text"
					bind:value={searchQuery}
					placeholder="Search emoji..."
					class="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
				/>
			</div>

			<!-- Emoji grid -->
			<div class="max-h-64 overflow-y-auto p-2">
				{#if filteredEmojis}
					<!-- Search results -->
					<div class="grid grid-cols-8 gap-1">
						{#each filteredEmojis as emoji}
							<button
								type="button"
								onclick={() => selectEmoji(emoji)}
								class="w-8 h-8 flex items-center justify-center text-xl hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors"
							>
								{emoji}
							</button>
						{/each}
					</div>
					{#if filteredEmojis.length === 0}
						<p class="text-center text-neutral-500 py-4 text-sm">No emojis found</p>
					{/if}
				{:else}
					<!-- Categories -->
					{#each emojiCategories as category}
						<div class="mb-3">
							<h4 class="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-1 px-1">{category.name}</h4>
							<div class="grid grid-cols-8 gap-1">
								{#each category.emojis as emoji}
									<button
										type="button"
										onclick={() => selectEmoji(emoji)}
										class="w-8 h-8 flex items-center justify-center text-xl hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors"
									>
										{emoji}
									</button>
								{/each}
							</div>
						</div>
					{/each}
				{/if}
			</div>

			<!-- Clear button -->
			{#if value}
				<div class="p-2 border-t border-neutral-100 dark:border-neutral-700">
					<button
						type="button"
						onclick={clearEmoji}
						class="w-full px-3 py-2 text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
					>
						Remove emoji
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>
