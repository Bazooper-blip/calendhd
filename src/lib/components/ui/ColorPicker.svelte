<script lang="ts">
	import { cn, getContrastColor } from '$utils';

	interface Props {
		value?: string;
		colors?: string[];
		class?: string;
		onchange?: (color: string) => void;
	}

	const defaultColors = [
		'#7BA7BC', // blue
		'#7C9885', // green (sage)
		'#9A88B5', // purple (lavender)
		'#E8A383', // orange (peach)
		'#D4A5A5', // pink
		'#D4C97A', // yellow
		'#7ABCB4', // teal
		'#C9898A', // red (soft)
		'#8B7355', // brown
		'#6B7B8C' // slate
	];

	let {
		value = $bindable(defaultColors[1]),
		colors = defaultColors,
		class: className = '',
		onchange
	}: Props = $props();

	function selectColor(color: string) {
		value = color;
		onchange?.(color);
	}
</script>

<div class={cn('flex flex-wrap gap-2', className)}>
	{#each colors as color}
		<button
			type="button"
			onclick={() => selectColor(color)}
			class={cn(
				'w-8 h-8 rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500',
				value === color ? 'ring-2 ring-offset-2 ring-neutral-800 scale-110' : 'hover:scale-105'
			)}
			style="background-color: {color}"
			aria-label="Select color {color}"
		>
			{#if value === color}
				<svg
					class="w-4 h-4 mx-auto"
					fill="none"
					viewBox="0 0 24 24"
					stroke={getContrastColor(color)}
					stroke-width="3"
				>
					<path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
				</svg>
			{/if}
		</button>
	{/each}
</div>
