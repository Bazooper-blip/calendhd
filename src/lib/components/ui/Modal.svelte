<script lang="ts">
	import { Dialog } from 'bits-ui';

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

	const sizes: Record<string, string> = {
		sm: 'max-w-sm',
		md: 'max-w-lg',
		lg: 'max-w-2xl',
		full: 'max-w-full mx-4'
	};

	function handleOpenChange(isOpen: boolean) {
		open = isOpen;
		if (!isOpen) {
			onclose?.();
		}
	}
</script>

<Dialog.Root bind:open onOpenChange={handleOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay
			class="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm"
		/>
		<Dialog.Content
			class="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none"
			trapFocus={true}
		>
			<div
				class={`w-full max-h-[90vh] overflow-y-auto bg-white dark:bg-neutral-800 rounded-xl shadow-lg pointer-events-auto ${sizes[size]}`}
			>
				{#if title}
					<div class="flex items-center justify-between px-6 py-4 border-b border-neutral-100 dark:border-neutral-700">
						<Dialog.Title class="text-lg font-semibold text-neutral-800 dark:text-neutral-100">{title}</Dialog.Title>
						<Dialog.Close
							class="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors"
						>
							<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
								<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
							</svg>
						</Dialog.Close>
					</div>
				{/if}

				<div class="px-6 py-4">
					{@render children?.()}
				</div>

				{#if footer}
					<div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-neutral-100 dark:border-neutral-700 bg-neutral-50 dark:bg-neutral-800/50">
						{@render footer()}
					</div>
				{/if}
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>
