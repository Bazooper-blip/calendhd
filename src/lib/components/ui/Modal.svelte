<script lang="ts">
	import { cn } from '$utils';
	import { browser } from '$app/environment';

	interface Props {
		open?: boolean;
		title?: string;
		size?: 'sm' | 'md' | 'lg' | 'full';
		onclose?: () => void;
		children?: import('svelte').Snippet;
		footer?: import('svelte').Snippet;
	}

	let {
		open = $bindable(false),
		title = '',
		size = 'md',
		onclose,
		children,
		footer
	}: Props = $props();

	const sizes = {
		sm: 'max-w-sm',
		md: 'max-w-lg',
		lg: 'max-w-2xl',
		full: 'max-w-full mx-4'
	};

	function handleBackdropClick(e: MouseEvent) {
		if (e.target === e.currentTarget) {
			close();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			close();
		}
	}

	function close() {
		open = false;
		onclose?.();
	}

	// Prevent body scroll when modal is open
	$effect(() => {
		if (browser) {
			if (open) {
				document.body.style.overflow = 'hidden';
			} else {
				document.body.style.overflow = '';
			}
		}
	});
</script>

<svelte:window onkeydown={handleKeydown} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
		onclick={handleBackdropClick}
	>
		<div
			class={cn(
				'w-full max-h-[90vh] overflow-y-auto bg-white rounded-xl shadow-lg',
				sizes[size]
			)}
			role="dialog"
			aria-modal="true"
			aria-labelledby={title ? 'modal-title' : undefined}
		>
			{#if title}
				<div class="flex items-center justify-between px-6 py-4 border-b border-neutral-100">
					<h2 id="modal-title" class="text-lg font-semibold text-neutral-800">{title}</h2>
					<button
						type="button"
						onclick={close}
						class="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 hover:bg-neutral-100 transition-colors"
						aria-label="Close"
					>
						<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>
			{/if}

			<div class="px-6 py-4">
				{@render children?.()}
			</div>

			{#if footer}
				<div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-100 bg-neutral-50">
					{@render footer()}
				</div>
			{/if}
		</div>
	</div>
{/if}
