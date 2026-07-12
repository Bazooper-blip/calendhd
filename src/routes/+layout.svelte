<script lang="ts">
	import '../app.css';
	import { browser } from '$app/environment';
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { format } from 'date-fns';
	import { isSameDay } from '$utils';
	import { auth, settingsStore, categoriesStore, templatesStore, calendar, routinesStore } from '$stores';
	import { Sidebar, Header } from '$components/layout';
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
	let mainRef = $state<HTMLElement>();

	// <main> is the app's scroll container; reset it on navigation like a page scroll
	afterNavigate(() => {
		mainRef?.scrollTo(0, 0);
	});

	// Initialize data when authenticated (only once)
	$effect(() => {
		if (browser && auth.isAuthenticated && !initialized) {
			initialized = true;

			// Load user data
			settingsStore.load();
			categoriesStore.load();
			templatesStore.load();
			routinesStore.load();
			calendar.loadEvents();

			// Subscribe to realtime updates
			calendar.subscribeToUpdates();
			categoriesStore.subscribeToUpdates();
			routinesStore.subscribeToUpdates();
		}
	});

	// Refresh on resume: mobile OSes (iOS especially) freeze a backgrounded PWA
	// and resume it as-is rather than reloading, so the once-per-launch load
	// above goes stale while the app is suspended — each day's routine events
	// are generated server-side overnight (after our last fetch) and the
	// realtime stream has no replay for anything missed while frozen. Refetch
	// when the app comes back after a meaningful gap, and follow the calendar
	// day if it rolled over while we were away.
	let hiddenAt: number | null = null;

	function markHidden() {
		hiddenAt = Date.now();
	}

	function handleResume() {
		if (hiddenAt === null) return;
		const hiddenDate = new Date(hiddenAt);
		const hiddenForMs = Date.now() - hiddenAt;
		hiddenAt = null;

		if (!auth.isAuthenticated) return;
		// Quick same-day app/tab switches don't need a refetch
		if (hiddenForMs < 30_000 && isSameDay(hiddenDate, new Date())) return;

		const dayRolledOver = !isSameDay(hiddenDate, new Date());
		const wasAnchoredOnToday = isSameDay(calendar.currentDate, hiddenDate);

		if (dayRolledOver && wasAnchoredOnToday) {
			// The user was looking at "today" when the app was suspended —
			// follow the new day instead of waking up on yesterday's view.
			if ($page.url.pathname.startsWith('/calendar')) {
				// Calendar URLs may pin a date param that would override a bare
				// setDate(), so navigate the same way the Today button does.
				const today = format(new Date(), 'yyyy-MM-dd');
				goto(`/calendar/${calendar.viewType}/${today}`, { replaceState: true });
			} else {
				calendar.setDate(new Date());
			}
		} else {
			// Keep whatever period the user chose, but refresh its events.
			calendar.loadEvents();
		}
	}

	function handleVisibilityChange() {
		if (document.visibilityState === 'hidden') {
			markHidden();
		} else {
			handleResume();
		}
	}

	function handleOnline() {
		// loadEvents() swallows fetch failures (e.g. the network isn't up yet
		// in the first moments after iOS resumes the app) — refetch as soon as
		// connectivity returns.
		if (auth.isAuthenticated) calendar.loadEvents();
	}

	$effect(() => {
		if (!browser) return;
		document.addEventListener('visibilitychange', handleVisibilityChange);
		window.addEventListener('pagehide', markHidden);
		window.addEventListener('pageshow', handleResume);
		window.addEventListener('online', handleOnline);
		return () => {
			document.removeEventListener('visibilitychange', handleVisibilityChange);
			window.removeEventListener('pagehide', markHidden);
			window.removeEventListener('pageshow', handleResume);
			window.removeEventListener('online', handleOnline);
		};
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

			// Accent color
			const accents = ['accent-sage', 'accent-ocean', 'accent-lavender', 'accent-rose', 'accent-amber', 'accent-teal'];
			html.classList.remove(...accents);
			if (settingsStore.colorPalette !== 'sage') {
				html.classList.add(`accent-${settingsStore.colorPalette}`);
			}
		}
	});

	// Cleanup on unmount
	$effect(() => {
		return () => {
			calendar.unsubscribeFromUpdates();
			categoriesStore.unsubscribeFromUpdates();
			routinesStore.unsubscribeFromUpdates();
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
	<!-- Main app layout: bounded viewport height so inner grids (week/day
	     timeline) can own their scroll; page-level scrolling happens in <main> -->
	<div class="h-dvh bg-neutral-50 dark:bg-neutral-900 flex">
		<Sidebar
			open={sidebarOpen}
			onClose={() => (sidebarOpen = false)}
		/>

		<div class="flex-1 flex flex-col min-w-0">
			<Header onMenuClick={() => (sidebarOpen = true)} />

			<main class="flex-1 overflow-y-auto" bind:this={mainRef}>
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
