<script lang="ts">
	import { t } from 'svelte-i18n';
	import { goto } from '$app/navigation';
	import { calendar } from '$stores';
	import { EventForm } from '$components/event';
	import { toast } from '$components/ui/Toast.svelte';
	import { parseTimeToDate } from '$utils';
	import type { EventFormData } from '$types';

	let loading = $state(false);

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

			toast($t('event.created'), 'success');
			goto('/');
		} catch (error) {
			toast(error instanceof Error ? error.message : $t('errors.createEvent'), 'error');
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
		<h1 class="text-2xl font-bold text-neutral-800 mb-6">{$t('event.create')}</h1>

		<div class="bg-white rounded-xl shadow-sm border border-neutral-100 p-6">
			<EventForm
				onsubmit={handleSubmit}
				oncancel={handleCancel}
				{loading}
			/>
		</div>
	</div>
</div>
