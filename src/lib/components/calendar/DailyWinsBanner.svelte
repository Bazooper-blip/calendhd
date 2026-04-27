<script lang="ts">
	import { browser } from '$app/environment';
	import { _ } from '$lib/i18n';
	import { calendar, settingsStore } from '$stores';
	import { isToday } from '$utils';
	import { format } from 'date-fns';
	import type { DisplayEvent } from '$types';

	// Show only on today's day view, after 21:00 local, and only once per day
	// (per browser, per origin) until dismissed.

	let now = $state(new Date());
	let dismissed = $state(false);

	const dismissedKey = $derived(`calendhd:wins-dismissed:${format(now, 'yyyy-MM-dd')}`);

	$effect(() => {
		if (!browser) return;
		const stored = localStorage.getItem(dismissedKey);
		dismissed = stored === '1';
		const i = setInterval(() => (now = new Date()), 60_000);
		return () => clearInterval(i);
	});

	const todayEvents = $derived(
		calendar.displayEvents.filter((e) => isToday(e.start) && !e.is_external)
	);

	const completedToday = $derived(todayEvents.filter((e) => e.is_completed));

	const totalCompleted = $derived(completedToday.length);

	const minutesWon = $derived(
		completedToday.reduce((sum, e) => {
			if (!e.end) return sum;
			return sum + Math.max(0, Math.round((e.end.getTime() - e.start.getTime()) / 60_000));
		}, 0)
	);

	const routinesCompleteToday = $derived.by(() => {
		const byRoutine = new Map<string, { total: number; done: number }>();
		for (const e of todayEvents) {
			if (!e.routine_template) continue;
			const entry = byRoutine.get(e.routine_template) ?? { total: 0, done: 0 };
			entry.total += 1;
			if (e.is_completed) entry.done += 1;
			byRoutine.set(e.routine_template, entry);
		}
		let count = 0;
		for (const v of byRoutine.values()) {
			if (v.total > 0 && v.done === v.total) count += 1;
		}
		return count;
	});

	const shouldShow = $derived(
		settingsStore.dailyWinsEnabled &&
		!dismissed &&
		now.getHours() >= 21 &&
		totalCompleted > 0
	);

	function dismiss() {
		dismissed = true;
		if (browser) localStorage.setItem(dismissedKey, '1');
	}

	function formatMinutes(total: number): string {
		if (total < 60) return `${total} min`;
		const h = Math.floor(total / 60);
		const m = total % 60;
		return m === 0 ? `${h}h` : `${h}h ${m}m`;
	}
</script>

{#if shouldShow}
	<div
		class="flex-shrink-0 mx-4 my-2 rounded-xl border border-primary-100 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/30 px-4 py-3 flex items-start gap-3"
	>
		<div class="text-2xl flex-shrink-0">✨</div>
		<div class="flex-1 min-w-0">
			<p class="text-sm font-semibold text-primary-800 dark:text-primary-200">
				{$_('wins.title')}
			</p>
			<p class="text-xs text-primary-700 dark:text-primary-300 mt-0.5">
				{$_('wins.summary', {
					values: {
						count: totalCompleted,
						minutes: formatMinutes(minutesWon),
						routines: routinesCompleteToday
					}
				})}
			</p>
		</div>
		<button
			type="button"
			onclick={dismiss}
			class="flex-shrink-0 p-1 rounded text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/50"
			aria-label={$_('common.close')}
		>
			<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>
	</div>
{/if}
