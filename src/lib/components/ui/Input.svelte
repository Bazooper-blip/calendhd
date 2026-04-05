<script lang="ts">
	import { cn } from '$utils';

	interface Props {
		type?: 'text' | 'email' | 'password' | 'number' | 'tel' | 'url' | 'search' | 'date' | 'time';
		value?: string;
		placeholder?: string;
		disabled?: boolean;
		readonly?: boolean;
		required?: boolean;
		name?: string;
		id?: string;
		autofocus?: boolean;
		error?: string;
		class?: string;
		oninput?: (e: Event) => void;
		onchange?: (e: Event) => void;
	}

	let {
		type = 'text',
		value = $bindable(''),
		placeholder = '',
		disabled = false,
		readonly = false,
		required = false,
		name,
		id,
		autofocus = false,
		error,
		class: className = '',
		oninput,
		onchange
	}: Props = $props();

	const baseStyles =
		'w-full px-3 py-2 rounded-lg border bg-white dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100 placeholder:text-neutral-400 dark:placeholder:text-neutral-500 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed';

	const errorStyles = 'border-red-400 focus:ring-red-500';
	const normalStyles = 'border-neutral-200 dark:border-neutral-600 hover:border-neutral-300 dark:hover:border-neutral-500';
</script>

<div class="flex flex-col gap-1">
	<!-- svelte-ignore a11y_autofocus -->
	<input
		{type}
		{name}
		{id}
		{placeholder}
		{disabled}
		{readonly}
		{required}
		{autofocus}
		bind:value
		class={cn(baseStyles, error ? errorStyles : normalStyles, className)}
		{oninput}
		{onchange}
	/>
	{#if error}
		<p class="text-sm text-red-500">{error}</p>
	{/if}
</div>
