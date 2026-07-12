<script lang="ts">
	import '../app.css';
	import { untrack } from 'svelte';
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

			// Load user data. Settings must land BEFORE the first event fetch:
			// the week range is computed from week_starts_on, and fetching with
			// the default (Sunday-start) while the user's setting (Monday-start)
			// is still in flight loads a range that barely overlaps the week the
			// grid then displays — on Sundays the two ranges share only a single
			// day and the week renders (near-)empty until something refetches.
			(async () => {
				await settingsStore.load();
				calendar.loadEvents();
			})();
			categoriesStore.load();
			templatesStore.load();
			routinesStore.load();

			// Subscribe to realtime updates
			calendar.subscribeToUpdates();
			categoriesStore.subscribeToUpdates();
			routinesStore.subscribeToUpdates();
		}
	});

	// Refetch when week_starts_on changes after data has loaded (e.g. the user
	// toggles it in settings) — the loaded range no longer matches the grid.
	let prevWeekStartsOn: number | null = null;
	$effect(() => {
		const ws = settingsStore.weekStartsOn;
		untrack(() => {
			if (prevWeekStartsOn !== null && ws !== prevWeekStartsOn && calendar.lastLoadSuccessAt !== null) {
				calendar.loadEvents();
			}
			prevWeekStartsOn = ws;
		});
	});

	// Refresh on resume: mobile OSes (iOS especially) freeze a backgrounded PWA
	// and resume it as-is rather than reloading, so the once-per-launch load
	// above goes stale while the app is suspended — each day's routine events
	// are generated server-side overnight (after our last fetch) and the
	// realtime stream has no replay for anything missed while frozen.
	//
	// iOS delivers the lifecycle events around suspension unreliably: the
	// `hidden` half is often skipped entirely, so pairing hide/show events
	// fails closed. Instead, "how long ago did a load last succeed" is the
	// source of truth, checked from every wake-ish signal — plus a slow
	// watchdog for wakes where no event fires at all.
	const STALE_AFTER_WAKE_MS = 30_000; // threshold for wake signals
	const STALE_WATCHDOG_MS = 5 * 60_000; // threshold for the periodic backstop

	function refreshIfStale(staleAfterMs: number) {
		if (!auth.isAuthenticated) return;

		const lastAt = calendar.lastLoadSuccessAt;
		if (lastAt === null) {
			// No load has succeeded yet this session (e.g. the fetch right
			// after a cold launch failed) — try again unless one is in flight.
			if (!calendar.loading) calendar.loadEvents();
			return;
		}

		const now = new Date();
		const lastLoad = new Date(lastAt);
		const dayChanged = !isSameDay(lastLoad, now);
		if (!dayChanged && now.getTime() - lastAt < staleAfterMs) return;

		if (dayChanged && isSameDay(calendar.currentDate, lastLoad)) {
			// The view was anchored on "today" as of the last refresh — follow
			// the new day instead of waking up on yesterday's dates.
			if ($page.url.pathname.startsWith('/calendar')) {
				// Calendar URLs may pin a date param that would override a bare
				// setDate(), so navigate the same way the Today button does.
				const today = format(now, 'yyyy-MM-dd');
				goto(`/calendar/${calendar.viewType}/${today}`, { replaceState: true });
			} else {
				calendar.setDate(now);
			}
		} else {
			// Keep whatever period the user chose, but refresh its events.
			calendar.loadEvents();
		}
	}

	function handleWakeSignal() {
		if (document.visibilityState !== 'visible') return;
		refreshIfStale(STALE_AFTER_WAKE_MS);
	}

	$effect(() => {
		if (!browser) return;
		document.addEventListener('visibilitychange', handleWakeSignal);
		window.addEventListener('pageshow', handleWakeSignal);
		window.addEventListener('focus', handleWakeSignal);
		window.addEventListener('online', handleWakeSignal);
		// Backstop for resumes that fire no event at all; also keeps an
		// always-on display fresh (and rolls it to the new day at midnight)
		// even if the realtime connection silently died.
		const watchdog = setInterval(() => {
			if (document.visibilityState === 'visible') refreshIfStale(STALE_WATCHDOG_MS);
		}, 60_000);
		return () => {
			document.removeEventListener('visibilitychange', handleWakeSignal);
			window.removeEventListener('pageshow', handleWakeSignal);
			window.removeEventListener('focus', handleWakeSignal);
			window.removeEventListener('online', handleWakeSignal);
			clearInterval(watchdog);
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
