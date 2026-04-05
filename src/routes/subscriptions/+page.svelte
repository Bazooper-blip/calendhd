<script lang="ts">
	import { t } from 'svelte-i18n';
	import { getSubscriptions, createSubscription, updateSubscription, deleteSubscription, getAuthToken } from '$api/pocketbase';
	import { Button, Input, Modal, Toggle, ColorPicker } from '$components/ui';
	import { toast } from '$components/ui/Toast.svelte';
	import { calendar } from '$stores';
	import { normalizeCalendarUrl, formatRelativeTime } from '$utils';
	import type { CalendarSubscription } from '$types';

	let subscriptions = $state<CalendarSubscription[]>([]);
	let loading = $state(true);
	let showModal = $state(false);
	let editingSubscription = $state<CalendarSubscription | null>(null);
	let saving = $state(false);
	let syncingIds = $state<Set<string>>(new Set());

	// Form state
	let name = $state('');
	let url = $state('');
	let colorOverride = $state('');
	let refreshIntervalMinutes = $state(60);

	// Load subscriptions
	$effect(() => {
		loadSubscriptions();
	});

	async function loadSubscriptions() {
		loading = true;
		try {
			subscriptions = await getSubscriptions();
		} catch (error) {
			toast($t('errors.generic'), 'error');
		} finally {
			loading = false;
		}
	}

	function openCreateModal() {
		editingSubscription = null;
		name = '';
		url = '';
		colorOverride = '#9A88B5';
		refreshIntervalMinutes = 60;
		showModal = true;
	}

	function openEditModal(subscription: CalendarSubscription) {
		editingSubscription = subscription;
		name = subscription.name;
		url = subscription.url;
		colorOverride = subscription.color_override || '#9A88B5';
		refreshIntervalMinutes = subscription.refresh_interval_minutes;
		showModal = true;
	}

	function closeModal() {
		showModal = false;
		editingSubscription = null;
	}

	async function handleSubmit() {
		if (!name.trim() || !url.trim()) return;

		saving = true;

		try {
			const normalizedUrl = normalizeCalendarUrl(url);

			if (editingSubscription) {
				await updateSubscription(editingSubscription.id, {
					name,
					url: normalizedUrl,
					color_override: colorOverride || undefined,
					refresh_interval_minutes: refreshIntervalMinutes
				});
				toast($t('subscription.updated'), 'success');
				// Sync after update in case URL changed
				await syncSubscription(editingSubscription.id);
			} else {
				const newSub = await createSubscription({
					name,
					url: normalizedUrl,
					color_override: colorOverride || undefined,
					refresh_interval_minutes: refreshIntervalMinutes,
					is_active: true
				});
				toast($t('subscription.created'), 'success');
				// Immediately sync the new subscription
				await loadSubscriptions();
				await syncSubscription(newSub.id);
			}

			await loadSubscriptions();
			closeModal();
		} catch (error) {
			toast(error instanceof Error ? error.message : $t('errors.generic'), 'error');
		} finally {
			saving = false;
		}
	}

	async function handleToggleActive(subscription: CalendarSubscription) {
		try {
			await updateSubscription(subscription.id, {
				is_active: !subscription.is_active
			});
			await loadSubscriptions();
			// Sync if activating
			if (!subscription.is_active) {
				await syncSubscription(subscription.id);
			}
		} catch (error) {
			toast($t('errors.generic'), 'error');
		}
	}

	async function handleDelete(subscription: CalendarSubscription) {
		if (!confirm($t('subscription.deleteConfirm'))) return;

		try {
			await deleteSubscription(subscription.id);
			toast($t('subscription.deleted'), 'success');
			await loadSubscriptions();
		} catch (error) {
			toast($t('errors.generic'), 'error');
		}
	}

	async function syncSubscription(id: string) {
		if (syncingIds.has(id)) return;

		syncingIds = new Set([...syncingIds, id]);

		try {
			const token = getAuthToken();
			if (!token) {
				toast($t('errors.unauthorized'), 'error');
				return;
			}

			const response = await fetch(`/api/subscriptions/${id}/sync`, {
				method: 'POST',
				headers: {
					'Authorization': `Bearer ${token}`
				}
			});

			const result = await response.json();

			if (response.ok) {
				if (result.created > 0) {
					toast(`${$t('subscription.syncSuccess')} (${result.created} events)`, 'success');
				} else if (result.totalParsed === 0) {
					toast($t('subscription.noEventsFound') || 'No events found in calendar feed', 'warning');
				} else {
					toast(`Parsed ${result.totalParsed} events but created ${result.created}`, 'warning');
				}
				await loadSubscriptions();
				await calendar.loadEvents();
			} else {
				toast(result.message || $t('errors.generic'), 'error');
				await loadSubscriptions(); // Reload to get error message
			}
		} catch (error) {
			toast($t('errors.generic'), 'error');
		} finally {
			syncingIds = new Set([...syncingIds].filter(i => i !== id));
		}
	}

	async function syncAllSubscriptions() {
		const activeSubscriptions = subscriptions.filter(s => s.is_active);
		for (const sub of activeSubscriptions) {
			await syncSubscription(sub.id);
		}
	}

	const refreshOptions = $derived([
		{ value: 15, label: `15 ${$t('subscription.minutes')}` },
		{ value: 30, label: `30 ${$t('subscription.minutes')}` },
		{ value: 60, label: `1 ${$t('subscription.hour')}` },
		{ value: 360, label: `6 ${$t('subscription.hours')}` },
		{ value: 1440, label: $t('recurrence.daily') }
	]);

	function formatLastRefreshed(dateStr?: string): string {
		if (!dateStr) return $t('subscription.never');
		return formatRelativeTime(new Date(dateStr));
	}
