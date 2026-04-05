# Singleton Instance Conversion Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove multi-user auth and household features, converting calenDHD into a shared home instance with a single auto-created user.

**Architecture:** Replace manual login/signup with auto-create-and-login using fixed credentials (`home@calendhd.local` / `calendhd-home-2024`). All internal user ID plumbing stays intact — the singleton user is a real PocketBase user. Delete household store, route, types, and form fields. Delete auth routes. Simplify layout and sidebar.

**Tech Stack:** SvelteKit (Svelte 5 runes), PocketBase, Dexie/IndexedDB, svelte-i18n, Zod, Tailwind CSS 4

---

### Task 1: Convert Auth Store to Auto-Login

**Files:**
- Modify: `src/lib/stores/auth.svelte.ts`

**Context:** The auth store is the core of the conversion. Currently it initializes by checking PocketBase's `authStore` for an existing session, and exposes `signIn()`, `signUp()`, `signOut()` methods. We replace this with an `autoLogin()` function that tries to sign in with fixed credentials, and if that fails (user doesn't exist), creates the user first then signs in.

**Step 1: Rewrite auth store**

Replace the entire contents of `src/lib/stores/auth.svelte.ts` with:

```typescript
import { browser } from '$app/environment';
import {
	getCurrentUser,
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
		// Check if already authenticated from PocketBase session
		const existing = getCurrentUser();
		if (existing) {
			user = existing;
			loading = false;
			return;
		}

		try {
			user = await signInWithEmail(SINGLETON_EMAIL, SINGLETON_PASSWORD);
		} catch {
			// User doesn't exist yet — create it
			try {
				user = await signUpWithEmail(SINGLETON_EMAIL, SINGLETON_PASSWORD, SINGLETON_NAME);
			} catch {
				// User might have been created by another tab — retry login
				user = await signInWithEmail(SINGLETON_EMAIL, SINGLETON_PASSWORD);
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
```

**Step 2: Verify no compile errors**

Run: `npx svelte-check --tsconfig ./tsconfig.json 2>&1 | head -30`

Expected: No errors related to `auth.svelte.ts`. There WILL be errors in other files that reference `auth.signIn`, `auth.signUp`, `auth.signOut`, `auth.error`, `auth.clearError` — those are fixed in later tasks.

**Step 3: Commit**

```bash
git add src/lib/stores/auth.svelte.ts
git commit -m "feat: convert auth store to auto-login singleton"
```

---

### Task 2: Delete Auth Routes

**Files:**
- Delete: `src/routes/auth/login/+page.svelte`
- Delete: `src/routes/auth/register/+page.svelte`

**Context:** These pages contain the login and registration forms. They reference `auth.signIn()`, `auth.signUp()`, `auth.error`, `auth.clearError` which no longer exist. We simply delete them.

**Step 1: Delete auth route files**

```bash
rm src/routes/auth/login/+page.svelte
rm src/routes/auth/register/+page.svelte
rmdir src/routes/auth/login
rmdir src/routes/auth/register
rmdir src/routes/auth
```

**Step 2: Commit**

```bash
git add -A src/routes/auth/
git commit -m "feat: remove auth login and register routes"
```

---

### Task 3: Delete Household Route

**Files:**
- Delete: `src/routes/household/+page.svelte`

**Context:** The household page provides full CRUD for households, invite codes, and member management. It imports `householdStore` which will be deleted in the next task.

**Step 1: Delete household route**

```bash
rm src/routes/household/+page.svelte
rmdir src/routes/household
```

**Step 2: Commit**

```bash
git add -A src/routes/household/
git commit -m "feat: remove household route"
```

---

### Task 4: Delete Household Store

**Files:**
- Delete: `src/lib/stores/household.svelte.ts`
- Modify: `src/lib/stores/index.ts`

**Context:** The household store manages all household CRUD operations. It's imported by the stores barrel, the root layout, the event form, and the sidebar. We delete the file and remove its export.

**Step 1: Delete household store file**

```bash
rm src/lib/stores/household.svelte.ts
```

**Step 2: Remove household export from barrel**

In `src/lib/stores/index.ts`, remove this line:

```typescript
export { householdStore } from './household.svelte';
```

The file should become:

```typescript
export { auth } from './auth.svelte';
export { settingsStore } from './settings.svelte';
export { calendar } from './calendar.svelte';
export type { ViewType } from './calendar.svelte';
export { categoriesStore } from './categories.svelte';
export { templatesStore } from './templates.svelte';
```

**Step 3: Commit**

```bash
git add src/lib/stores/household.svelte.ts src/lib/stores/index.ts
git commit -m "feat: remove household store"
```

---

### Task 5: Update Root Layout

**Files:**
- Modify: `src/routes/+layout.svelte`

**Context:** The root layout currently: (1) imports `householdStore`, (2) defines `publicRoutes` and redirects unauthenticated users to `/auth/login`, (3) calls `householdStore.load()` during init, (4) renders a "redirecting" fallback for unauthenticated state. We remove all of this. The auto-login happens in the auth store, so the layout just needs to wait for `auth.loading` to finish.

