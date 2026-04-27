<script lang="ts">
	import { page } from '$app/stores';
	import { categoriesStore } from '$stores';
	import { cn } from '$utils';
	import { _ } from '$lib/i18n';

	interface Props {
		open?: boolean;
		onClose?: () => void;
	}

	let { open = false, onClose }: Props = $props();

	const navItems = $derived([
		{ href: '/now', label: $_('nav.now'), icon: 'now' },
		{ href: '/calendar/day', label: $_('nav.day'), icon: 'calendar-day' },
		{ href: '/calendar/week', label: $_('nav.week'), icon: 'calendar-week' },
		{ href: '/calendar/month', label: $_('nav.month'), icon: 'calendar-month' },
		{ href: '/routines', label: $_('nav.routines'), icon: 'routine' },
		{ href: '/brain-dump', label: $_('nav.brainDump'), icon: 'brain' },
		{ href: '/templates', label: $_('nav.templates'), icon: 'template' },
		{ href: '/categories', label: $_('nav.categories'), icon: 'tag' },
		{ href: '/subscriptions', label: $_('nav.subscriptions'), icon: 'rss' },
		{ href: '/settings', label: $_('nav.settings'), icon: 'cog' }
	]);

	const icons: Record<string, string> = {
		now: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />`,
		brain: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />`,
		'calendar-day': `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />`,
		'calendar-week': `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />`,
		'calendar-month': `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2zm4-10h6" />`,
		routine: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />`,
		template: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />`,
		tag: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />`,
		rss: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 5c7.18 0 13 5.82 13 13M6 11a7 7 0 017 7m-6 0a1 1 0 11-2 0 1 1 0 012 0z" />`,
		cog: `<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />`
	};

	function isActive(href: string): boolean {
		return $page.url.pathname.startsWith(href);
	}
</script>

<!-- Mobile backdrop -->
{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 bg-black/30 z-40 lg:hidden"
		onclick={onClose}
	></div>
{/if}

<!-- Sidebar -->
<aside
	class={cn(
		'fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white dark:bg-neutral-800 border-r border-neutral-100 dark:border-neutral-700 transform transition-transform lg:transform-none',
		open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
	)}
>
	<div class="flex flex-col h-full">
		<!-- Logo -->
		<div class="flex items-center gap-2 px-4 py-4 border-b border-neutral-100 dark:border-neutral-700 pt-[calc(1rem+env(safe-area-inset-top))]">
			<div class="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
				<svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
				</svg>
			</div>
			<span class="text-lg font-semibold text-neutral-800 dark:text-neutral-100">{$_('app.name')}</span>

			<!-- Close button (mobile) -->
			<button
				type="button"
				onclick={onClose}
				class="lg:hidden ml-auto p-2 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700"
				aria-label={$_('common.close')}
			>
				<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
				</svg>
			</button>
		</div>

		<!-- Navigation -->
		<nav class="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
			{#each navItems as item}
				<a
					href={item.href}
					onclick={onClose}
					class={cn(
						'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
						isActive(item.href)
							? 'bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-300'
							: 'text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-neutral-700 hover:text-neutral-800 dark:hover:text-neutral-200'
					)}
				>
					<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						{@html icons[item.icon]}
					</svg>
					{item.label}
				</a>
			{/each}

			<!-- Categories section -->
			{#if categoriesStore.categories.length > 0}
				<div class="pt-4 mt-4 border-t border-neutral-100 dark:border-neutral-700">
					<h3 class="px-3 text-xs font-semibold text-neutral-400 dark:text-neutral-500 uppercase tracking-wider">
						{$_('nav.categories')}
					</h3>
					<div class="mt-2 space-y-1">
						{#each categoriesStore.categories as category}
							<div class="flex items-center gap-3 px-3 py-2">
								{#if category.icon}
									<span class="text-base">{category.icon}</span>
								{:else}
									<span
										class="w-3 h-3 rounded-full"
										style="background-color: {category.color}"
									></span>
								{/if}
								<span class="text-sm text-neutral-600 dark:text-neutral-400">{category.name}</span>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</nav>

		</div>
</aside>
