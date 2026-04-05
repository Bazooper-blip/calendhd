<script lang="ts">
	import { cn } from '$utils';

	interface Props {
		checked?: boolean;
		disabled?: boolean;
		label?: string;
		description?: string;
		class?: string;
		onchange?: (checked: boolean) => void;
	}

	let {
		checked = $bindable(false),
		disabled = false,
		label,
		description,
		class: className = '',
		onchange
	}: Props = $props();

	function toggle() {
		if (disabled) return;
		checked = !checked;
		onchange?.(checked);
	}
</script>

<div class={cn('flex items-start gap-3', className)}>
	<button
		type="button"
		role="switch"
		aria-checked={checked}
		aria-label={label || 'Toggle'}
		{disabled}
		onclick={toggle}
		class={cn(
			'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
			checked ? 'bg-primary-500' : 'bg-neutral-200 dark:bg-neutral-600'
		)}
	>
		<span
			class={cn(
				'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform',
				checked ? 'translate-x-5' : 'translate-x-0'
			)}
		></span>
	</button>

	{#if label || description}
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="flex flex-col cursor-pointer" onclick={toggle}>
			{#if label}
				<span class="text-sm font-medium text-neutral-800 dark:text-neutral-100">{label}</span>
			{/if}
			{#if description}
				<span class="text-sm text-neutral-500 dark:text-neutral-400">{description}</span>
			{/if}
		</div>
	{/if}
</div>
