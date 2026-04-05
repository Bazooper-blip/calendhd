import { browser } from '$app/environment';
import {
	getCurrentUser,
	getPocketBase,
	onAuthChange,
	signInWithEmail,
	signUpWithEmail
} from '$api/pocketbase';
import type { User } from '$types';

const SINGLETON_EMAIL = 'home@calendhd.local';
const SINGLETON_PASSWORD = 'calendhd-home-2024';
const SINGLETON_NAME = 'Home';

function createAuthStore() {
	let user = $state<User | null>(null);
	let loading = $state(true);

	async function autoLogin() {
		// Check if there's a stored session and verify it against the server
		const existing = getCurrentUser();
		if (existing) {
			try {
				// Validate the token with the server — this catches stale tokens
				// from previous database resets or credential changes
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

		try {
			user = await signInWithEmail(SINGLETON_EMAIL, SINGLETON_PASSWORD);
			console.log('[auth] Signed in as:', user.id);
		} catch (loginError) {
			// User doesn't exist yet — create it
			try {
				user = await signUpWithEmail(SINGLETON_EMAIL, SINGLETON_PASSWORD, SINGLETON_NAME);
				console.log('[auth] Created and signed in as:', user.id);
			} catch (signupError) {
				// User might have been created by another tab — retry login
				try {
					user = await signInWithEmail(SINGLETON_EMAIL, SINGLETON_PASSWORD);
					console.log('[auth] Retry login succeeded:', user.id);
				} catch (retryError) {
					console.error('[auth] All login attempts failed:', retryError);
				}
			}
		}
		loading = false;
	}

	if (browser) {
		// Listen for auth changes
		onAuthChange((newUser) => {
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
