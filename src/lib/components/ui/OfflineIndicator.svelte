<script lang="ts">
	import { browser } from '$app/environment';
	import { _ } from '$lib/i18n';

	let isOnline = $state(browser ? navigator.onLine : true);
	let showBanner = $state(false);

	$effect(() => {
		if (!browser) return;

		function handleOnline() {
			isOnline = true;
			showBanner = true;
			// Hide the "back online" message after 3 seconds
			setTimeout(() => {
				showBanner = false;
			}, 3000);
		}

		function handleOffline() {
			isOnline = false;
			showBanner = true;
		}

		window.addEventListener('online', handleOnline);
		window.addEventListener('offline', handleOffline);

		return () => {
			window.removeEventListener('online', handleOnline);
			window.removeEventListener('offline', handleOffline);
		};
	});
</script>

{#if showBanner}
	<div
		class="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50 px-4 py-3 rounded-lg shadow-lg flex items-center gap-3 transition-all {isOnline
			? 'bg-green-500 text-white'
			: 'bg-amber-500 text-white'}"
	>
		{#if isOnline}
			<svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
			</svg>
			<span class="text-sm font-medium">{$_('status.online')}</span>
		{:else}
			<svg class="w-5 h-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 5.636a9 9 0 010 12.728m-3.536-3.536a4 4 0 010-5.656m-7.072 7.072a9 9 0 010-12.728m3.536 3.536a4 4 0 010 5.656" />
			</svg>
			<div>
				<p class="text-sm font-medium">{$_('status.offline')}</p>
				<p class="text-xs opacity-90">{$_('status.offlineMessage')}</p>
			</div>
		{/if}
		<button
			type="button"
			onclick={() => (showBanner = false)}
			class="ml-auto p-1 hover:bg-white/20 rounded"
			aria-label={$_('status.dismiss')}
		>
			<svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
			</svg>
		</button>
	</div>
{/if}
