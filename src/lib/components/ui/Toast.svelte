<script lang="ts" module>
	import { toast as sonnerToast } from 'svelte-sonner';

	type ToastType = 'success' | 'error' | 'info' | 'warning';

	// Wrapper function to maintain backward compatibility with existing code
	export function toast(
		message: string,
		type: ToastType = 'info',
		duration: number = 4000
	) {
		const options = { duration };

		switch (type) {
			case 'success':
				sonnerToast.success(message, options);
				break;
			case 'error':
				sonnerToast.error(message, options);
				break;
			case 'warning':
				sonnerToast.warning(message, options);
				break;
			case 'info':
			default:
				sonnerToast.info(message, options);
				break;
		}
	}

	// Keep these for backward compatibility (they're no-ops now since sonner manages state)
	export function removeToast(_id: string) {
		// sonner handles this automatically
	}

	export function clearToasts() {
		sonnerToast.dismiss();
	}
</script>

<script lang="ts">
	import { Toaster } from 'svelte-sonner';
</script>

<Toaster
	position="bottom-right"
	richColors
	closeButton
	toastOptions={{
		duration: 4000
	}}
/>
