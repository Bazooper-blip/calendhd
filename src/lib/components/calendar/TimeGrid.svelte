<script lang="ts">
	import { settingsStore } from '$stores';
	import { formatTime, getHoursInDay } from '$utils';

	interface Props {
		date: Date;
	}

	let { date }: Props = $props();

	const hours = getHoursInDay(date);
	const format24h = $derived(settingsStore.timeFormat === '24h');
</script>

<div class="relative h-full">
	<!-- Hour labels -->
	{#each hours as hour, i}
		<div
			class="absolute left-0 right-0 border-t border-neutral-100"
			style="top: {(i / 24) * 100}%"
		>
			<span class="absolute -top-3 left-2 text-xs text-neutral-400 bg-white px-1">
				{formatTime(hour, format24h)}
			</span>
		</div>
	{/each}

	<!-- Half-hour lines -->
	{#each hours as _, i}
		<div
			class="absolute left-16 right-0 border-t border-neutral-50"
			style="top: {((i + 0.5) / 24) * 100}%"
		></div>
	{/each}
</div>
