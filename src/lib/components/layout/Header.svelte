<script lang="ts">
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { format } from 'date-fns';
	import { calendar } from '$stores';
	import { formatMonthYear, formatDateSmart } from '$utils';
	import { Button } from '$components/ui';
	import { _ } from '$lib/i18n';

	interface Props {
		onMenuClick?: () => void;
	}

	let { onMenuClick }: Props = $props();

	const viewLabels = $derived({
		day: $_('nav.day'),
		week: $_('nav.week'),
		month: $_('nav.month')
	});

	// Check if we're on a calendar route
	const isCalendarRoute = $derived($page.url.pathname.startsWith('/calendar'));

	// Get current view type from URL
	const currentView = $derived(() => {
		const path = $page.url.pathname;
		if (path.includes('/calendar/day')) return 'day';
		if (path.includes('/calendar/week')) return 'week';
		if (path.includes('/calendar/month')) return 'month';
		return 'week';
	});

	function getCalendarTitle(): string {
		const { currentDate, viewType } = calendar;
		switch (viewType) {
			case 'day':
				return formatDateSmart(currentDate, {
					today: $_('nav.today'),
					tomorrow: $_('common.tomorrow'),
					yesterday: $_('common.yesterday')
				});
			case 'week':
			case 'month':
				return formatMonthYear(currentDate);
		}
	}

	function navigateToView(view: 'day' | 'week' | 'month') {
		const dateStr = format(calendar.currentDate, 'yyyy-MM-dd');
		goto(`/calendar/${view}/${dateStr}`);
	}

	function goToToday() {
		const today = format(new Date(), 'yyyy-MM-dd');
		goto(`/calendar/${calendar.viewType}/${today}`);
	}

	function goPrevious() {
		calendar.goPrevious();
		const dateStr = format(calendar.currentDate, 'yyyy-MM-dd');
		goto(`/calendar/${calendar.viewType}/${dateStr}`);
	}

	function goNext() {
		calendar.goNext();
		const dateStr = format(calendar.currentDate, 'yyyy-MM-dd');
		goto(`/calendar/${calendar.viewType}/${dateStr}`);
	}
</script>

<header class="flex items-center justify-between px-4 py-3 bg-white dark:bg-neutral-800 border-b border-neutral-100 dark:border-neutral-700 sticky top-0 z-40 pt-[calc(0.75rem+env(safe-area-inset-top))]">
	<div class="flex items-center gap-3">
		<!-- Menu button (mobile) -->
		<button
			type="button"
			onclick={onMenuClick}
			class="lg:hidden p-2 -ml-2 rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
			aria-label="Open menu"
		>
			<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
			</svg>
		</button>

		{#if isCalendarRoute}
			<!-- Navigation arrows (calendar only) -->
			<div class="flex items-center gap-1">
				<button
					type="button"
					onclick={goPrevious}
					class="p-2 rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
					aria-label={$_('common.previous')}
				>
					<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
					</svg>
				</button>
				<button
					type="button"
					onclick={goNext}
					class="p-2 rounded-lg text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
					aria-label={$_('common.next')}
				>
					<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
					</svg>
				</button>
			</div>

			<!-- Calendar date/period title -->
			<h1 class="text-lg font-semibold text-neutral-800 dark:text-neutral-100">
				{getCalendarTitle()}
			</h1>
		{/if}
	</div>

	<div class="flex items-center gap-2">
		{#if isCalendarRoute}
			<!-- Today button -->
			<Button variant="ghost" size="sm" onclick={goToToday}>
				{$_('nav.today')}
			</Button>

			<!-- View type selector -->
			<div class="hidden sm:flex items-center bg-neutral-100 dark:bg-neutral-700 rounded-lg p-1">
				{#each ['day', 'week', 'month'] as view}
					<a
						href="/calendar/{view}"
						onclick={(e) => { e.preventDefault(); navigateToView(view as 'day' | 'week' | 'month'); }}
						class="px-3 py-1 rounded-md text-sm font-medium transition-colors {calendar.viewType === view
							? 'bg-white dark:bg-neutral-600 text-neutral-800 dark:text-neutral-100 shadow-sm'
							: 'text-neutral-600 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200'}"
					>
						{viewLabels[view as 'day' | 'week' | 'month']}
					</a>
				{/each}
			</div>
		{/if}

		<!-- Add event button -->
		<a
			href="/event/new"
			class="inline-flex items-center gap-1 px-3 py-2 bg-primary-500 text-white rounded-lg text-sm font-medium hover:bg-primary-600 transition-colors"
		>
			<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
			</svg>
			<span class="hidden sm:inline">{$_('event.addEvent')}</span>
		</a>
	</div>
</header>
