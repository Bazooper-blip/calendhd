<script lang="ts">
	import { browser } from '$app/environment';
	import { format, addHours, setHours, setMinutes } from 'date-fns';
	import { calendar } from '$stores';
	import { toast } from 'svelte-sonner';
	import { Button, Input, Modal } from '$components/ui';

	let showModal = $state(false);
	let showFab = $state(true);
	let loading = $state(false);

	// Form state
	let title = $state('');
	let eventDate = $state(format(new Date(), 'yyyy-MM-dd'));
	let eventTime = $state('');
	let duration = $state(60); // minutes
	let isTask = $state(false);

	// Set default time to next hour
	function setDefaults() {
		const now = new Date();
		const nextHour = addHours(setMinutes(now, 0), 1);
		eventDate = format(calendar.currentDate, 'yyyy-MM-dd');
		eventTime = format(nextHour, 'HH:mm');
		title = '';
		duration = 60;
		isTask = false;
	}

	function openQuickAdd() {
		setDefaults();
		showModal = true;
	}

	function closeModal() {
		showModal = false;
		title = '';
	}

	async function handleSubmit() {
		if (!title.trim()) return;

		loading = true;

		try {
			const startDate = new Date(`${eventDate}T${eventTime}`);
			const endDate = addHours(startDate, duration / 60);

			await calendar.createEvent({
				title: title.trim(),
				start_time: startDate.toISOString(),
				end_time: endDate.toISOString(),
				is_all_day: false,
				is_task: isTask,
				reminders: [{ minutes_before: 10, type: 'notification' }]
			});

			toast.success('Event created');
			closeModal();
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Failed to create event');
		} finally {
			loading = false;
		}
	}

	// Keyboard shortcut: 'n' to open quick add
	$effect(() => {
		if (!browser) return;

		function handleKeydown(e: KeyboardEvent) {
			// Don't trigger if typing in an input
			if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
			// Don't trigger if modal is already open
			if (showModal) return;

			if (e.key === 'n' && !e.ctrlKey && !e.metaKey && !e.altKey) {
				e.preventDefault();
				openQuickAdd();
			}
		}

		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});

	// Hide FAB when scrolling down, show when scrolling up
	$effect(() => {
		if (!browser) return;

		let lastScrollY = window.scrollY;

		function handleScroll() {
			const currentScrollY = window.scrollY;
			showFab = currentScrollY < lastScrollY || currentScrollY < 100;
			lastScrollY = currentScrollY;
		}

		window.addEventListener('scroll', handleScroll, { passive: true });
		return () => window.removeEventListener('scroll', handleScroll);
	});
</script>

<!-- Floating Action Button -->
<button
	type="button"
	onclick={openQuickAdd}
	class="fixed right-6 z-40 w-14 h-14 bg-primary-500 text-white rounded-full shadow-lg hover:bg-primary-600 hover:shadow-xl active:scale-95 transition-all flex items-center justify-center {showFab
		? 'translate-y-0 opacity-100'
		: 'translate-y-20 opacity-0'}"
	style="bottom: calc(1.5rem + env(safe-area-inset-bottom))"
	aria-label="Quick add event (press N)"
>
	<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
		<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
	</svg>
</button>

<!-- Quick Add Modal -->
<Modal bind:open={showModal} title="Quick Add Event" size="sm">
	<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
		<div>
			<Input
				bind:value={title}
				placeholder="Event title"
				autofocus
			/>
		</div>

		<div class="grid grid-cols-2 gap-3">
			<div>
				<label for="quick-date" class="block text-xs font-medium text-neutral-500 mb-1">Date</label>
				<Input
					id="quick-date"
					type="date"
					bind:value={eventDate}
				/>
			</div>
			<div>
				<label for="quick-time" class="block text-xs font-medium text-neutral-500 mb-1">Time</label>
				<Input
					id="quick-time"
					type="time"
					bind:value={eventTime}
				/>
			</div>
		</div>

		<div>
			<label class="block text-xs font-medium text-neutral-500 mb-1">Duration</label>
			<div class="flex gap-2">
				{#each [15, 30, 60, 120] as mins}
					<button
						type="button"
						onclick={() => (duration = mins)}
						class="flex-1 px-2 py-1.5 text-sm rounded-lg border transition-colors {duration === mins
							? 'bg-primary-500 text-white border-primary-500'
							: 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'}"
					>
						{mins < 60 ? `${mins}m` : `${mins / 60}h`}
					</button>
				{/each}
			</div>
		</div>

		<!-- Task toggle -->
		<button
			type="button"
			onclick={() => (isTask = !isTask)}
			class="w-full flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors {isTask
				? 'bg-amber-50 border-amber-300 text-amber-700'
				: 'bg-white border-neutral-200 text-neutral-600 hover:border-neutral-300'}"
		>
			<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				{#if isTask}
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
				{:else}
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
				{/if}
			</svg>
			<span class="text-sm">{isTask ? 'This is a task' : 'Make this a task'}</span>
		</button>

		<p class="text-xs text-neutral-400 text-center">
			Tip: Press <kbd class="px-1.5 py-0.5 bg-neutral-100 rounded text-neutral-600">N</kbd> anywhere to quick add
		</p>
	</form>

	{#snippet footer()}
		<Button variant="ghost" onclick={closeModal}>Cancel</Button>
		<Button onclick={handleSubmit} {loading} disabled={!title.trim()}>
			Add Event
		</Button>
	{/snippet}
</Modal>
