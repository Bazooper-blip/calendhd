<script lang="ts">
	import { goto } from '$app/navigation';
	import { settingsStore } from '$stores';

	// Redirect to default calendar view
	$effect(() => {
		const defaultView = settingsStore.defaultView;
		goto(`/calendar/${defaultView}`, { replaceState: true });
	});
</script>

<div class="flex items-center justify-center h-full">
	<div class="text-center">
		<div class="w-12 h-12 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin mx-auto"></div>
		<p class="mt-4 text-neutral-600">Loading calendar...</p>
	</div>
</div>
