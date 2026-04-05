# Singleton Instance Conversion Design

**Goal:** Remove multi-user authentication and household features, converting calenDHD into a shared home instance with a single auto-created user.

**Approach:** Auto-Login Singleton User — on first app load, the auth store auto-creates a "Home" user in PocketBase, then auto-logs in. All existing user ID plumbing stays intact internally.

---

## Section 1: Auth Store (Auto-Login)

**File:** `src/lib/stores/auth.svelte.ts`

Replace the current auth flow with:

- On initialization, attempt auto-login with fixed credentials (`home@calendhd.local` / `calendhd-home-2024`)
- If login fails (user doesn't exist), auto-create the user via PocketBase `signUpWithEmail`, then auto-login
- Remove `signIn()`, `signUp()`, `signOut()` from the public API
- Keep `user`, `isAuthenticated`, `loading` state — all stores depend on these
- `clearAllData()` stays as an internal utility but is no longer triggered by logout

The singleton user is a real PocketBase user, so all existing `getCurrentUser()` / `auth.user?.id` references work unchanged.

## Section 2: Layout & Routing

**Files:**
- `src/routes/+layout.svelte` — Remove redirect-to-login logic and public routes list
- Delete `src/routes/auth/login/+page.svelte` and `src/routes/auth/register/+page.svelte` (and any shared auth layout files)
- Delete `src/routes/household/+page.svelte`
- Remove "Household" and "Log out" from sidebar navigation

The layout `$effect` that initializes stores when `auth.isAuthenticated` stays — it just fires automatically after auto-login instead of waiting for manual login.

## Section 3: Data Model & Household Removal

**Types** (`src/lib/types/index.ts`):
- Remove `SharedFields` interface
- Remove `household?` and `is_private?` from `CalendarEvent`, `Category`, `Template`
- Remove same from `EventFormData`, `CategoryFormData`, `TemplateFormData`
- Remove `Household` interface

**Schemas** (`src/lib/schemas/index.ts`):
- Remove `household`/`is_private` fields from Zod schemas if present

**EventForm** (`src/lib/components/event/EventForm.svelte`):
- Remove "Share with household" dropdown
- Remove "Keep private" toggle
- Remove `householdStore` import and related state

**Stores:**
- Delete `src/lib/stores/household.svelte.ts`
- Remove from barrel export (`src/lib/stores/index.ts`)
- Remove `householdStore.load()` from root layout initialization

**PocketBase:** No destructive migration — `household` and `is_private` columns stay dormant in the database.

## Section 4: Sidebar & Navigation Cleanup

**File:** `src/lib/components/layout/Sidebar.svelte`

- Remove "Household" nav item
- Remove bottom auth section (user avatar, name, email, logout button)
- Remove `auth` store import if no longer needed
- i18n keys (`nav.household`, `nav.logout`) left in locale files (harmless)

## Section 5: Edge Cases & Testing

- **First launch:** Auto-create user if login fails, then auto-login. Handles fresh installs.
- **Existing data:** Events tied to a previous user won't be visible to the singleton user. Acceptable — fresh start for singleton mode.
- **PocketBase access rules:** Keep per-user rules intact. Singleton user's ID gets matched normally.
- **Offline/sync:** Sync engine uses `auth.user?.id` throughout — works unchanged with the real singleton user.
- **No PocketBase migration needed** for this change.
- **Verification:** `npm run check` + `npm run build` must pass. Manual test: open app, confirm auto-login, create event, verify sync.
