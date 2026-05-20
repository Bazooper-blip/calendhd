import { browser } from '$app/environment';
import {
	getCurrentUser,
	getPocketBase,
	onAuthChange,
	registerUser as apiRegisterUser,
	signInWithEmail,
	signOut as apiSignOut,
	isSingletonUser,
	SINGLETON_EMAIL
} from '$api/pocketbase';
import type { User } from '$types';

// The singleton-init hook on the server creates the guest user and rotates
// its password to whatever was generated at deploy time; we fetch credentials
// from /api/calendhd/bootstrap rather than hardcoding them in the bundle.
async function fetchSingletonCredentials(): Promise<{ email: string; password: string }> {
	const res = await fetch('/api/calendhd/bootstrap');
	if (!res.ok) throw new Error(`bootstrap returned ${res.status}`);
	return res.json();
}

function createAuthStore() {
	let user = $state<User | null>(null);
	let loading = $state(true);
	let lastError = $state<string | null>(null);

	// Restore an existing session if there is one, otherwise bootstrap as guest.
	// Bootstrap NEVER overwrites a valid existing session — that's what lets a
	// named user stay signed in across page reloads.
	async function restoreOrBootstrap() {
		loading = true;
		const existing = getCurrentUser();
		if (existing) {
			try {
				await getPocketBase().collection('users').authRefresh();
				user = getCurrentUser();
				loading = false;
				return;
			} catch {
				// Stale token (e.g. server-side password rotation, account deleted).
				// Clear and fall through to guest bootstrap.
				getPocketBase().authStore.clear();
			}
		}
		await bootstrapAsGuest();
	}

	async function bootstrapAsGuest() {
		let creds;
		try {
			creds = await fetchSingletonCredentials();
		} catch (err) {
			console.error('[auth] failed to fetch bootstrap credentials:', err);
			loading = false;
			return;
		}

		try {
			user = await signInWithEmail(creds.email, creds.password);
		} catch (loginError) {
			console.error('[auth] guest login failed:', loginError);
		}
		loading = false;
	}

	if (browser) {
		// Listen for auth changes (store is a singleton — never unsubscribed)
		onAuthChange((newUser) => {
			user = newUser;
		});
		restoreOrBootstrap();
	}

	return {
		get user() {
			return user;
		},
		get loading() {
			return loading;
		},
		get isAuthenticated() {
			return !!user;
		},
		get isGuest() {
			return isSingletonUser(user);
		},
		get displayName() {
			if (!user) return '';
			if (isSingletonUser(user)) return 'Guest';
			return user.name || user.email || '';
		},
		get lastError() {
			return lastError;
		},

		// Sign in as a named user. Throws on failure. The PocketBase authStore
		// listener updates `user` reactively.
		async signIn(email: string, password: string): Promise<void> {
			lastError = null;
			try {
				user = await signInWithEmail(email, password);
			} catch (err) {
				lastError = err instanceof Error ? err.message : 'Sign in failed';
				throw err;
			}
		},

		// Register a new named user. Does NOT switch the active session — the
		// caller can decide whether to sign in as the new user afterwards.
		async register(name: string, email: string, password: string): Promise<User> {
			if (email === SINGLETON_EMAIL) {
				throw new Error('That email is reserved for the guest account');
			}
			lastError = null;
			try {
				return await apiRegisterUser(name, email, password);
			} catch (err) {
				lastError = err instanceof Error ? err.message : 'Account creation failed';
				throw err;
			}
		},

		// Sign out of the named-user session and fall back to guest mode.
		async signOut(): Promise<void> {
			apiSignOut();
			await bootstrapAsGuest();
		},

		// Re-bootstrap as guest. Useful from the login screen's "continue as
		// guest" link when something has confused the session state.
		async useGuest(): Promise<void> {
			apiSignOut();
			await bootstrapAsGuest();
		}
	};
}

export const auth = createAuthStore();