**Step 1: Update the script section**

In `src/routes/+layout.svelte`, make these changes:

1. Change the import from:
```typescript
import { auth, settingsStore, categoriesStore, templatesStore, calendar, householdStore } from '$stores';
```
to:
```typescript
import { auth, settingsStore, categoriesStore, templatesStore, calendar } from '$stores';
```

2. Remove these lines entirely:
```typescript
// Public routes that don't require auth
const publicRoutes = ['/auth/login', '/auth/register'];
const isPublicRoute = $derived(publicRoutes.some((r) => $page.url.pathname.startsWith(r)));
```

3. Remove the `goto` import (line 4) and `page` import (line 5) — they're no longer needed.

4. In the `$effect` that initializes data, remove `householdStore.load();` and remove the logout reset block:
```typescript
// Reset initialized flag when user logs out
if (!auth.isAuthenticated) {
    initialized = false;
}
```

5. Remove the redirect-to-login `$effect` block entirely:
```typescript
// Redirect to login if not authenticated
$effect(() => {
    if (browser && !auth.loading && !auth.isAuthenticated && !isPublicRoute) {
        goto('/auth/login');
    }
});
```

**Step 2: Update the template section**

Replace the template (everything from `{#if isPublicRoute}` through `{/if}` before the Toast) with:

```svelte
{#if auth.loading || !i18nReady}
	<!-- Loading state -->
	<div class="min-h-screen flex items-center justify-center bg-neutral-50 dark:bg-neutral-900">
		<div class="text-center">
			<div class="w-12 h-12 border-4 border-primary-200 border-t-primary-500 rounded-full animate-spin mx-auto"></div>
			<p class="mt-4 text-neutral-600 dark:text-neutral-400">Loading...</p>
		</div>
	</div>
{:else}
	<!-- Main app layout -->
	<div class="min-h-screen bg-neutral-50 dark:bg-neutral-900 flex">
		<Sidebar
			open={sidebarOpen}
			onClose={() => (sidebarOpen = false)}
		/>

		<div class="flex-1 flex flex-col min-w-0">
			<Header onMenuClick={() => (sidebarOpen = true)} />

			<main class="flex-1 overflow-hidden">
				{@render children()}
			</main>
		</div>

		<!-- Quick add FAB -->
		<QuickAdd />
	</div>
{/if}
```

**Step 3: Verify the final file compiles**

Run: `npx svelte-check --tsconfig ./tsconfig.json 2>&1 | grep "+layout.svelte"`

Expected: No errors for `+layout.svelte`.

**Step 4: Commit**

```bash
git add src/routes/+layout.svelte
git commit -m "feat: simplify layout for singleton auto-login"
```

---

### Task 6: Update Sidebar — Remove Household Nav and Logout

**Files:**
- Modify: `src/lib/components/layout/Sidebar.svelte`

**Context:** The sidebar has a "Household" nav item (line 21) and a user section at the bottom (lines 127-153) with avatar, name, email, and a logout button. We remove the household nav item and the entire user section. We also remove the `auth` import since it's no longer used.

**Step 1: Remove household from navItems**

In the `navItems` array, remove this line:
```typescript
{ href: '/household', label: $_('nav.household'), icon: 'users' },
```

**Step 2: Remove the `users` icon from the icons record**

Remove this line from the `icons` object:
```typescript
users: `<path .../>`,
```

**Step 3: Remove the auth import**

Change:
```typescript
import { auth, categoriesStore } from '$stores';
```
to:
```typescript
import { categoriesStore } from '$stores';
```

**Step 4: Remove the user section at bottom of sidebar**

Delete the entire block from `{#if auth.user}` through its closing `{/if}` (lines 127-153). This removes the avatar, name, email, and logout button.

**Step 5: Verify compiles**

Run: `npx svelte-check --tsconfig ./tsconfig.json 2>&1 | grep "Sidebar.svelte"`

Expected: No errors.

**Step 6: Commit**

```bash
git add src/lib/components/layout/Sidebar.svelte
git commit -m "feat: remove household nav and logout from sidebar"
```

---

### Task 7: Remove Household Fields from Types

**Files:**
- Modify: `src/lib/types/index.ts`

**Context:** The types file has: `Household` interface (lines 16-21), `SharedFields` interface (lines 24-27), and `SharedFields` is extended by `Category`, `Template`, and `CalendarEvent`. The form data types (`EventFormData`, `CategoryFormData`, `TemplateFormData`) also have `household?` and `is_private?` fields. We remove all of these.

**Step 1: Delete the Household interface**

Remove lines 15-21:
```typescript
// Household for sharing calendars between users
export interface Household extends BaseRecord {
	name: string;
	owner: string;
	members: string[];
	invite_code?: string;
}
```

**Step 2: Delete the SharedFields interface**

Remove lines 23-27:
```typescript
// Shared fields for household items
export interface SharedFields {
	household?: string;
	is_private?: boolean;
}
```

**Step 3: Remove SharedFields from Category, Template, CalendarEvent**

