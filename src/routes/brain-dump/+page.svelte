<script lang="ts">
	import { goto } from '$app/navigation';
	import { _ } from '$lib/i18n';
	import { Button, Input } from '$components/ui';
	import { toast } from 'svelte-sonner';
	import { format } from 'date-fns';
	import {
		getBrainDumps,
		createBrainDump,
		deleteBrainDump
	} from '$api/pocketbase';
	import type { BrainDump } from '$types';

	let dumps = $state<BrainDump[]>([]);
	let title = $state('');
	let notes = $state('');
	let loading = $state(false);
	let saving = $state(false);

	async function load() {
		loading = true;
		try {
			dumps = await getBrainDumps();
		} catch (err) {
			toast.error(err instanceof Error ? err.message : $_('errors.generic'));
		} finally {
			loading = false;
		}
	}

	$effect(() => {
		load();
	});

	async function capture() {
		const t = title.trim();
		if (!t) return;
		saving = true;
		try {
			const created = await createBrainDump(t, notes.trim() || undefined);
			dumps = [created, ...dumps];
			title = '';
			notes = '';
			toast.success($_('brainDump.captured'));
		} catch (err) {
			toast.error(err instanceof Error ? err.message : $_('errors.generic'));
		} finally {
			saving = false;
		}
	}

	async function remove(dump: BrainDump) {
		const prev = dumps;
		dumps = dumps.filter((d) => d.id !== dump.id);
		try {
			await deleteBrainDump(dump.id);
			toast.success($_('brainDump.deleted'));
		} catch (err) {
			dumps = prev;
			toast.error(err instanceof Error ? err.message : $_('errors.generic'));
		}
	}

	function schedule(dump: BrainDump) {
		// Pre-fill /event/new via query string. The route currently doesn't
		// read this — Phase 4 keeps it as an enhancement; even without it
		// users can copy/paste the title easily.
		goto(`/event/new?title=${encodeURIComponent(dump.title)}&notes=${encodeURIComponent(dump.notes ?? '')}`);
	}
</script>

<div class="h-full overflow-y-auto">
	<div class="max-w-2xl mx-auto px-4 py-6">
		<h1 class="text-2xl font-bold text-neutral-800 dark:text-neutral-100 mb-2">
			{$_('brainDump.title')}
		</h1>
		<p class="text-sm text-neutral-500 dark:text-neutral-400 mb-6">
			{$_('brainDump.emptyDesc')}
		</p>

		<!-- Capture form -->
		<form
			onsubmit={(e) => {
				e.preventDefault();
				capture();
			}}
			class="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700 p-4 mb-6 space-y-3"
		>
			<Input
				bind:value={title}
				placeholder={$_('brainDump.placeholder')}
				autofocus
			/>
			<textarea
				bind:value={notes}
				placeholder={$_('brainDump.notesPlaceholder')}
				rows="2"
				class="w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 border-neutral-200 dark:border-neutral-600 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
			></textarea>
			<div class="flex justify-end">
				<Button onclick={capture} loading={saving} disabled={!title.trim()}>
					{$_('brainDump.add')}
				</Button>
			</div>
		</form>

		<!-- List -->
		{#if loading}
			<div class="flex items-center justify-center h-32">
				<div class="w-6 h-6 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin"></div>
			</div>
		{:else if dumps.length === 0}
			<div class="text-center py-12 text-neutral-400 dark:text-neutral-500">
				<div class="text-4xl mb-2">🧠</div>
				<p class="text-sm">{$_('brainDump.empty')}</p>
			</div>
		{:else}
			<ul class="space-y-2">
				{#each dumps as dump (dump.id)}
					<li
						class="bg-white dark:bg-neutral-800 rounded-lg border border-neutral-100 dark:border-neutral-700 p-3 flex items-start gap-3"
					>
						<div class="flex-1 min-w-0">
							<p class="font-medium text-neutral-800 dark:text-neutral-100 break-words">
								{dump.title}
							</p>
							{#if dump.notes}
								<p class="text-sm text-neutral-600 dark:text-neutral-300 mt-1 whitespace-pre-wrap break-words">
									{dump.notes}
								</p>
							{/if}
							<p class="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
								{format(new Date(dump.created), 'MMM d, HH:mm')}
							</p>
						</div>
						<div class="flex flex-col gap-1 flex-shrink-0">
							<button
								type="button"
								onclick={() => schedule(dump)}
								class="text-xs px-2 py-1 rounded text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/30 transition-colors"
							>
								{$_('brainDump.convertToEvent')}
							</button>
							<button
								type="button"
								onclick={() => remove(dump)}
								class="text-xs px-2 py-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
							>
								{$_('brainDump.delete')}
							</button>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</div>
