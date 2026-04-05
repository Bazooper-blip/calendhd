<script lang="ts">
	import { browser } from '$app/environment';
	import { isToday } from '$utils';

	let { date }: { date: Date } = $props();

	let now = $state(new Date());

	// Calculate day progress percentage (based on waking hours 6am-10pm)
	const dayProgress = $derived(() => {
		if (!isToday(date)) return null;

		const hours = now.getHours();
		const minutes = now.getMinutes();
		const currentMinutes = hours * 60 + minutes;

		// Waking hours: 6am (360 min) to 10pm (1320 min) = 960 minutes
		const startOfDay = 6 * 60; // 6am
		const endOfDay = 22 * 60; // 10pm
		const wakingMinutes = endOfDay - startOfDay;

		if (currentMinutes < startOfDay) return 0;
		if (currentMinutes > endOfDay) return 100;

		return Math.round(((currentMinutes - startOfDay) / wakingMinutes) * 100);
	});

	// Update every minute
	$effect(() => {
		if (!browser) return;

		const interval = setInterval(() => {
			now = new Date();
		}, 60000);
		return () => clearInterval(interval);
	});
</script>

{#if dayProgress() !== null}
	<div class="flex items-center gap-3 px-4 py-2 bg-white border-b border-neutral-100">
		<span class="text-xs text-neutral-500 w-20">Day progress</span>
		<div class="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden">
			<div
				class="h-full bg-gradient-to-r from-primary-400 to-primary-500 rounded-full transition-all duration-1000"
				style="width: {dayProgress()}%"
			></div>
		</div>
		<span class="text-xs font-medium text-neutral-600 w-10 text-right">{dayProgress()}%</span>
	</div>
{/if}