</script>

<div class="h-full overflow-y-auto">
	<div class="max-w-2xl mx-auto px-4 py-6">
		<div class="flex items-center justify-between mb-6">
			<div>
				<h1 class="text-2xl font-bold text-neutral-800 dark:text-neutral-100">{$t('subscription.title')}</h1>
				<p class="text-neutral-500 dark:text-neutral-400 text-sm mt-1">{$t('subscription.subtitle')}</p>
			</div>
			<div class="flex items-center gap-2">
				{#if subscriptions.length > 0}
					<Button variant="secondary" onclick={syncAllSubscriptions}>
						<svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
						</svg>
						{$t('subscription.sync')}
					</Button>
				{/if}
				<Button onclick={openCreateModal}>
					<svg class="w-4 h-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
					</svg>
					{$t('common.add')}
				</Button>
			</div>
		</div>

		{#if loading}
			<div class="flex items-center justify-center h-64">
				<div class="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin"></div>
			</div>
		{:else if subscriptions.length === 0}
			<div class="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700 p-8 text-center">
				<div class="w-12 h-12 bg-neutral-100 dark:bg-neutral-700 rounded-full flex items-center justify-center mx-auto mb-4">
					<svg class="w-6 h-6 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 5c7.18 0 13 5.82 13 13M6 11a7 7 0 017 7m-6 0a1 1 0 11-2 0 1 1 0 012 0z" />
					</svg>
				</div>
				<h3 class="text-lg font-medium text-neutral-800 dark:text-neutral-100 mb-1">{$t('subscription.noSubscriptions')}</h3>
				<p class="text-neutral-500 dark:text-neutral-400 mb-4">{$t('subscription.noSubscriptionsDesc')}</p>
				<Button onclick={openCreateModal}>{$t('subscription.add')}</Button>
			</div>
		{:else}
			<div class="space-y-2">
				{#each subscriptions as subscription}
					<div class="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700 p-4">
						<div class="flex items-start gap-4">
							<div
								class="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
								style="background-color: {subscription.color_override || '#9A88B5'}"
							>
								<svg class="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 5c7.18 0 13 5.82 13 13M6 11a7 7 0 017 7m-6 0a1 1 0 11-2 0 1 1 0 012 0z" />
								</svg>
							</div>

							<div class="flex-1 min-w-0">
								<h3 class="font-medium text-neutral-800 dark:text-neutral-100">{subscription.name}</h3>
								<p class="text-sm text-neutral-500 dark:text-neutral-400 truncate">{subscription.url}</p>
								<div class="flex items-center gap-3 mt-1">
									<span class="text-xs text-neutral-400 dark:text-neutral-500">
										{$t('subscription.lastSynced')}: {formatLastRefreshed(subscription.last_refreshed)}
									</span>
									{#if subscription.error_message}
										<span class="text-xs text-red-500">{$t('subscription.error')}: {subscription.error_message}</span>
									{/if}
								</div>
							</div>

							<div class="flex items-center gap-1">
								<button
									type="button"
									onclick={() => syncSubscription(subscription.id)}
									disabled={syncingIds.has(subscription.id) || !subscription.is_active}
									class="p-2 text-neutral-400 hover:text-primary-500 transition-colors disabled:opacity-50"
									aria-label="Sync subscription"
								>
									<svg
										class="w-5 h-5 {syncingIds.has(subscription.id) ? 'animate-spin' : ''}"
										fill="none"
										viewBox="0 0 24 24"
										stroke="currentColor"
									>
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
									</svg>
								</button>
								<Toggle
									checked={subscription.is_active}
									onchange={() => handleToggleActive(subscription)}
								/>
								<button
									type="button"
									onclick={() => openEditModal(subscription)}
									class="p-2 text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 transition-colors"
									aria-label="Edit subscription"
								>
									<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
									</svg>
								</button>
								<button
									type="button"
									onclick={() => handleDelete(subscription)}
									class="p-2 text-neutral-400 hover:text-red-500 transition-colors"
									aria-label="Delete subscription"
								>
									<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
									</svg>
								</button>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</div>
</div>

<!-- Create/Edit Modal -->
<Modal bind:open={showModal} title={editingSubscription ? $t('subscription.edit') : $t('subscription.add')}>
	<form onsubmit={(e) => { e.preventDefault(); handleSubmit(); }} class="space-y-4">
		<div>
			<label for="name" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
				{$t('subscription.name')}
			</label>
			<Input
				id="name"
				bind:value={name}
				placeholder={$t('subscription.namePlaceholder')}
				required
			/>
		</div>

		<div>
			<label for="url" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
				{$t('subscription.url')}
			</label>
			<Input
				id="url"
				type="url"
				bind:value={url}
				placeholder={$t('subscription.urlPlaceholder')}
				required
			/>
			<p class="text-xs text-neutral-400 dark:text-neutral-500 mt-1">
				{$t('subscription.urlHelp')}
			</p>
		</div>

		<div>
			<label class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
				{$t('subscription.color')}
			</label>
			<ColorPicker bind:value={colorOverride} />
		</div>

		<div>
			<label for="refresh" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
				{$t('subscription.refreshInterval')}
			</label>
			<select
				id="refresh"
				bind:value={refreshIntervalMinutes}
				class="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
			>
				{#each refreshOptions as option}
					<option value={option.value}>{option.label}</option>
				{/each}
			</select>
		</div>
	</form>

	{#snippet footer()}
		<Button variant="ghost" onclick={closeModal}>{$t('common.cancel')}</Button>
		<Button onclick={handleSubmit} loading={saving} disabled={!name.trim() || !url.trim()}>
			{editingSubscription ? $t('common.save') : $t('common.add')}
		</Button>
	{/snippet}
</Modal>
