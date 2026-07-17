<script lang="ts">
	import { formatDayOfWeek, isToday } from '$utils';
	import AgendaView from './AgendaView.svelte';

	let { date = $bindable(new Date()) }: { date?: Date } = $props();
</script>

<div class="flex flex-col h-full">
	<!-- Day header -->
	<div class="flex-shrink-0 border-b border-neutral-100 dark:border-neutral-800 px-4 py-2">
		<div class="flex items-center gap-2">
			<span class="text-sm text-neutral-500 dark:text-neutral-400">{formatDayOfWeek(date)}</span>
			<span
				class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold {isToday(date)
					? 'bg-primary-500 text-white'
					: 'text-neutral-800 dark:text-neutral-100'}"
			>
				{date.getDate()}
			</span>
		</div>
	</div>

	<AgendaView {date} />
</div>
