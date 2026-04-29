<script lang="ts">
	import { cn } from '$utils';
	import type { Component } from 'svelte';

	interface Props {
		icon: string;
		size?: 'sm' | 'md' | 'lg';
		class?: string;
	}

	let { icon, size = 'md', class: className }: Props = $props();

	let LucideComponent = $state<Component<any> | null>(null);

	const lucideSizeClasses: Record<string, string> = {
		sm: 'w-3 h-3',
		md: 'w-3.5 h-3.5',
		lg: 'w-4.5 h-4.5'
	};

	const emojiSizeClasses: Record<string, string> = {
		sm: 'text-xs leading-none',
		md: 'text-sm leading-none',
		lg: 'text-base leading-none'
	};

	function kebabToPascal(name: string): string {
		return name
			.split('-')
			.map((part) => {
				// If the part is purely numeric, keep as-is (e.g. "2" stays "2")
				if (/^\d+$/.test(part)) return part;
				return part.charAt(0).toUpperCase() + part.slice(1);
			})
			.join('');
	}

	const isLucide = $derived(icon?.startsWith('lucide:') ?? false);
	const lucideName = $derived(isLucide ? icon.slice(7) : '');

	$effect(() => {
		if (!isLucide || !lucideName) {
			LucideComponent = null;
			return;
		}

		const name = lucideName;
		const pascalName = kebabToPascal(name);

		import('lucide-svelte')
			.then((mod: Record<string, any>) => {
				// Only update if the name hasn't changed
				if (lucideName === name) {
					LucideComponent = mod[pascalName] ?? null;
				}
			})
			.catch(() => {
				if (lucideName === name) {
					LucideComponent = null;
				}
			});
	});
</script>

{#if icon}
	{#if isLucide}
		{#if LucideComponent}
			{@const Icon = LucideComponent}
			<Icon
				class={cn('flex-shrink-0', lucideSizeClasses[size], className)}
			/>
		{/if}
	{:else}
		<span
			class={cn('flex-shrink-0', emojiSizeClasses[size], className)}
			aria-hidden="true"
		>{icon}</span>
	{/if}
{/if}
