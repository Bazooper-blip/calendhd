<script lang="ts">
	import '../app.css';
	import { browser } from '$app/environment';
	import { auth, settingsStore, categoriesStore, templatesStore, calendar } from '$stores';
	import { Sidebar, Header } from '$components/layout';
	import { OfflineIndicator } from '$components/ui';
	import { Toaster } from 'svelte-sonner';
	import { QuickAdd } from '$components/event';
	import { initI18n, _, isLoading as i18nLoading, locale } from '$lib/i18n';

	// Initialize i18n synchronously
	initI18n();

	// Track if i18n is ready
	const i18nReady = $derived(!$i18nLoading && $locale !== null);

	let { children } = $props();

	let sidebarOpen = $state(false);
	let initialized = $state(false);

	// Initialize data when authenticated (only once)
	$effect(() => {
		if (browser && auth.isAuthenticated && !initialized) {
			initialized = true;

			// Load user data
			settingsStore.load();
			categoriesStore.load();
			templatesStore.load();
			calendar.loadEvents();

			// Subscribe to realtime updates
			calendar.subscribeToUpdates();
			categoriesStore.subscribeToUpdates();
		}
	});

	// Apply theme and accessibility settings
	$effect(() => {
		if (browser) {
			const html = document.documentElement;

			// Theme
			if (settingsStore.theme === 'dark') {
				html.classList.add('dark');
			} else if (settingsStore.theme === 'light') {
				html.classList.remove('dark');
			} else {
				// System preference
				if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
					html.classList.add('dark');
				} else {
					html.classList.remove('dark');
				}
			}

			// Reduced animations
			if (settingsStore.reduceAnimations) {
				html.classList.add('reduce-animations');
			} else {
				html.classList.remove('reduce-animations');
			}

			// High contrast
			if (settingsStore.highContrast) {
				html.classList.add('high-contrast');
			} else {
				html.classList.remove('high-contrast');
			}
		}
	});

	// Cleanup on unmount
	$effect(() => {
		return () => {
			calendar.unsubscribeFromUpdates();
			categoriesStore.unsubscribeFromUpdates();
		};
	});
</script>

<svelte:head>
	<title>calenDHD</title>
	<meta name="description" content="A calm, ADHD-friendly calendar for neurodivergent minds" />
</svelte:head>

{#if auth.loading || !i18nReady}
	<!-- Loading state -->
	<div class="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-900">
		<div class="text-center">
			<div class="w-12 h-12 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin mx-auto"></div>
			<p class="mt-4 text-neutral-600 dark:text-neutral-400">Loading...</p>
		</div>
	</div>
{:else}
	<!-- Main app layout -->
	<div class="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex">
		<Sidebar
			open={sidebarOpen}
			onClose={() => (sidebarOpen = false)}
		/>

		<div class="flex-1 flex flex-col min-w-0">
			<Header onMenuClick={() => (sidebarOpen = true)} />

			<main class="flex-1 overflow-hidden">
				{@render children()}
			</main>
		</div>

		<!-- Quick add FAB -->
		<QuickAdd />
	</div>
{/if}

<!-- Toast notifications -->
<Toaster
	position="bottom-right"
	richColors
	closeButton
	toastOptions={{
		duration: 4000
	}}
/>

<!-- Offline indicator -->
<OfflineIndicator />
