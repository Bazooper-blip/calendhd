<script lang="ts">
	import { goto } from '$app/navigation';
	import { auth } from '$stores';
	import { _ } from '$lib/i18n';
	import { Button, Input } from '$components/ui';
	import { toast } from 'svelte-sonner';

	let showRegister = $state(false);
	let regName = $state('');
	let regEmail = $state('');
	let regPassword = $state('');
	let regConfirm = $state('');
	let registering = $state(false);
	let regError = $state<string | null>(null);
	let signingOut = $state(false);

	async function handleSignOut() {
		signingOut = true;
		try {
			await auth.signOut();
			toast.success($_('account.signedOutToast'));
		} finally {
			signingOut = false;
		}
	}

	async function handleRegister(e: Event) {
		e.preventDefault();
		if (registering) return;
		regError = null;

		if (regPassword.length < 8) {
			regError = $_('account.passwordTooShort');
			return;
		}
		if (regPassword !== regConfirm) {
			regError = $_('account.passwordMismatch');
			return;
		}

		registering = true;
		try {
			await auth.register(regName.trim(), regEmail.trim(), regPassword);
			// Switch session to the newly-created user so this device starts
			// using its own settings immediately.
			await auth.signIn(regEmail.trim(), regPassword);
			toast.success($_('account.createdToast'));
			showRegister = false;
			regName = '';
			regEmail = '';
			regPassword = '';
			regConfirm = '';
		} catch (err) {
			regError = err instanceof Error ? err.message : $_('account.createFailed');
		} finally {
			registering = false;
		}
	}
</script>

<section class="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700 p-6">
	<h2 class="text-lg font-semibold text-neutral-800 dark:text-neutral-100 mb-4">{$_('account.title')}</h2>

	<div class="space-y-4">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<p class="text-sm font-medium text-neutral-700 dark:text-neutral-300">
					{auth.isGuest ? $_('account.guestLabel') : auth.displayName}
				</p>
				<p class="text-xs text-neutral-500 dark:text-neutral-400 truncate">
					{#if auth.isGuest}
						{$_('account.guestDescription')}
					{:else}
						{auth.user?.email}
					{/if}
				</p>
			</div>
			{#if auth.isGuest}
				<Button variant="secondary" size="sm" onclick={() => goto('/login')}>
					{$_('account.signIn')}
				</Button>
			{:else}
				<Button variant="secondary" size="sm" loading={signingOut} onclick={handleSignOut}>
					{$_('account.signOut')}
				</Button>
			{/if}
		</div>

		{#if auth.isGuest}
			{#if !showRegister}
				<button
					type="button"
					class="text-sm text-primary-600 dark:text-primary-400 hover:underline"
					onclick={() => (showRegister = true)}
				>
					{$_('account.createDeviceAccount')}
				</button>
			{:else}
				<form onsubmit={handleRegister} class="space-y-3 pt-3 border-t border-neutral-100 dark:border-neutral-700">
					<p class="text-xs text-neutral-500 dark:text-neutral-400">
						{$_('account.createDescription')}
					</p>
					<div>
						<label for="reg-name" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
							{$_('account.name')}
						</label>
						<Input id="reg-name" type="text" bind:value={regName} required />
					</div>
					<div>
						<label for="reg-email" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
							{$_('account.email')}
						</label>
						<Input id="reg-email" type="email" bind:value={regEmail} required placeholder="you@example.com" />
					</div>
					<div>
						<label for="reg-password" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
							{$_('account.password')}
						</label>
						<Input id="reg-password" type="password" bind:value={regPassword} required />
					</div>
					<div>
						<label for="reg-confirm" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
							{$_('account.passwordConfirm')}
						</label>
						<Input id="reg-confirm" type="password" bind:value={regConfirm} required />
					</div>

					{#if regError}
						<p class="text-sm text-red-500" role="alert">{regError}</p>
					{/if}

					<div class="flex items-center gap-2">
						<Button type="submit" loading={registering}>
							{$_('account.create')}
						</Button>
						<Button
							type="button"
							variant="ghost"
							onclick={() => {
								showRegister = false;
								regError = null;
							}}
						>
							{$_('common.cancel')}
						</Button>
					</div>
				</form>
			{/if}
		{/if}
	</div>
</section>
