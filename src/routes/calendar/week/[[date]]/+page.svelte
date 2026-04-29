<script lang="ts">
	import { page } from '$app/stores';
	import { calendar } from '$stores';
	import { WeekView } from '$components/calendar';
	import { parseISO, isValid } from 'date-fns';

	// Parse date from URL or use current
	const dateParam = $derived($page.params.date);
	const currentDate = $derived(() => {
		if (dateParam) {
			const parsed = parseISO(dateParam);
			if (isValid(parsed)) return parsed;
		}
		return calendar.currentDate;
	});

	// Sync view type
	$effect(() => {
		if (calendar.viewType !== 'week') {
			calendar.setViewType('week');
		}
	});

	// Sync date from URL
	$effect(() => {
		const date = currentDate();
		if (date.getTime() !== calendar.currentDate.getTime()) {
			calendar.setDate(date);
		}
	});
</script>

<div class="h-full">
	<WeekView date={currentDate()} />
</div>
