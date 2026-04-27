<script lang="ts">
	import { cn } from '$utils';
	import { t } from 'svelte-i18n';
	import type { Component } from 'svelte';

	interface Props {
		value?: string;
		onSelect?: (icon: string) => void;
		class?: string;
	}

	let { value = '', onSelect, class: className }: Props = $props();

	let isOpen = $state(false);
	let activeTab = $state<'emoji' | 'lucide'>('emoji');
	let searchQuery = $state('');

	// Loaded Lucide icon components: kebab-name -> Component
	let lucideComponents = $state<Record<string, Component<any>>>({});
	let lucideLoaded = $state(false);

	// Component for the trigger button display when value is lucide:*
	let triggerLucideComponent = $state<Component<any> | null>(null);

	// Same emoji categories as EmojiPicker
	const emojiCategories = [
		{
			name: 'Suggested',
			emojis: ['🌅', '💊', '🍽️', '🌙', '🧹', '🚿', '💤', '💼', '💻', '📞', '📝', '🎯', '📅', '🏥', '🦷', '🧠', '🏃', '🧘', '☕', '🎂', '🎉', '🎮', '🎵', '👥', '🚗', '✈️', '🛒', '📦', '⚡', '⭐']
		},
		{
			name: 'Routine & Home',
			emojis: ['🏠', '🧹', '🚿', '💤', '🛏️', '🪴', '🔑', '🧺', '🪥', '🚰', '🛁', '🧴', '🪞', '💡', '🔒', '🏡', '🧸', '🕯️', '🧊', '📱']
		},
		{
			name: 'Work & Productivity',
			emojis: ['💼', '💻', '📞', '📧', '📝', '📅', '📊', '📋', '✅', '🎯', '📌', '🗓️', '📈', '✏️', '🖊️', '📎', '🗂️', '📁', '🖥️', '⏰', '🔔', '📢', '🤝', '👔']
		},
		{
			name: 'Health & Medical',
			emojis: ['🏥', '🦷', '🩺', '💊', '💉', '🧠', '❤️', '🩹', '🌡️', '🧪', '👁️', '🩻', '🏨', '🩸', '😷', '🤒', '🧬', '♿', '🩼', '🫀']
		},
		{
			name: 'Fitness & Wellness',
			emojis: ['🏃', '🧘', '🏋️', '🚴', '🏊', '⚽', '🎾', '🧘‍♀️', '💪', '🚶', '🤸', '🏄', '🧗', '🏌️', '⛷️', '🏓', '🥊', '🏸', '💧', '🧖']
		},
		{
			name: 'Food & Drink',
			emojis: ['☕', '🍵', '🥤', '🍔', '🍕', '🍜', '🍱', '🥡', '🍳', '🥐', '🍰', '🍪', '🥛', '🍺', '🍷', '🧁', '🥗', '🍎', '🍝', '🥘', '🍣', '🌮', '🥪', '🧇']
		},
		{
			name: 'Social & Celebrations',
			emojis: ['🎂', '🎉', '🎁', '👥', '🤝', '☕', '🍽️', '💐', '🥂', '🎊', '💒', '🎈', '🥳', '🎀', '💌', '🫂', '🤗', '🙋', '👋', '🎆']
		},
		{
			name: 'Travel & Transport',
			emojis: ['✈️', '🚗', '🚌', '🚆', '🏨', '🗺️', '🚕', '📦', '🚲', '🛵', '🚢', '🚁', '🛫', '🛬', '⛽', '🅿️', '🚏', '🧳', '🏖️', '🗼', '🎡', '🏕️', '🌍', '🧭']
		},
		{
			name: 'Education',
			emojis: ['📚', '🎓', '✏️', '📖', '🧪', '🗣️', '🎒', '💡', '📐', '🔬', '🧮', '📓', '🖍️', '🎨', '🌐', '📝']
		},
		{
			name: 'Nature & Weather',
			emojis: ['🌸', '🌺', '🌻', '🌳', '🌴', '🌊', '⛰️', '🌙', '☀️', '🌈', '❄️', '🔥', '💨', '🌍', '🌵', '🍀', '🌧️', '⛈️', '🌤️', '🌪️', '🌱', '🍂', '🦋', '🌾']
		},
		{
			name: 'Finance',
			emojis: ['💰', '💳', '🏦', '📊', '🧾', '💵', '💲', '📉', '📈', '🪙', '💎', '🏧', '🤑', '💸', '📒', '🧮']
		},
		{
			name: 'Kids & Family',
			emojis: ['👶', '🏫', '🎨', '⚽', '🎵', '🎭', '🧸', '🎠', '🎪', '🧒', '👦', '👧', '👨‍👩‍👧', '🍼', '🎮', '📚']
		},
		{
			name: 'Pets',
			emojis: ['🐕', '🐱', '🐾', '🐟', '🐴', '🐰', '🐦', '🐢', '🦜', '🐹', '🐍', '🦎']
		},
		{
			name: 'Objects & Symbols',
			emojis: ['🔑', '🔒', '💎', '🎀', '📷', '🎧', '🧩', '🔧', '🔨', '🔋', '🎥', '🕹️', '📻', '⚙️', '🧲', '🔭', '📡', '🪄', '🎲', '🏆', '🚨', '🔄', '❌', '🚫']
		},
		{
			name: 'Flags',
			emojis: ['🏁', '🚩', '🏳️', '🇺🇸', '🇬🇧', '🇸🇪', '🇩🇪', '🇫🇷', '🇪🇸', '🇮🇹', '🇯🇵', '🇰🇷', '🇨🇳', '🇧🇷', '🇨🇦', '🇦🇺', '🇮🇳', '🇲🇽', '🇳🇴', '🇫🇮']
		},
		{
			name: 'Smileys & Expressions',
			emojis: ['😊', '😴', '🤔', '😤', '🥳', '🤒', '😎', '😅', '🥰', '😢', '😡', '🤯', '😱', '🫠', '😌', '🙄', '😬', '🤓', '😇', '🥱', '😶', '🫡', '😮', '🤩']
		}
	];

	// Curated Lucide icons by category
	// Note: 'home' renamed to 'house', 'bar-chart-3' to 'chart-bar' in lucide v0.4+
	const lucideCategories = [
		{
			name: 'Suggested',
			icons: ['calendar', 'clock', 'bell', 'heart', 'pill', 'brain', 'target', 'zap', 'briefcase', 'house', 'check', 'star', 'coffee', 'car', 'plane', 'book-open', 'dumbbell', 'users', 'shopping-cart', 'mail']
		},
		{
			name: 'Common',
			icons: ['calendar', 'clock', 'bell', 'check', 'star', 'heart', 'house', 'briefcase', 'mail', 'phone', 'map-pin', 'bookmark', 'flag', 'target', 'zap', 'award']
		},
		{
			name: 'Activities',
			icons: ['bike', 'dumbbell', 'music', 'gamepad-2', 'film', 'book-open', 'plane', 'car', 'shopping-cart', 'utensils', 'coffee', 'wine', 'palette', 'camera', 'headphones', 'ticket', 'theater', 'clapperboard', 'dice-5', 'tent']
		},
		{
			name: 'Health',
			icons: ['pill', 'stethoscope', 'brain', 'heart-pulse', 'apple', 'droplets', 'moon', 'sun', 'thermometer', 'eye', 'shield', 'activity', 'salad', 'bed', 'bath', 'leaf', 'syringe', 'bandage', 'scan', 'accessibility']
		},
		{
			name: 'Work',
			icons: ['laptop', 'monitor', 'code', 'presentation', 'chart-bar', 'wallet', 'file-text', 'clipboard', 'pen-tool', 'paperclip', 'folder', 'credit-card', 'graduation-cap', 'users', 'handshake', 'megaphone', 'calculator', 'archive', 'inbox', 'printer']
		},
		{
			name: 'People',
			icons: ['user', 'users', 'baby', 'dog', 'cat', 'cake', 'party-popper', 'gift', 'smile', 'laugh', 'hand-heart', 'crown', 'person-standing', 'glasses', 'shirt', 'flower-2', 'heart-handshake', 'message-circle', 'phone-call', 'video']
		},
		{
			name: 'Travel',
			icons: ['map', 'compass', 'navigation', 'train-front', 'bus', 'ship', 'rocket', 'globe', 'mountain', 'tent', 'trees', 'umbrella', 'luggage', 'fuel', 'anchor', 'sunrise', 'car-taxi-front', 'parking-meter', 'signpost', 'highway']
		},
		{
			name: 'Weather',
			icons: ['cloud', 'cloud-rain', 'cloud-snow', 'sun', 'moon', 'snowflake', 'wind', 'rainbow', 'thermometer-sun', 'cloud-lightning', 'cloud-drizzle', 'cloud-fog', 'haze', 'cloudy', 'sun-moon', 'waves']
		},
		{
			name: 'Home & Routine',
			icons: ['bed', 'bath', 'lamp', 'sofa', 'alarm-clock', 'key', 'lock', 'door-open', 'washing-machine', 'microwave', 'refrigerator', 'cooking-pot', 'shirt', 'spray-can', 'trash-2', 'recycle']
		},
		{
			name: 'Education',
			icons: ['book-open', 'notebook-pen', 'pencil', 'ruler', 'school', 'library', 'languages', 'microscope', 'atom', 'flask-conical', 'calculator', 'backpack', 'pen', 'highlighter', 'notebook', 'square-pen']
		},
		{
			name: 'Finance',
			icons: ['wallet', 'receipt', 'piggy-bank', 'banknote', 'coins', 'credit-card', 'landmark', 'trending-up', 'trending-down', 'circle-dollar-sign', 'hand-coins', 'chart-line']
		}
	];

	const allEmojis = $derived(emojiCategories.flatMap((cat) => cat.emojis));

	const allLucideIcons = $derived(lucideCategories.flatMap((cat) => cat.icons));

	const filteredEmojis = $derived(
		searchQuery ? allEmojis.filter((emoji) => emoji.includes(searchQuery)) : null
	);

	const filteredLucideIcons = $derived(
		searchQuery
			? allLucideIcons.filter((name) => name.toLowerCase().includes(searchQuery.toLowerCase()))
			: null
	);

	function kebabToPascal(name: string): string {
		return name
			.split('-')
			.map((part) => {
				if (/^\d+$/.test(part)) return part;
				return part.charAt(0).toUpperCase() + part.slice(1);
			})
			.join('');
	}

	// Load all Lucide icons when the Lucide tab is activated
	$effect(() => {
		if (activeTab !== 'lucide' || lucideLoaded) return;

		import('lucide-svelte').then((mod: Record<string, any>) => {
			const loaded: Record<string, Component<any>> = {};
			for (const iconName of allLucideIcons) {
				const pascalName = kebabToPascal(iconName);
				if (mod[pascalName]) {
					loaded[iconName] = mod[pascalName];
				}
			}
			lucideComponents = loaded;
			lucideLoaded = true;
		}).catch(() => {
			// Silently fail
		});
	});

	// Load trigger Lucide component when value is lucide:*
	$effect(() => {
		const isLucideVal = value?.startsWith('lucide:') ?? false;
		if (!isLucideVal) {
			triggerLucideComponent = null;
			return;
		}

		const name = value!.slice(7);
		const pascalName = kebabToPascal(name);

		import('lucide-svelte').then((mod: Record<string, any>) => {
			if (value === `lucide:${name}`) {
				triggerLucideComponent = mod[pascalName] ?? null;
			}
		}).catch(() => {
			triggerLucideComponent = null;
		});
	});

	const isLucideValue = $derived(value?.startsWith('lucide:') ?? false);
	const isEmojiValue = $derived(!!value && !isLucideValue);

	function selectEmoji(emoji: string) {
		onSelect?.(emoji);
		isOpen = false;
		searchQuery = '';
	}

	function selectLucideIcon(name: string) {
		onSelect?.(`lucide:${name}`);
		isOpen = false;
		searchQuery = '';
	}

	function clearIcon() {
		onSelect?.('');
		isOpen = false;
		searchQuery = '';
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.icon-picker-container')) {
			isOpen = false;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class={cn('icon-picker-container relative', className)}>
	<!-- Trigger button -->
	<button
		type="button"
		onclick={() => (isOpen = !isOpen)}
		class="w-12 h-12 rounded-lg border-2 border-dashed border-neutral-300 hover:border-primary-400 flex items-center justify-center text-2xl transition-colors bg-white dark:bg-neutral-800"
	>
		{#if isEmojiValue}
			{value}
		{:else if isLucideValue && triggerLucideComponent}
			{@const TriggerIcon = triggerLucideComponent}
			<TriggerIcon class="w-5 h-5 text-neutral-600 dark:text-neutral-300" />
		{:else}
			<svg class="w-5 h-5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
		{/if}
	</button>

	<!-- Dropdown -->
	{#if isOpen}
		<div class="absolute z-50 mt-2 w-full sm:w-96 bg-white dark:bg-neutral-800 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
			<!-- Tabs -->
			<div class="flex border-b border-neutral-200 dark:border-neutral-700">
				<button
					type="button"
					onclick={() => { activeTab = 'emoji'; searchQuery = ''; }}
					class={cn(
						'flex-1 px-4 py-2 text-sm font-medium transition-colors',
						activeTab === 'emoji'
							? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-500'
							: 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
					)}
				>
					{$t('event.iconEmoji')}
				</button>
				<button
					type="button"
					onclick={() => { activeTab = 'lucide'; searchQuery = ''; }}
					class={cn(
						'flex-1 px-4 py-2 text-sm font-medium transition-colors',
						activeTab === 'lucide'
							? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-500'
							: 'text-neutral-500 dark:text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-300'
					)}
				>
					{$t('event.iconIcons')}
				</button>
			</div>

			<!-- Search -->
			<div class="p-2 border-b border-neutral-100 dark:border-neutral-700">
				<input
					type="text"
					bind:value={searchQuery}
					placeholder={$t('common.search')}
					class="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
				/>
			</div>

			<!-- Content -->
			<div class="max-h-80 overflow-y-auto p-2">
				{#if activeTab === 'emoji'}
					<!-- Emoji tab -->
					{#if filteredEmojis}
						<div class="grid grid-cols-6 sm:grid-cols-8 gap-1">
							{#each filteredEmojis as emoji}
								<button
									type="button"
									onclick={() => selectEmoji(emoji)}
									class="w-10 h-10 flex items-center justify-center text-xl hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors"
								>
									{emoji}
								</button>
							{/each}
						</div>
						{#if filteredEmojis.length === 0}
							<p class="text-center text-neutral-500 py-4 text-sm">{$t('iconPicker.noEmojisFound')}</p>
						{/if}
					{:else}
						{#each emojiCategories as category}
							<div class="mb-3">
								<h4 class="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-1 px-1">{category.name}</h4>
								<div class="grid grid-cols-6 sm:grid-cols-8 gap-1">
									{#each category.emojis as emoji}
										<button
											type="button"
											onclick={() => selectEmoji(emoji)}
											class="w-10 h-10 flex items-center justify-center text-xl hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors"
										>
											{emoji}
										</button>
									{/each}
								</div>
							</div>
						{/each}
					{/if}
				{:else}
					<!-- Lucide icons tab -->
					{#if !lucideLoaded}
						<p class="text-center text-neutral-500 py-4 text-sm">{$t('iconPicker.loadingIcons')}</p>
					{:else if filteredLucideIcons}
						<div class="grid grid-cols-6 sm:grid-cols-8 gap-1">
							{#each filteredLucideIcons as iconName}
								{#if lucideComponents[iconName]}
									{@const IconComp = lucideComponents[iconName]}
									<button
										type="button"
										onclick={() => selectLucideIcon(iconName)}
										title={iconName}
										class="w-10 h-10 flex items-center justify-center text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors"
									>
										<IconComp class="w-4 h-4" />
									</button>
								{/if}
							{/each}
						</div>
						{#if filteredLucideIcons.length === 0}
							<p class="text-center text-neutral-500 py-4 text-sm">{$t('iconPicker.noIconsFound')}</p>
						{/if}
					{:else}
						{#each lucideCategories as category}
							<div class="mb-3">
								<h4 class="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-1 px-1">{category.name}</h4>
								<div class="grid grid-cols-6 sm:grid-cols-8 gap-1">
									{#each category.icons as iconName}
										{#if lucideComponents[iconName]}
											{@const IconComp = lucideComponents[iconName]}
											<button
												type="button"
												onclick={() => selectLucideIcon(iconName)}
												title={iconName}
												class="w-10 h-10 flex items-center justify-center text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors"
											>
												<IconComp class="w-4 h-4" />
											</button>
										{/if}
									{/each}
								</div>
							</div>
						{/each}
					{/if}
				{/if}
			</div>

			<!-- Clear button -->
			{#if value}
				<div class="p-2 border-t border-neutral-100 dark:border-neutral-700">
					<button
						type="button"
						onclick={clearIcon}
						class="w-full px-3 py-2 text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
					>
						{$t('event.removeIcon')}
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>
