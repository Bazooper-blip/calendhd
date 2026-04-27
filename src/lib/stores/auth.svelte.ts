import { browser } from '$app/environment';
import {
	getCurrentUser,
	getPocketBase,
	onAuthChange,
	signInWithEmail
} from '$api/pocketbase';
import type { User } from '$types';

// The singleton-init hook on the server creates the user and rotates its
// password to whatever was generated at deploy time; we fetch credentials
// from /api/calendhd/bootstrap rather than hardcoding them in the bundle.
async function fetchSingletonCredentials(): Promise<{ email: string; password: string }> {
	const res = await fetch('/api/calendhd/bootstrap');
	if (!res.ok) throw new Error(`bootstrap returned ${res.status}`);
	return res.json();
}

function createAuthStore() {
	let user = $state<User | null>(null);
	let loading = $state(true);

	async function autoLogin() {
		// Check if there's a stored session and verify it against the server
		const existing = getCurrentUser();
		if (existing) {
			try {
				// Validate the token with the server — this catches stale tokens
				// from previous database resets or credential rotations
				await getPocketBase().collection('users').authRefresh();
				user = getCurrentUser();
				console.log('[auth] Verified session for user:', user?.id);
				loading = false;
				return;
			} catch {
				// Token is stale or invalid — clear it and proceed with fresh login
				console.log('[auth] Stored session invalid, logging in fresh');
				getPocketBase().authStore.clear();
			}
		}

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
			console.log('[auth] Signed in as:', user.id);
		} catch (loginError) {
			console.error('[auth] login failed:', loginError);
		}
		loading = false;
	}

	let unsubscribeAuth: (() => void) | null = null;

	if (browser) {
		// Listen for auth changes
		unsubscribeAuth = onAuthChange((newUser) => {
			user = newUser;
		});

		// Auto-login on startup
		autoLogin();
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
		}
	};
}

export const auth = createAuthStore();
