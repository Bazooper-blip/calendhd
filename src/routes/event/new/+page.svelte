<script lang="ts">
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { calendar } from '$stores';
	import { EventForm } from '$components/event';
	import { toast } from 'svelte-sonner';
	import { parseTimeToDate } from '$utils';
	import type { EventFormData } from '$types';

	let loading = $state(false);

	// Pre-fill from query string (used by brain-dump's "Schedule" action)
	const initialData = $derived.by(() => {
		const url = $page.url;
		const title = url.searchParams.get('title') ?? '';
		const notes = url.searchParams.get('notes') ?? '';
		return title || notes ? { title, description: notes || undefined } : {};
	});

	async function handleSubmit(data: EventFormData) {
		loading = true;

		try {
			const startTime = data.is_all_day
				? new Date(data.start_date).toISOString()
				: parseTimeToDate(data.start_date, data.start_time || '09:00').toISOString();

			let endTime: string | undefined;
			if (!data.is_all_day && data.end_date && data.end_time) {
				endTime = parseTimeToDate(data.end_date, data.end_time).toISOString();
			}

			await calendar.createEvent({
				title: data.title,
				description: data.description,
				first_step: data.first_step,
				start_time: startTime,
				end_time: endTime,
				is_all_day: data.is_all_day,
				is_task: data.is_task,
				category: data.category,
				template: data.template,
				color_override: data.color_override,
				icon: data.icon,
				reminders: data.reminders,
				recurrence_rule: data.recurrence_rule
			});

			toast.success($t('event.created'));
			goto('/');
		} catch (error) {
			toast.error(error instanceof Error ? error.message : $t('errors.createEvent'));
		} finally {
			loading = false;
		}
	}

	function handleCancel() {
		goto('/');
	}
</script>

<div class="h-full overflow-y-auto">
	<div class="max-w-2xl mx-auto px-4 py-6">
		<h1 class="text-2xl font-bold text-neutral-800 dark:text-neutral-100 mb-6">{$t('event.create')}</h1>

		<div class="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700 p-6">
			<EventForm
				{initialData}
				onsubmit={handleSubmit}
				oncancel={handleCancel}
				{loading}
			/>
		</div>
	</div>
</div>