Change:
```typescript
export interface Category extends BaseRecord, SharedFields {
```
to:
```typescript
export interface Category extends BaseRecord {
```

Change:
```typescript
export interface Template extends BaseRecord, SharedFields {
```
to:
```typescript
export interface Template extends BaseRecord {
```

Change:
```typescript
export interface CalendarEvent extends BaseRecord, SharedFields {
```
to:
```typescript
export interface CalendarEvent extends BaseRecord {
```

**Step 4: Remove household/is_private from form data types**

From `EventFormData`, remove:
```typescript
	household?: string;
	is_private?: boolean;
```

From `CategoryFormData`, remove:
```typescript
	household?: string;
	is_private?: boolean;
```

From `TemplateFormData`, remove:
```typescript
	household?: string;
	is_private?: boolean;
```

**Step 5: Commit**

```bash
git add src/lib/types/index.ts
git commit -m "feat: remove household and shared fields from types"
```

---

### Task 8: Remove Household Fields from EventForm

**Files:**
- Modify: `src/lib/components/event/EventForm.svelte`

**Context:** The EventForm imports `householdStore`, has `household` and `isPrivate` state variables, derives `householdOptions`, includes them in the submit data, and renders a "Share with household" section in the template. We remove all of this.

**Step 1: Remove householdStore from import**

Change:
```typescript
import { categoriesStore, templatesStore, settingsStore, householdStore } from '$stores';
```
to:
```typescript
import { categoriesStore, templatesStore, settingsStore } from '$stores';
```

**Step 2: Remove household and isPrivate state variables**

Delete these two lines:
```typescript
let household = $state(initialData.household || householdStore.activeHousehold?.id || '');
let isPrivate = $state(initialData.is_private || false);
```

**Step 3: Remove householdOptions derived**

Delete:
```typescript
const householdOptions = $derived(
    householdStore.households.map((h) => ({
        value: h.id,
        label: h.name
    }))
);
```

**Step 4: Remove household from submit data**

In the `handleSubmit` function, remove these two lines from the `data` object:
```typescript
			household: household || undefined,
			is_private: household ? isPrivate : undefined
```

**Step 5: Remove the household sharing section from template**

Delete the entire household sharing block (lines 255-276):
```svelte
	<!-- Household sharing -->
	{#if householdOptions.length > 0}
		<div class="space-y-3 p-4 bg-neutral-50 rounded-lg">
			<div>
				<label for="household" class="block text-sm font-medium text-neutral-700 mb-1">
					{$t('household.shareWith')}
				</label>
				<Select
					id="household"
					options={[{ value: '', label: $t('household.personalOnly') }, ...householdOptions]}
					bind:value={household}
				/>
			</div>
			{#if household}
				<Toggle
					bind:checked={isPrivate}
					label={$t('household.keepPrivate')}
					description={$t('household.keepPrivateDescription')}
				/>
			{/if}
		</div>
	{/if}
```

**Step 6: Commit**

```bash
git add src/lib/components/event/EventForm.svelte
git commit -m "feat: remove household sharing from event form"
```

---

### Task 9: Remove Auth Schemas

**Files:**
- Modify: `src/lib/schemas/index.ts`

**Context:** The schemas file has `loginSchema` and `registerSchema` with their type exports. Since there are no more auth forms, we remove them. The event/category/template schemas don't have household fields, so no changes needed there.

**Step 1: Remove login and register schemas**

Delete the `loginSchema` (lines 4-7):
```typescript
export const loginSchema = z.object({
	email: z.string().min(1, 'Email is required').email('Please enter a valid email'),
	password: z.string().min(1, 'Password is required')
});
```

Delete the `registerSchema` (lines 9-22):
```typescript
export const registerSchema = z
	.object({
		name: z.string().min(1, 'Name is required').max(100, 'Name is too long'),
		email: z.string().min(1, 'Email is required').email('Please enter a valid email'),
		password: z
			.string()
			.min(8, 'Password must be at least 8 characters')
			.max(72, 'Password is too long'),
		confirmPassword: z.string().min(1, 'Please confirm your password')
	})
	.refine((data) => data.password === data.confirmPassword, {
		message: 'Passwords do not match',
		path: ['confirmPassword']
	});
```

**Step 2: Remove type exports for login and register**

Delete:
```typescript
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
```

**Step 3: Commit**

```bash
git add src/lib/schemas/index.ts
git commit -m "feat: remove auth schemas"
```

---

### Task 10: Verify Build

**Files:** None (verification only)

**Context:** After all changes, we verify the project compiles and builds successfully.

**Step 1: Run type checking**

Run: `npm run check`

Expected: No errors. If there are errors, they indicate missed references to removed code (household, auth methods, etc.) — fix them before proceeding.

**Step 2: Run production build**

Run: `npm run build`

Expected: Build succeeds. The output in `build/` should be a working static SPA.

**Step 3: Commit any fixes if needed**

If Step 1 or 2 revealed issues, fix them and commit:
```bash
git add -A
git commit -m "fix: resolve remaining references to removed code"
```
