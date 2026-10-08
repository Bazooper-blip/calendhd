<script lang="ts">
	import { browser } from '$app/env';
	import { goto } from '$app/navigation';
	import { format } from 'date-fns';
	import { toast } from 'svelte-sonner';
	import { searchEvents } from '#api/pocketbase.js';
	import { calendar, settingsStore } from '#stores';
	import {
		RECURRENCE_PRESETS,
		buildSearchResults,
		formatDateSmart,
		formatTime,
		formatTimeRange,
		type SearchResult
	} from '#utils';
	import { EventIcon, Modal } from '#components/ui/index.js';
	import { _ } from '#lib/i18n/index.js';

	interface Props {
		open?: boolean;
	}

	let { open = $bindable(false) }: Props = $props();

	const MIN_QUERY_LENGTH = 2;
	const DEBOUNCE_MS = 250;

	let query = $state('');
	let results = $state<SearchResult[]>([]);
	let loading = $state(false);
	let failed = $state(false);
	let inputEl = $state<HTMLInputElement | null>(null);
	// Guards against a slow earlier request overwriting a newer one's results.
	let requestSeq = 0;

	const format24h = $derived(settingsStore.timeFormat === '24h');
	const trimmed = $derived(query.trim());
	const tooShort = $derived(trimmed.length < MIN_QUERY_LENGTH);
	const upcoming = $derived(results.filter((r) => r.upcoming));
	const earlier = $derived(results.filter((r) => !r.upcoming));

	// Debounced search: re-runs whenever the trimmed query changes.
	$effect(() => {
		const q = trimmed;
		if (!open) return;
		if (q.length < MIN_QUERY_LENGTH) {
			results = [];
			loading = false;
			failed = false;
			return;
		}
		const seq = ++requestSeq;
		loading = true;
		failed = false;
		const timer = setTimeout(async () => {
			try {
				const { events, externalEvents } = await searchEvents(q);
				if (seq !== requestSeq) return;
				results = buildSearchResults({
					events,
					externalEvents,
					externalPauses: calendar.externalPauses,
					now: new Date()
				});
			} catch (error) {
				if (seq !== requestSeq) return;
				console.error('Search failed:', error);
				results = [];
				failed = true;
			} finally {
				if (seq === requestSeq) loading = false;
			}
		}, DEBOUNCE_MS);
		return () => clearTimeout(timer);
	});

	// bits-ui would focus the first tabbable element (the close button);
	// send focus to the search field instead.
	function focusInput(e: Event) {
		e.preventDefault();
		inputEl?.focus();
	}

	// Reset when the modal closes.
	$effect(() => {
		if (!open) {
			query = '';
			results = [];
			requestSeq++;
			loading = false;
			failed = false;
		}
	});

	// "/" opens search from anywhere, like "n" opens quick add.
	$effect(() => {
		if (!browser) return;
		function handleKeydown(e: KeyboardEvent) {
			if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
			const target = e.target;
			if (
				target instanceof HTMLInputElement ||
				target instanceof HTMLTextAreaElement ||
				target instanceof HTMLSelectElement ||
				(target instanceof HTMLElement && target.isContentEditable)
			) {
				return;
			}
			if (open) return;
			e.preventDefault();
			open = true;
		}
		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});

	function whenLabel(r: SearchResult): string {
		const day = formatDateSmart(r.when, {
			today: $_('common.today'),
			tomorrow: $_('common.tomorrow'),
			yesterday: $_('common.yesterday')
		});
		if (r.is_all_day) return `${day} · ${$_('event.allDay')}`;
		if (!r.end) return `${day} · ${$_('time.from', { values: { time: formatTime(r.when, format24h) } })}`;
		return `${day} · ${formatTimeRange(r.when, r.end, format24h)}`;
	}

	function recurrenceLabel(r: SearchResult): string | null {
		if (!r.recurrence_rule) return null;
		const preset = RECURRENCE_PRESETS.find((p) => p.value?.frequency === r.recurrence_rule?.frequency);
		return $_(preset?.i18nKey ?? 'recurrence.none');
	}

	function openResult(r: SearchResult) {
		// Paused events are hidden from every calendar view. Local ones have an
		// edit page; external ones only have the resume button on their row.
		if (r.is_paused) {
			if (r.is_external) return;
			open = false;
			goto(`/event/${r.event_id}`);
			return;
		}
		open = false;
		goto(`/calendar/day/${format(r.when, 'yyyy-MM-dd')}`);
	}

	async function resumeExternal(r: SearchResult) {
		if (!r.pause_id) return;
		try {
			await calendar.resumeExternalEvent(r.pause_id);
			results = results.map((x) =>
				x.id === r.id ? { ...x, is_paused: false, pause_id: undefined } : x
			);
			toast.success($_('event.resumed'));
		} catch (error) {
			console.error('Failed to resume external event:', error);
			toast.error($_('errors.generic'));
		}
	}
