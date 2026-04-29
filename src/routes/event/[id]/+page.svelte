<script lang="ts">
	import { t } from 'svelte-i18n';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { calendar } from '$stores';
	import { getEvent, updateEvent, deleteEvent } from '$api/pocketbase';
	import { EventForm } from '$components/event';
	import { Button, Modal } from '$components/ui';
	import { toast } from 'svelte-sonner';
	import { format, parseTimeToDate } from '$utils';
	import type { CalendarEvent, EventFormData } from '$types';

	const eventId = $derived($page.params.id);

	let event = $state<CalendarEvent | null>(null);
	let loading = $state(true);
	let saving = $state(false);
	let showDeleteModal = $state(false);

	// Load event
	$effect(() => {
		loadEvent();
	});

	async function loadEvent() {
		if (!eventId) return;
		loading = true;
		try {
			event = await getEvent(eventId);
		} catch (error) {
			toast.error($t('errors.notFound'));
			goto('/');
		} finally {
			loading = false;
		}
	}

	async function handleSubmit(data: EventFormData) {
		if (!event) return;
		saving = true;

		try {
			const startTime = data.is_all_day
				? new Date(data.start_date).toISOString()
				: parseTimeToDate(data.start_date, data.start_time || '09:00').toISOString();

			let endTime: string | undefined;
			if (!data.is_all_day && data.end_date && data.end_time) {
				endTime = parseTimeToDate(data.end_date, data.end_time).toISOString();
			}

			await updateEvent(event.id, {
				title: data.title,
				description: data.description,
				first_step: data.first_step,
				start_time: startTime,
				end_time: endTime,
				is_all_day: data.is_all_day,
				is_task: data.is_task,
				category: data.category,
				color_override: data.color_override,
				icon: data.icon,
				reminders: data.reminders,
				recurrence_rule: data.recurrence_rule
			});

			toast.success($t('event.updated'));
			goto('/');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : $t('errors.updateEvent'));
		} finally {
			saving = false;
		}
	}

	async function handleDelete() {
		if (!event) return;

		try {
			await deleteEvent(event.id);
			toast.success($t('event.deleted'));
			goto('/');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : $t('errors.deleteEvent'));
		}
	}

	function handleCancel() {
		goto('/');
	}

	// Convert event to form data
	const initialData = $derived(() => {
		if (!event) return {};

		const start = new Date(event.start_time);
		const end = event.end_time ? new Date(event.end_time) : null;

		return {
			title: event.title,
			description: event.description,
			first_step: event.first_step,
			start_date: format(start, 'yyyy-MM-dd'),
			start_time: event.is_all_day ? undefined : format(start, 'HH:mm'),
			end_date: end ? format(end, 'yyyy-MM-dd') : undefined,
			end_time: end && !event.is_all_day ? format(end, 'HH:mm') : undefined,
			is_all_day: event.is_all_day,
			category: event.category,
			color_override: event.color_override,
			icon: event.icon,
			reminders: event.reminders,
			recurrence_rule: event.recurrence_rule
		};
	});
</script>

<div class="h-full overflow-y-auto">
	<div class="max-w-2xl mx-auto px-4 py-6">
		{#if loading}
			<div class="flex items-center justify-center h-64">
				<div class="w-8 h-8 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin"></div>
			</div>
		{:else if event}
			<div class="flex items-center justify-between mb-6">
				<h1 class="text-2xl font-bold text-neutral-800 dark:text-neutral-100">{$t('event.edit')}</h1>
				<Button variant="danger" size="sm" onclick={() => (showDeleteModal = true)}>
					{$t('common.delete')}
				</Button>
			</div>

			<div class="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700 p-6">
				<EventForm
					initialData={initialData()}
					onsubmit={handleSubmit}
					oncancel={handleCancel}
					loading={saving}
				/>
			</div>
		{/if}
	</div>
</div>

<!-- Delete confirmation modal -->
<Modal bind:open={showDeleteModal} title={$t('event.delete')} size="sm">
	<p class="text-neutral-600">
		{$t('event.deleteConfirm')}
	</p>

	{#snippet footer()}
		<Button variant="ghost" onclick={() => (showDeleteModal = false)}>
			{$t('common.cancel')}
		</Button>
		<Button variant="danger" onclick={handleDelete}>
			{$t('common.delete')}
		</Button>
	{/snippet}
</Modal>
