<script lang="ts">
	import { cn } from '$utils';

	interface Option {
		value: string;
		label: string;
		disabled?: boolean;
	}

	interface Props {
		options: Option[];
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		required?: boolean;
		name?: string;
		id?: string;
		error?: string;
		class?: string;
		onchange?: (e: Event) => void;
	}

	let {
		options,
		value = $bindable(''),
		placeholder = 'Select an option',
		disabled = false,
		required = false,
		name,
		id,
		error,
		class: className = '',
		onchange
	}: Props = $props();

	const baseStyles =
		'w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed appearance-none cursor-pointer';

	const errorStyles = 'border-red-400 focus:ring-red-500';
	const normalStyles = 'border-neutral-200 dark:border-neutral-600 hover:border-neutral-300 dark:hover:border-neutral-500';
</script>

<div class="relative flex flex-col gap-1">
	<select
		{name}
		{id}
		{disabled}
		{required}
		bind:value
		class={cn(baseStyles, error ? errorStyles : normalStyles, className)}
		{onchange}
	>
		{#if placeholder}
			<option value="" disabled>{placeholder}</option>
		{/if}
		{#each options as option}
			<option value={option.value} disabled={option.disabled}>
				{option.label}
			</option>
		{/each}
	</select>

	<!-- Dropdown arrow -->
	<div class="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
		<svg class="w-4 h-4 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
		</svg>
	</div>

	{#if error}
		<p class="text-sm text-red-500">{error}</p>
	{/if}
</div>