</script>

<Modal bind:open title={$_('search.title')} size="md" onOpenAutoFocus={focusInput}>
	<div class="space-y-4">
		<div class="relative">
			<svg
				class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400 pointer-events-none"
				fill="none"
				viewBox="0 0 24 24"
				stroke="currentColor"
				aria-hidden="true"
			>
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-4.35-4.35M17 11A6 6 0 115 11a6 6 0 0112 0z" />
			</svg>
			<input
				bind:this={inputEl}
				bind:value={query}
				type="search"
				enterkeyhint="search"
				autocomplete="off"
				placeholder={$_('search.placeholder')}
				aria-label={$_('search.title')}
				class="w-full pl-9 pr-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
			/>
		</div>

		<div class="min-h-[8rem] max-h-[60vh] overflow-y-auto -mx-2 px-2" aria-live="polite">
			{#if tooShort}
				<p class="text-sm text-neutral-500 dark:text-neutral-400 py-6 text-center">
					{$_('search.hint', { values: { count: MIN_QUERY_LENGTH } })}
				</p>
			{:else if failed}
				<p class="text-sm text-red-600 dark:text-red-400 py-6 text-center">{$_('search.failed')}</p>
			{:else if loading && results.length === 0}
				<p class="text-sm text-neutral-500 dark:text-neutral-400 py-6 text-center">{$_('search.searching')}</p>
			{:else if results.length === 0}
				<p class="text-sm text-neutral-500 dark:text-neutral-400 py-6 text-center">
					{$_('search.noResults', { values: { query: trimmed } })}
				</p>
			{:else}
				{#snippet group(label: string, items: SearchResult[])}
					{#if items.length > 0}
						<h3 class="text-xs font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400 px-2 pt-2 pb-1">
							{label}
						</h3>
						<ul class="space-y-1">
							{#each items as r (r.id)}
								<li class="flex items-start gap-1">
									<button
										type="button"
										onclick={() => openResult(r)}
										disabled={r.is_paused && r.is_external}
										class="flex-1 min-w-0 flex items-start gap-3 px-2 py-2 rounded-lg text-left hover:bg-neutral-100 dark:hover:bg-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 transition-colors disabled:hover:bg-transparent disabled:cursor-default {r.is_paused ? 'opacity-60' : ''}"
									>
										<span class="mt-1.5 w-2.5 h-2.5 rounded-full flex-shrink-0" style="background-color: {r.color}"></span>
										<span class="flex-1 min-w-0">
											<span class="flex items-center gap-1.5 text-sm font-medium text-neutral-800 dark:text-neutral-100">
												{#if r.icon}
													<EventIcon icon={r.icon} size="sm" />
												{/if}
												<span class="truncate">{r.title}</span>
											</span>
											<span class="block text-xs text-neutral-500 dark:text-neutral-400 tabular-nums">
												{whenLabel(r)}
											</span>
											{#if r.is_recurring || r.is_external || r.is_paused}
												<span class="block text-xs text-neutral-400 dark:text-neutral-500">
													{[
														recurrenceLabel(r),
														r.subscription_name,
														r.is_paused ? $_('search.paused') : null
													]
														.filter(Boolean)
														.join(' · ')}
												</span>
											{/if}
										</span>
									</button>
									{#if r.is_paused && r.is_external}
										<button
											type="button"
											onclick={() => resumeExternal(r)}
											class="shrink-0 mt-2 p-1 rounded text-neutral-400 dark:text-neutral-500 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
											aria-label={$_('event.resume')}
											title={$_('event.resume')}
										>
											<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
											</svg>
										</button>
									{/if}
								</li>
							{/each}
						</ul>
					{/if}
				{/snippet}
				{@render group($_('search.upcoming'), upcoming)}
				{@render group($_('search.earlier'), earlier)}
			{/if}
		</div>
	</div>
</Modal>
