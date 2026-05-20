<script lang="ts">
	import { goto } from '$app/navigation';
	import { auth } from '$stores';
	import { _ } from '$lib/i18n';
	import { Button, Input } from '$components/ui';
	import { toast } from 'svelte-sonner';

	let email = $state('');
	let password = $state('');
	let submitting = $state(false);
	let error = $state<string | null>(null);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!email || !password || submitting) return;
		submitting = true;
		error = null;
		try {
			await auth.signIn(email.trim(), password);
			toast.success($_('account.signedInToast'));
			goto('/');
		} catch (err) {
			error = err instanceof Error ? err.message : $_('account.signInFailed');
		} finally {
			submitting = false;
		}
	}

	async function continueAsGuest() {
		await auth.useGuest();
		goto('/');
	}
</script>

<div class="h-full overflow-y-auto px-4 py-12 flex items-start justify-center">
	<div class="w-full max-w-sm bg-white dark:bg-neutral-800 rounded-2xl shadow-sm border border-neutral-100 dark:border-neutral-700 p-8 space-y-6">
		<header class="text-center space-y-1">
			<h1 class="text-xl font-semibold text-neutral-800 dark:text-neutral-100">
				{$_('account.signInTitle')}
			</h1>
			<p class="text-sm text-neutral-500 dark:text-neutral-400">
				{$_('account.signInSubtitle')}
			</p>
		</header>

		<form onsubmit={handleSubmit} class="space-y-4">
			<div>
				<label for="login-email" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
					{$_('account.email')}
				</label>
				<Input
					id="login-email"
					type="email"
					bind:value={email}
					required
					autofocus
					placeholder="you@example.com"
				/>
			</div>

			<div>
				<label for="login-password" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
					{$_('account.password')}
				</label>
				<Input
					id="login-password"
					type="password"
					bind:value={password}
					required
				/>
			</div>

			{#if error}
				<p class="text-sm text-red-500" role="alert">{error}</p>
			{/if}

			<Button type="submit" class="w-full" loading={submitting} disabled={!email || !password}>
				{$_('account.signIn')}
			</Button>
		</form>

		<div class="text-center">
			<button
				type="button"
				class="text-sm text-neutral-500 dark:text-neutral-400 hover:text-primary-600 dark:hover:text-primary-400 underline-offset-2 hover:underline"
				onclick={continueAsGuest}
			>
				{$_('account.continueAsGuest')}
			</button>
		</div>
	</div>
</div>
