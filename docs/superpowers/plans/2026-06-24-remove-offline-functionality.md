# Remove Offline / Local-First Architecture — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PocketBase the single source of truth by deleting the IndexedDB/Dexie local-first layer and rewriting all stores to strict server-first, while keeping push notifications and realtime subscriptions intact.

**Architecture:** Each store calls the existing `$api/pocketbase` client directly and `await`s every write before updating in-memory `$state`. No optimistic state, no `sync_status`, no `local_id`. Realtime subscriptions (kept) reconcile cross-device/tab changes; their existing dedup guards now carry the load the optimistic path used to. The `brain_dump` feature already works this way and is the reference pattern.

**Tech Stack:** SvelteKit (Svelte 5 runes, `.svelte.ts` stores), PocketBase JS SDK, Vitest, Biome. PWA service worker (push only after this change).

## Global Constraints

- **Frontend-only change.** Do NOT modify any PocketBase hook (`pocketbase/pb_hooks/**`) or migration (`pocketbase/pb_migrations/**`).
- **Keep push notifications working.** The service worker's `push` + `notificationclick` handlers must survive untouched.
- **Keep realtime subscriptions.** `subscribeToEvents`/`subscribeToCategories`/`subscribeToRoutineTemplates` and the store `subscribeToUpdates()`/`unsubscribeFromUpdates()` methods stay.
- **i18n key balance.** `src/lib/i18n/locales/en.json` and `sv.json` MUST stay key-balanced. After any locale edit, run the Python structural-diff snippet from `CLAUDE.md` and confirm it prints `[] []`.
- **Error-surfacing decision (applies to every store task):** Store write methods (`create`/`update`/`delete`/`createEvent`/`updateEvent`/`deleteEvent`/`settings.update`) **let errors propagate (throw)** — every calling component already wraps them in `try/catch` + toast. The single exception is `calendar.toggleTaskComplete`, which is called fire-and-forget from 4 components and therefore catches internally and toasts `errors.generic`.
- **Testing approach:** This is a subtractive refactor; the safety net is the TypeScript checker (`npm run check`) catching missed references, the existing Vitest suite (`npm run test`), and manual smoke against a running PocketBase. No new red-green unit tests are written (store-level PocketBase mocking was scoped out). Every task ends with `npm run check` + `npm run test` passing, then a commit.
- **Ordering invariant:** The Dexie layer (`src/lib/db/**`) and the `Local*` types stay in place until Task 9. This keeps `npm run check` green at every intermediate commit — stores stop importing `$db` as they are migrated, but nothing references a deleted symbol until the final cleanup.
- **Branch:** Work on `remove-offline-functionality` (already checked out; the spec commit is its first commit).

---

### Task 1: Settings store → server-first

**Files:**
- Modify: `src/lib/stores/settings.svelte.ts` (full rewrite of `load` + `update`; getters unchanged)

**Interfaces:**
- Consumes: `getUserSettings()`, `updateUserSettings(changes, existingId?)`, `getDefaultSettings()` from `$api/pocketbase` (already exist).
- Produces: `settingsStore` with the same public getters (`defaultView`, `weekStartsOn`, `timeFormat`, `theme`, `locale`, `defaultReminders`, `notificationSound`, `colorPalette`, `timezone`, `bufferMinutes`, `density`, `dailyWinsEnabled`, `streakCelebrationEnabled`, `dayViewStyle`), `settings`, `loading`, `load()`, `update(changes)`. No behavior change for getters.

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `src/lib/stores/settings.svelte.ts` with:

```ts
import { browser } from '$app/environment';
import { getUserSettings, updateUserSettings, getDefaultSettings } from '$api/pocketbase';
import { auth } from './auth.svelte';
import { setLocale } from '$lib/i18n';
import { setTimezone, setDateLocale } from '$lib/utils/date';
import type { UserSettings } from '$types';

// Settings store using Svelte 5 runes
function createSettingsStore() {
	let settings = $state<UserSettings | null>(null);
	let loading = $state(true);

	const defaults = getDefaultSettings();

	return {
		get settings() {
			return settings;
		},
		get loading() {
			return loading;
		},

		// Computed getters with defaults
		get defaultView() {
			return settings?.default_view ?? defaults.default_view;
		},
		get weekStartsOn() {
			return settings?.week_starts_on ?? defaults.week_starts_on;
		},
		get timeFormat() {
			return settings?.time_format ?? defaults.time_format;
		},
		get theme() {
			return settings?.theme ?? defaults.theme;
		},
		get locale() {
			return settings?.locale ?? defaults.locale;
		},
		get defaultReminders() {
			return settings?.default_reminders ?? defaults.default_reminders;
		},
		get notificationSound() {
			return settings?.notification_sound ?? defaults.notification_sound;
		},
		get colorPalette(): 'sage' | 'ocean' | 'lavender' | 'rose' | 'amber' | 'teal' {
			const val = settings?.color_palette;
			if (val === 'sage' || val === 'ocean' || val === 'lavender' || val === 'rose' || val === 'amber' || val === 'teal') {
				return val;
			}
			return 'sage';
		},
		get timezone() {
			return settings?.timezone ?? defaults.timezone;
		},
		get bufferMinutes() {
			return settings?.buffer_minutes ?? defaults.buffer_minutes ?? 10;
		},
		get density(): 'compact' | 'comfortable' | 'spacious' {
			return (settings?.density ?? defaults.density ?? 'comfortable') as 'compact' | 'comfortable' | 'spacious';
		},
		get dailyWinsEnabled() {
			return settings?.daily_wins_enabled ?? defaults.daily_wins_enabled ?? true;
		},
		get streakCelebrationEnabled() {
			return settings?.streak_celebration_enabled ?? defaults.streak_celebration_enabled ?? true;
		},
		get dayViewStyle(): 'timeline' | 'agenda' {
			const val = settings?.day_view_style ?? defaults.day_view_style;
			return val === 'agenda' ? 'agenda' : 'timeline';
		},

		async load() {
			if (!browser) return;

			loading = true;
			const userId = auth.user?.id;

			if (!userId) {
				settings = null;
				loading = false;
				return;
			}

			try {
				const serverSettings = await getUserSettings();
				settings = serverSettings;
				if (serverSettings?.locale) {
					setLocale(serverSettings.locale);
					setDateLocale(serverSettings.locale);
				}
				if (serverSettings?.timezone) {
					setTimezone(serverSettings.timezone);
				}
			} catch (error) {
				console.error('Failed to load settings:', error);
			}

			loading = false;
		},

		async update(changes: Partial<UserSettings>) {
			const userId = auth.user?.id;
			if (!userId) return;

			const existingId = settings?.id || undefined;
			const serverSettings = await updateUserSettings(changes, existingId);
			settings = serverSettings;

			// Apply UI side-effects from the persisted result
			if (serverSettings.locale) {
				setLocale(serverSettings.locale);
				setDateLocale(serverSettings.locale);
			}
			if (serverSettings.timezone) {
				setTimezone(serverSettings.timezone);
			}
		}
	};
}

export const settingsStore = createSettingsStore();
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: PASS (0 errors). `settings.svelte.ts` no longer imports `$db`.

- [ ] **Step 3: Run tests**

Run: `npm run test`
Expected: PASS (db + util tests still green; db layer untouched).

- [ ] **Step 4: Commit**

```bash
git add src/lib/stores/settings.svelte.ts
git commit -m "refactor(settings): server-first store, drop IndexedDB cache"
```

---

### Task 2: Categories store → server-first

**Files:**
- Modify: `src/lib/stores/categories.svelte.ts` (full rewrite)

**Interfaces:**
- Consumes: `getCategories()`, `createCategory(data)`, `updateCategory(id, changes)`, `deleteCategory(id)`, `subscribeToCategories(cb)` from `$api/pocketbase`.
- Produces: `categoriesStore` with `categories`, `loading`, `getById(id)`, `getColor(categoryId?)`, `getNextColor()`, `load()`, `subscribeToUpdates()`, `unsubscribeFromUpdates()`, `create({name,color,icon?})` → `Promise<Category>`, `update(id, changes)`, `delete(id)`, `reorder(orderedIds)`.

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `src/lib/stores/categories.svelte.ts` with:

```ts
import { browser } from '$app/environment';
import {
	getCategories,
	createCategory,
	updateCategory,
	deleteCategory,
	subscribeToCategories
} from '$api/pocketbase';
import { auth } from './auth.svelte';
import type { Category } from '$types';

// Categories store using Svelte 5 runes
function createCategoriesStore() {
	let categories = $state<Category[]>([]);
	let loading = $state(false);

	let unsubscribe: (() => void) | null = null;

	// Default category colors
	const defaultColors = [
		'#7BA7BC', // blue
		'#7C9885', // green
		'#9A88B5', // purple
		'#E8A383', // orange
		'#D4A5A5', // pink
		'#D4C97A', // yellow
		'#7ABCB4', // teal
		'#C9898A' // red
	];

	return {
		get categories() {
			return categories;
		},
		get loading() {
			return loading;
		},

		getById(id: string): Category | undefined {
			return categories.find((c) => c.id === id);
		},

		getColor(categoryId?: string): string {
			if (!categoryId) return '#7C9885'; // default sage green
			const category = this.getById(categoryId);
			return category?.color || '#7C9885';
		},

		getNextColor(): string {
			const usedColors = categories.map((c) => c.color);
			const availableColor = defaultColors.find((c) => !usedColors.includes(c));
			return availableColor || defaultColors[categories.length % defaultColors.length];
		},

		async load() {
			if (!browser) return;

			const userId = auth.user?.id;
			if (!userId) {
				categories = [];
				return;
			}

			loading = true;
			try {
				categories = await getCategories();
			} catch (error) {
				console.error('Failed to load categories:', error);
			}
			loading = false;
		},

		subscribeToUpdates() {
			if (!browser) return;

			if (unsubscribe) {
				unsubscribe();
			}

			unsubscribe = subscribeToCategories((action, record) => {
				switch (action) {
					case 'create':
						if (!categories.some((c) => c.id === record.id)) {
							categories = [...categories, record].sort((a, b) => a.sort_order - b.sort_order);
						}
						break;
					case 'update':
						categories = categories
							.map((c) => (c.id === record.id ? record : c))
							.sort((a, b) => a.sort_order - b.sort_order);
						break;
					case 'delete':
						categories = categories.filter((c) => c.id !== record.id);
						break;
				}
			});
		},

		unsubscribeFromUpdates() {
			if (unsubscribe) {
				unsubscribe();
				unsubscribe = null;
			}
		},

		async create(data: { name: string; color: string; icon?: string }) {
			const userId = auth.user?.id;
			if (!userId) throw new Error('Not authenticated');

			const sortOrder =
				categories.length > 0 ? Math.max(...categories.map((c) => c.sort_order)) + 1 : 0;

			const serverCategory = await createCategory({ ...data, sort_order: sortOrder });
			if (!categories.some((c) => c.id === serverCategory.id)) {
				categories = [...categories, serverCategory].sort((a, b) => a.sort_order - b.sort_order);
			}
			return serverCategory;
		},

		async update(id: string, changes: Partial<Category>) {
			const serverCategory = await updateCategory(id, changes);
			categories = categories
				.map((c) => (c.id === id ? serverCategory : c))
				.sort((a, b) => a.sort_order - b.sort_order);
		},

		async delete(id: string) {
			await deleteCategory(id);
			categories = categories.filter((c) => c.id !== id);
		},

		async reorder(orderedIds: string[]) {
			const updates = orderedIds.map((id, index) => ({
				id,
				sort_order: index
			}));

			for (const update of updates) {
				await this.update(update.id, { sort_order: update.sort_order });
			}
		}
	};
}

export const categoriesStore = createCategoriesStore();
```

- [ ] **Step 2: Type-check** — Run: `npm run check` — Expected: PASS (0 errors).
- [ ] **Step 3: Run tests** — Run: `npm run test` — Expected: PASS.
- [ ] **Step 4: Commit**

```bash
git add src/lib/stores/categories.svelte.ts
git commit -m "refactor(categories): server-first store, drop IndexedDB cache"
```

---

### Task 3: Templates store → server-first

**Files:**
- Modify: `src/lib/stores/templates.svelte.ts` (full rewrite)

**Interfaces:**
- Consumes: `getTemplates()`, `createTemplate(data)`, `updateTemplate(id, changes)`, `deleteTemplate(id)` from `$api/pocketbase`.
- Produces: `templatesStore` with `templates`, `loading`, `getById(id)`, `getByCategory(categoryId)`, `load()`, `create(data)` → `Promise<Template>`, `update(id, changes)`, `delete(id)`. (No realtime subscription — templates never had one.)

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `src/lib/stores/templates.svelte.ts` with:

```ts
import { browser } from '$app/environment';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from '$api/pocketbase';
import { auth } from './auth.svelte';
import type { Template, ReminderConfig } from '$types';

// Templates store using Svelte 5 runes
function createTemplatesStore() {
	let templates = $state<Template[]>([]);
	let loading = $state(false);

	return {
		get templates() {
			return templates;
		},
		get loading() {
			return loading;
		},

		getById(id: string): Template | undefined {
			return templates.find((t) => t.id === id);
		},

		getByCategory(categoryId: string): Template[] {
			return templates.filter((t) => t.category === categoryId);
		},

		async load() {
			if (!browser) return;

			const userId = auth.user?.id;
			if (!userId) {
				templates = [];
				return;
			}

			loading = true;
			try {
				templates = await getTemplates();
			} catch (error) {
				console.error('Failed to load templates:', error);
			}
			loading = false;
		},

		async create(data: {
			name: string;
			category?: string;
			default_duration_minutes: number;
			default_is_all_day: boolean;
			default_reminders: ReminderConfig[];
			description?: string;
			color_override?: string;
		}) {
			const userId = auth.user?.id;
			if (!userId) throw new Error('Not authenticated');

			const serverTemplate = await createTemplate(data);
			templates = [...templates, serverTemplate].sort((a, b) => a.name.localeCompare(b.name));
			return serverTemplate;
		},

		async update(id: string, changes: Partial<Template>) {
			const serverTemplate = await updateTemplate(id, changes);
			templates = templates
				.map((t) => (t.id === id ? serverTemplate : t))
				.sort((a, b) => a.name.localeCompare(b.name));
		},

		async delete(id: string) {
			await deleteTemplate(id);
			templates = templates.filter((t) => t.id !== id);
		}
	};
}

export const templatesStore = createTemplatesStore();
```

- [ ] **Step 2: Type-check** — Run: `npm run check` — Expected: PASS (0 errors).
- [ ] **Step 3: Run tests** — Run: `npm run test` — Expected: PASS.
- [ ] **Step 4: Commit**

```bash
git add src/lib/stores/templates.svelte.ts
git commit -m "refactor(templates): server-first store, drop IndexedDB cache"
```

---

### Task 4: Routines store → server-first

**Files:**
- Modify: `src/lib/stores/routines.svelte.ts` (full rewrite)

**Interfaces:**
- Consumes: `getRoutineTemplates()`, `createRoutineTemplate(data)`, `updateRoutineTemplate(id, changes)`, `deleteRoutineTemplate(id)`, `subscribeToRoutineTemplates(cb)` from `$api/pocketbase`.
- Produces: `routinesStore` with `routines`, `loading`, `getById(id)`, `getActive()`, `load()`, `subscribeToUpdates()`, `unsubscribeFromUpdates()`, `create(data)` → `Promise<RoutineTemplate>`, `update(id, changes)`, `toggleActive(id)`, `delete(id)`. Note: `routinesStore.getById` is consumed by `calendar.svelte.ts` (Task 5) and must keep its signature.

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `src/lib/stores/routines.svelte.ts` with:

```ts
import { browser } from '$app/environment';
import {
	getRoutineTemplates,
	createRoutineTemplate,
	updateRoutineTemplate,
	deleteRoutineTemplate,
	subscribeToRoutineTemplates
} from '$api/pocketbase';
import { auth } from './auth.svelte';
import type { RoutineTemplate, RoutineStep, RoutineSchedule } from '$types';

function createRoutinesStore() {
	let routines = $state<RoutineTemplate[]>([]);
	let loading = $state(false);
	let unsubscribe: (() => void) | null = null;

	return {
		get routines() {
			return routines;
		},
		get loading() {
			return loading;
		},

		getById(id: string): RoutineTemplate | undefined {
			return routines.find((r) => r.id === id);
		},

		getActive(): RoutineTemplate[] {
			return routines.filter((r) => r.is_active);
		},

		async load() {
			if (!browser) return;

			const userId = auth.user?.id;
			if (!userId) {
				routines = [];
				return;
			}

			loading = true;
			try {
				routines = await getRoutineTemplates();
			} catch (error) {
				console.error('Failed to load routines:', error);
			}
			loading = false;
		},

		subscribeToUpdates() {
			if (!browser) return;

			if (unsubscribe) {
				unsubscribe();
			}

			unsubscribe = subscribeToRoutineTemplates((action, record) => {
				switch (action) {
					case 'create':
						if (!routines.some((r) => r.id === record.id)) {
							routines = [...routines, record].sort((a, b) => a.name.localeCompare(b.name));
						}
						break;
					case 'update':
						routines = routines
							.map((r) => (r.id === record.id ? record : r))
							.sort((a, b) => a.name.localeCompare(b.name));
						break;
					case 'delete':
						routines = routines.filter((r) => r.id !== record.id);
						break;
				}
			});
		},

		unsubscribeFromUpdates() {
			if (unsubscribe) {
				unsubscribe();
				unsubscribe = null;
			}
		},

		async create(data: {
			name: string;
			steps: RoutineStep[];
			schedule: RoutineSchedule;
			is_active: boolean;
			color?: string;
			icon?: string;
			target_end_time?: string;
		}) {
			const userId = auth.user?.id;
			if (!userId) throw new Error('Not authenticated');

			const serverRoutine = await createRoutineTemplate(data);
			if (!routines.some((r) => r.id === serverRoutine.id)) {
				routines = [...routines, serverRoutine].sort((a, b) => a.name.localeCompare(b.name));
			}
			return serverRoutine;
		},

		async update(id: string, changes: Partial<RoutineTemplate>) {
			const serverRoutine = await updateRoutineTemplate(id, changes);
			routines = routines
				.map((r) => (r.id === id ? serverRoutine : r))
				.sort((a, b) => a.name.localeCompare(b.name));
		},

		async toggleActive(id: string) {
			const routine = routines.find((r) => r.id === id);
			if (!routine) return;
			await this.update(id, { is_active: !routine.is_active });
		},

		async delete(id: string) {
			await deleteRoutineTemplate(id);
			routines = routines.filter((r) => r.id !== id);
		}
	};
}

export const routinesStore = createRoutinesStore();
```

- [ ] **Step 2: Type-check** — Run: `npm run check` — Expected: PASS (0 errors). `routines.svelte.ts` no longer imports `$db` or `$db/routines`.
- [ ] **Step 3: Run tests** — Run: `npm run test` — Expected: PASS.
- [ ] **Step 4: Commit**

```bash
git add src/lib/stores/routines.svelte.ts
git commit -m "refactor(routines): server-first store, drop IndexedDB cache"
```

---

### Task 5: Calendar store → server-first (largest)

**Files:**
- Modify: `src/lib/stores/calendar.svelte.ts` (rewrite imports, `loadEvents`, `createEvent`, `updateEvent`, `deleteEvent`, realtime `delete` handler, `toggleTaskComplete` error wrapping; keep everything else verbatim)

**Interfaces:**
- Consumes: `getEvents(start,end)`, `getExternalEvents(start,end)`, `subscribeToEvents(cb)`, `createEvent`, `updateEvent`, `deleteEvent` from `$api/pocketbase`; `routinesStore.getById` (Task 4); `settingsStore.weekStartsOn` / `streakCelebrationEnabled` (Task 1).
- Produces: `calendar` store with unchanged public surface: `currentDate`, `viewType`, `events`, `externalEvents`, `loading`, `viewRange`, `displayEvents`, `getEventsForDay(date)`, `setDate`, `setViewType`, `goToToday`, `goNext`, `goPrevious`, `loadEvents()`, `subscribeToUpdates()`, `unsubscribeFromUpdates()`, `createEvent(data)` → `Promise<CalendarEvent>`, `updateEvent(id, changes)`, `deleteEvent(id)`, `toggleTaskComplete(id)`. **`createEvent`'s parameter type changes** from `Omit<LocalEvent,'local_id'|'sync_status'|'user'>` to `Omit<CalendarEvent,'id'|'created'|'updated'|'user'>` (callers already pass this shape).

- [ ] **Step 1: Replace the import block**

Replace the import block at the top of `src/lib/stores/calendar.svelte.ts` (the `import { browser } ...` through the closing `from '$types';` line — original lines 1–43) with:

```ts
import { browser } from '$app/environment';
import {
	startOfDay,
	endOfDay,
	startOfWeek,
	endOfWeek,
	startOfMonth,
	endOfMonth,
	addDays,
	addWeeks,
	addMonths,
	subDays,
	subWeeks,
	subMonths
} from 'date-fns';
import { isSameDay } from '$utils';
import {
	getEvents,
	getExternalEvents,
	subscribeToEvents,
	createEvent as createServerEvent,
	updateEvent as updateServerEvent,
	deleteEvent as deleteServerEvent
} from '$api/pocketbase';
import { auth } from './auth.svelte';
import { settingsStore } from './settings.svelte';
import { routinesStore } from './routines.svelte';
import { toast } from 'svelte-sonner';
import { get } from 'svelte/store';
import { _ } from 'svelte-i18n';
import type { CalendarEvent, CalendarSubscription, ExternalEvent, DisplayEvent } from '$types';
```

(This removes the entire `$db` import block and drops `LocalEvent` from the `$types` import.)

- [ ] **Step 2: Replace `loadEvents()`**

Replace the whole `async loadEvents() { ... }` method (original lines 209–298) with:

```ts
		// Load events for current view
		async loadEvents() {
			if (!browser) return;

			const userId = auth.user?.id;
			if (!userId) {
				events = [];
				externalEvents = [];
				return;
			}

			// Claim a token; any in-flight loadEvents() with an older token must
			// stop writing to the shared events/externalEvents state — otherwise
			// a slow earlier fetch can clobber a newer view's data and the grid
			// renders empty after rapid prev/next clicks.
			const myGen = ++loadGeneration;
			const isStale = () => myGen !== loadGeneration;

			loading = true;
			const { start, end } = getViewRange();

			try {
				const [serverEvents, serverExternalEvents] = await Promise.all([
					getEvents(start, end),
					getExternalEvents(start, end)
				]);
				if (isStale()) return;
				events = serverEvents;
				externalEvents = serverExternalEvents;
			} catch (error) {
				console.error('Failed to load events from server:', error);
				// Keep whatever is currently displayed on a transient failure
			}

			if (!isStale()) loading = false;
		},
```

- [ ] **Step 3: Replace the realtime `delete` case**

In `subscribeToUpdates()`, replace the `case 'delete':` block (original lines 320–326, which calls `db.events.where('id')...hardDeleteLocalEvent`) with:

```ts
						case 'delete':
							events = events.filter((e) => e.id !== record.id);
							break;
```

- [ ] **Step 4: Replace `createEvent` / `updateEvent` / `deleteEvent`**

Replace the three methods (original lines 338–425, from the `// Event CRUD ...` comment through the end of `deleteEvent`) with:

```ts
		// Event CRUD (server-first: await PocketBase, then update UI state)
		async createEvent(data: Omit<CalendarEvent, 'id' | 'created' | 'updated' | 'user'>) {
			const userId = auth.user?.id;
			if (!userId) throw new Error('Not authenticated');

			const serverEvent = await createServerEvent(data);
			if (!events.some((e) => e.id === serverEvent.id)) {
				events = [...events, serverEvent];
			}
			return serverEvent;
		},

		async updateEvent(id: string, changes: Partial<CalendarEvent>) {
			const serverEvent = await updateServerEvent(id, changes);
			events = events.map((e) => (e.id === id ? serverEvent : e));
		},

		async deleteEvent(id: string) {
			await deleteServerEvent(id);
			events = events.filter((e) => e.id !== id);
		},
```

- [ ] **Step 5: Wrap `toggleTaskComplete` body in try/catch**

`toggleTaskComplete` is called fire-and-forget (no `await`/`catch`) from `EventBlock`, `RoutineBlock`, `AgendaView`, and `/now`. Wrap its mutating body so a server failure surfaces a toast instead of an unhandled rejection. Keep the existing guard, then wrap the rest. Change the method so it reads:

```ts
		// Toggle task completion with flexible timing cascade
		async toggleTaskComplete(id: string) {
			const event = events.find((e) => e.id === id);
			if (!event || !event.is_task) return;

			try {
				const completed_at = event.completed_at ? undefined : new Date().toISOString();
				const justCompleted = !!completed_at;
				await this.updateEvent(id, { completed_at });

				// Celebrate: if this completion finished today's last open step of a
				// routine, fire a one-shot toast (when enabled in settings).
				if (justCompleted && event.routine_template && settingsStore.streakCelebrationEnabled) {
					const dayKey = new Date(event.start_time).toDateString();
					const sameRoutineToday = events.filter(
						(e) =>
							e.routine_template === event.routine_template &&
							e.start_time &&
							new Date(e.start_time).toDateString() === dayKey
					);
					const stillOpen = sameRoutineToday.filter((e) => e.id !== id && !e.completed_at).length;
					if (sameRoutineToday.length >= 1 && stillOpen === 0) {
						const t = get(_);
						toast.success(`✨ ${t('routine.completedToday')}`);
					}
				}

				// Flexible timing cascade for routine steps
				if (event.routine_template && event.routine_step_index !== undefined) {
					const routineTemplate = routinesStore.getById(event.routine_template);
					if (!routineTemplate) return;

					const routineSteps = routineTemplate.steps;
					const currentStepIdx = event.routine_step_index;

					// Find all events for this routine today, sorted by step index
					const routineEvents = events
						.filter((e) =>
							e.routine_template === event.routine_template &&
							e.start_time &&
							new Date(e.start_time).toDateString() === new Date(event.start_time).toDateString()
						)
						.sort((a, b) => (a.routine_step_index ?? 0) - (b.routine_step_index ?? 0));

					if (completed_at) {
						// Completing: shift subsequent flexible steps from completion time
						let cursor = new Date(completed_at);

						for (let i = currentStepIdx + 1; i < routineSteps.length; i++) {
							const step = routineSteps[i];
							if (step.timing_mode !== 'flexible') break;

							const nextEvent = routineEvents.find((e) => e.routine_step_index === i);
							if (!nextEvent) continue;

							const duration = (step.duration_minutes || 15) * 60000;
							const newStart = cursor.toISOString();
							const newEnd = new Date(cursor.getTime() + duration).toISOString();

							await this.updateEvent(nextEvent.id, {
								start_time: newStart,
								end_time: newEnd
							});

							cursor = new Date(cursor.getTime() + duration);
						}
					} else {
						// Uncompleting: revert subsequent flexible steps to original calculated times
						const scheduleTime = routineTemplate.schedule.time;
						const [hStr, mStr] = scheduleTime.split(':');
						const baseDate = new Date(event.start_time);
						let cursor = new Date(
							baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(),
							parseInt(hStr, 10), parseInt(mStr, 10), 0
						);

						// Walk from step 0 to rebuild original times
						for (let i = 0; i < routineSteps.length; i++) {
							const step = routineSteps[i];
							const duration = (step.duration_minutes || 15) * 60000;

							if (i > currentStepIdx && step.timing_mode === 'flexible') {
								const nextEvent = routineEvents.find((e) => e.routine_step_index === i);
								if (nextEvent) {
									await this.updateEvent(nextEvent.id, {
										start_time: cursor.toISOString(),
										end_time: new Date(cursor.getTime() + duration).toISOString()
									});
								}
							}

							cursor = new Date(cursor.getTime() + duration);
						}
					}
				}
			} catch (error) {
				console.error('Failed to toggle task completion:', error);
				const t = get(_);
				toast.error(t('errors.generic'));
			}
		}
```

- [ ] **Step 6: Type-check** — Run: `npm run check` — Expected: PASS (0 errors). `calendar.svelte.ts` no longer references `$db`, `LocalEvent`, `db`, `setExternalEvents`, `getPendingDeleteEvents`, `markEventSynced`, `hardDeleteLocalEvent`, `createLocalEvent`, `updateLocalEvent`, `deleteLocalEvent`, `getLocalEvents`, or `getLocalExternalEvents`.

- [ ] **Step 7: Run tests** — Run: `npm run test` — Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/stores/calendar.svelte.ts
git commit -m "refactor(calendar): server-first store, drop IndexedDB + sync queue"
```

---

### Task 6: External-event reminder modal → PocketBase-only

**Files:**
- Modify: `src/lib/components/calendar/ExternalEventReminderRow.svelte` (imports, `hydrate`, `persist`)

**Interfaces:**
- Consumes: `getExternalEventReminders(subscriptionId)`, `upsertExternalEventReminderRemote(sub, uid, minutes|null, disabled)`, `deleteExternalEventReminderRemote(sub, uid)` from `$api/pocketbase` (all already exist).
- Produces: no exported interface change; same component props (`external`, `subscription`).

- [ ] **Step 1: Replace the import block**

In `src/lib/components/calendar/ExternalEventReminderRow.svelte`, replace the two import blocks (original lines 4–12 — the `$api/pocketbase` block plus the `$db` block) with a single block:

```ts
	import {
		upsertExternalEventReminderRemote,
		deleteExternalEventReminderRemote,
		getExternalEventReminders
	} from '$api/pocketbase';
```

- [ ] **Step 2: Replace `hydrate()`**

Replace the `async function hydrate(subscriptionId: string, uid: string) { ... }` (original lines 36–50) with:

```ts
	async function hydrate(subscriptionId: string, uid: string) {
		loaded = false;
		const rows = await getExternalEventReminders(subscriptionId);
		const row = rows.find((r) => r.ical_uid === uid);
		if (!row) {
			mode = 'default';
		} else if (row.disabled) {
			mode = 'off';
		} else if (row.minutes_before !== null && row.minutes_before !== undefined) {
			mode = 'custom';
			customMinutes = row.minutes_before;
		} else {
			mode = 'default';
		}
		loaded = true;
	}
```

- [ ] **Step 3: Replace `persist()`**

Replace the `async function persist() { ... }` (original lines 52–96) with the PocketBase-only version (drops the three local `$db` writes):

```ts
	async function persist() {
		if (!subscription) return;
		saving = true;
		try {
			if (mode === 'default') {
				await deleteExternalEventReminderRemote(external.subscription, external.uid);
			} else if (mode === 'off') {
				await upsertExternalEventReminderRemote(external.subscription, external.uid, null, true);
			} else {
				await upsertExternalEventReminderRemote(
					external.subscription,
					external.uid,
					customMinutes,
					false
				);
			}
			toast.success($_('externalEvent.reminderSaved'));
		} catch (err) {
			toast.error($_('errors.generic'));
		} finally {
			saving = false;
		}
	}
```

- [ ] **Step 4: Type-check** — Run: `npm run check` — Expected: PASS. This file no longer imports `$db`.
- [ ] **Step 5: Run tests** — Run: `npm run test` — Expected: PASS.
- [ ] **Step 6: Commit**

```bash
git add src/lib/components/calendar/ExternalEventReminderRow.svelte
git commit -m "refactor(reminders): external-event reminder modal reads/writes PocketBase directly"
```

---

### Task 7: Remove the OfflineIndicator + offline i18n keys

**Files:**
- Delete: `src/lib/components/ui/OfflineIndicator.svelte`
- Modify: `src/lib/components/ui/index.ts` (drop the `OfflineIndicator` re-export)
- Modify: `src/routes/+layout.svelte` (drop import + render)
- Modify: `src/lib/i18n/locales/en.json` (remove `status` block)
- Modify: `src/lib/i18n/locales/sv.json` (remove `status` block)

**Interfaces:** none (pure removal). The `status.*` keys are referenced only by the deleted `OfflineIndicator`.

- [ ] **Step 1: Delete the component**

```bash
git rm src/lib/components/ui/OfflineIndicator.svelte
```

- [ ] **Step 2: Remove the barrel export**

In `src/lib/components/ui/index.ts`, delete the line that exports `OfflineIndicator` (the `export { default as OfflineIndicator } from './OfflineIndicator.svelte';` line).

- [ ] **Step 3: Remove it from the layout**

In `src/routes/+layout.svelte`:
- Change the import on line 6 from `import { OfflineIndicator } from '$components/ui';` — remove `OfflineIndicator`. Since it is the only named import on that line, delete the whole line 6.
- Delete the `<!-- Offline indicator -->` comment and the `<OfflineIndicator />` element at the bottom (original lines 123–124).

- [ ] **Step 4: Remove the `status` block from both locale files**

Open `src/lib/i18n/locales/en.json`, find and delete the `status` object:

```json
	"status": {
		"online": "Back online",
		"offline": "You're offline",
		"offlineMessage": "Changes will sync when connected",
		"dismiss": "Dismiss"
	},
```

Do the same in `src/lib/i18n/locales/sv.json`:

```json
	"status": {
		"online": "Åter online",
		"offline": "Du är offline",
		"offlineMessage": "Ändringar synkas när du är ansluten",
		"dismiss": "Stäng"
	},
```

If `status` is the last key in its parent object (no trailing comma after the block), remove the trailing comma from the preceding key instead so the JSON stays valid. (Keep `subscription.syncing` / `subscription.syncSuccess` — they are unrelated feed-sync strings.)

- [ ] **Step 5: Verify i18n key balance**

Run (from repo root):

```bash
python3 -c "import json; e=json.load(open('src/lib/i18n/locales/en.json')); s=json.load(open('src/lib/i18n/locales/sv.json'));
def k(d,p=''): out=set();
 [out.update(k(v,(f'{p}.{x}' if p else x))) if isinstance(v,dict) else out.add(f'{p}.{x}' if p else x) for x,v in d.items()];
 return out
print(sorted(k(e)-k(s)), sorted(k(s)-k(e)))"
```

Expected: `[] []` (both files parse as valid JSON and are key-balanced).

- [ ] **Step 6: Type-check** — Run: `npm run check` — Expected: PASS (no remaining import of `OfflineIndicator`).
- [ ] **Step 7: Run tests** — Run: `npm run test` — Expected: PASS.
- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(ui): remove OfflineIndicator + offline status i18n keys"
```

---

### Task 8: Strip the service worker to push-only

**Files:**
- Modify: `src/service-worker.ts` (remove caching/install/activate/fetch/background-sync; keep push + notificationclick + SKIP_WAITING)

**Interfaces:** none. The SW remains registered via `svelte.config.js` (`serviceWorker.register: true`, unchanged).

- [ ] **Step 1: Replace the file contents**

Replace the entire contents of `src/service-worker.ts` with:

```ts
/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />

declare const self: ServiceWorkerGlobalScope;

// This service worker exists ONLY for Web Push. Offline asset caching was
// removed — the app runs against an always-online PocketBase server, so there
// is no fetch/install/activate caching and no background-sync handler.

// ── Push notification handling ──────────────────────────────────────
self.addEventListener('push', (event) => {
	if (!event.data) return;

	const data = event.data.json();

	const options: NotificationOptions = {
		body: data.body || 'You have a reminder',
		icon: '/icons/icon-192.png',
		badge: '/icons/badge-72.png',
		tag: data.tag || 'calendhd-reminder',
		data: data.data || {},
		actions: [
			{ action: 'view', title: 'View Event' },
			{ action: 'dismiss', title: 'Dismiss' }
		],
		vibrate: [200, 100, 200]
	};

	event.waitUntil(
		self.registration.showNotification(data.title || 'calenDHD Reminder', options)
	);
});

// ── Notification click handling ─────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
	event.notification.close();

	if (event.action === 'dismiss') return;

	const eventId = event.notification.data?.eventId;
	const url = eventId ? `/event/${eventId}` : '/';

	event.waitUntil(
		self.clients
			.matchAll({ type: 'window', includeUncontrolled: true })
			.then((clients) => {
				const existingClient = clients.find((client) => 'focus' in client);
				if (existingClient) {
					existingClient.focus();
					existingClient.navigate(url);
				} else {
					self.clients.openWindow(url);
				}
			})
	);
});

// ── Listen for messages from the main app ───────────────────────────
self.addEventListener('message', (event) => {
	if (event.data?.type === 'SKIP_WAITING') {
		self.skipWaiting();
	}
});
```

- [ ] **Step 2: Type-check** — Run: `npm run check` — Expected: PASS. The `$service-worker` import (`build`, `files`, `version`) is gone and unreferenced.
- [ ] **Step 3: Run tests** — Run: `npm run test` — Expected: PASS.
- [ ] **Step 4: Commit**

```bash
git add src/service-worker.ts
git commit -m "refactor(sw): strip offline caching + background sync, keep push"
```

---

### Task 9: Delete the Dexie layer, Local types, deps

This is the final removal. By now nothing in `src/**` imports `$db`, `$db/routines`, or the `Local*` types except the Dexie files and their tests (deleted here) and the type definitions (removed here).

**Files:**
- Delete: `src/lib/db/index.ts`, `src/lib/db/routines.ts`, `src/lib/db/index.test.ts`, `src/lib/db/routines.test.ts`
- Modify: `src/lib/types/index.ts` (remove `Local*` types + `local_id?`/`last_synced?` on `CalendarEvent`)
- Modify: `src/tests/setup.ts` (remove `fake-indexeddb` polyfill)
- Modify: `svelte.config.js` (remove the `$db` alias)
- Modify: `package.json` (remove `dexie` + `fake-indexeddb`)

**Interfaces:** none produced; removes `$db` and `Local*` from the codebase entirely.

- [ ] **Step 1: Confirm there are no remaining `$db` consumers**

Run: `npm run check` first is not enough — explicitly grep. Run:

```bash
grep -rEl "\$db|LocalEvent|LocalCategory|LocalTemplate|LocalRoutineTemplate" src --include=*.ts --include=*.svelte
```

Expected: only `src/lib/db/index.ts`, `src/lib/db/routines.ts`, `src/lib/db/index.test.ts`, `src/lib/db/routines.test.ts`, and `src/lib/types/index.ts`. If any OTHER file appears, stop and migrate it before continuing.

- [ ] **Step 2: Delete the Dexie layer and its tests**

```bash
git rm src/lib/db/index.ts src/lib/db/routines.ts src/lib/db/index.test.ts src/lib/db/routines.test.ts
```

- [ ] **Step 3: Remove the `Local*` types and offline fields from `src/lib/types/index.ts`**

Delete the `LocalRoutineTemplate` interface (original lines 69–74, including its `// Local version for IndexedDB` comment):

```ts
// Local version for IndexedDB
export interface LocalRoutineTemplate extends Omit<RoutineTemplate, 'id' | 'created' | 'updated'> {
	id?: string;
	local_id: string;
	sync_status: 'synced' | 'pending' | 'conflict';
}
```

In the `CalendarEvent` interface, delete these two fields (original lines 113–114):

```ts
	local_id?: string; // for offline sync
	last_synced?: string;
```

Delete the `// Local-only types for Dexie/IndexedDB` comment and the `LocalEvent`, `LocalCategory`, `LocalTemplate` interfaces (original lines 195–214):

```ts
// Local-only types for Dexie/IndexedDB

export interface LocalEvent extends Omit<CalendarEvent, 'id' | 'created' | 'updated'> {
	id?: string; // may not have server ID yet
	local_id: string;
	sync_status: 'synced' | 'pending' | 'conflict' | 'deleted';
	pending_changes?: Partial<CalendarEvent>;
}

export interface LocalCategory extends Omit<Category, 'id' | 'created' | 'updated'> {
	id?: string;
	local_id: string;
	sync_status: 'synced' | 'pending' | 'conflict';
}

export interface LocalTemplate extends Omit<Template, 'id' | 'created' | 'updated'> {
	id?: string;
	local_id: string;
	sync_status: 'synced' | 'pending' | 'conflict';
}
```

(Keep the server `ExternalEventReminder`, `DevicePushSubscription`, and all other types.)

- [ ] **Step 4: Remove `fake-indexeddb` from the test setup**

Read `src/tests/setup.ts`. Remove the `fake-indexeddb` import line (e.g. `import 'fake-indexeddb/auto';`). Leave any other setup intact. If the file becomes empty, leave it as an empty file (it is still referenced by `vitest` setup config).

- [ ] **Step 5: Remove the `$db` alias from `svelte.config.js`**

In `svelte.config.js`, delete the `$db` entry from the `kit.alias` map (the `'$db': 'src/lib/db'` line). Leave the other aliases (`$components`, `$stores`, `$api`, `$utils`, `$types`) intact.

- [ ] **Step 6: Drop the dependencies**

```bash
npm uninstall dexie fake-indexeddb
```

Expected: `package.json` + `package-lock.json` updated; both packages removed from `dependencies`/`devDependencies`.

- [ ] **Step 7: Type-check (regenerates `.svelte-kit` path aliases)**

Run: `npm run check`
Expected: PASS (0 errors). Confirms no dangling `$db` / `Local*` references and the removed alias is gone from generated tsconfig paths.

- [ ] **Step 8: Run tests**

Run: `npm run test`
Expected: PASS. Remaining suites (`date.test.ts`, `recurrence.test.ts`, `utils/index.test.ts`) run without the deleted db tests and without `fake-indexeddb`.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "refactor: delete Dexie layer, Local types, and offline deps"
```

---

### Task 10: Rebuild the HA add-on bundle + release verification

**Files:**
- Modify: `ha-addon/calendhd/rootfs/opt/calendhd/public/**` (regenerated by the build script)
- Modify: `ha-addon/calendhd/config.yaml` (`version:` bump)

**Interfaces:** none.

- [ ] **Step 1: Full local verification (against a running PocketBase)**

Start PocketBase (`cd pocketbase && ./pocketbase serve`) and the dev server (`npm run dev`) in separate terminals, then manually confirm:
- App loads and shows events/categories/templates/routines/settings.
- Create, edit, and delete an event; create/edit/delete a category, template, and routine — each persists (reload the page; data comes from PocketBase).
- Toggle a task/routine-step checkbox — it flips after the round-trip; a routine cascade still reschedules following flexible steps.
- Open the external-event reminder modal on a subscription event — it hydrates and saves.
- Settings changes (theme, week start) persist across reload.
- Trigger the push test (Settings → test notification) — a notification still fires.

Document the results in the commit/PR description. (No automated gate here; this is the manual smoke the refactor relies on.)

- [ ] **Step 2: Bump the add-on version**

In `ha-addon/calendhd/config.yaml`, bump `version:` to the next patch (e.g. `1.6.5` → `1.6.6`).

- [ ] **Step 3: Rebuild the add-on frontend bundle**

Run (Linux/macOS): `./build-for-ha.sh`
(Windows: `./build-for-ha.cmd`.)
Expected: a fresh production build is copied into `ha-addon/calendhd/rootfs/opt/calendhd/public/` (new `_app/*` chunks), along with hooks/migrations/push-service (unchanged this release).

- [ ] **Step 4: Confirm the bundle changed**

Run: `git status --short ha-addon/calendhd/rootfs/opt/calendhd/public`
Expected: modified `_app/*` files appear (proves the in-image bundle was refreshed — per CLAUDE.md, a version bump without a rebuilt rootfs ships an identical artifact).

- [ ] **Step 5: Commit**

```bash
git add ha-addon/calendhd/config.yaml ha-addon/calendhd/rootfs/opt/calendhd/public
git commit -m "release: rebuild HA add-on bundle for server-first frontend"
```

---

## Self-Review

**1. Spec coverage** (each spec section maps to a task):
- Delete `db/index.ts`, `db/routines.ts`, db tests → Task 9 ✓
- Delete `OfflineIndicator.svelte` → Task 7 ✓
- 5 stores server-first → Tasks 1–5 ✓
- `+layout.svelte` + `ui/index.ts` OfflineIndicator removal → Task 7 ✓
- `ExternalEventReminderRow.svelte` PocketBase-only (reuse `getExternalEventReminders` + filter by uid) → Task 6 ✓
- `types/index.ts` Local* + `local_id`/`last_synced` removal → Task 9 ✓
- Service worker push-only → Task 8 ✓
- i18n `status.*` removal + key balance → Task 7 ✓
- `tests/setup.ts` fake-indexeddb removal → Task 9 ✓
- `package.json` dexie/fake-indexeddb removal → Task 9 ✓
- Verify `i18n/index.ts` is a false positive → covered by Task 9 Step 1 grep (it does not match `$db`/`Local*`; the earlier hit was `getLocale`/`setLocale`) ✓
- Build/release (`build-for-ha.sh` + version bump) → Task 10 ✓
- Realtime kept, push kept → Tasks 2/4/5 keep `subscribeToUpdates`; Task 8 keeps push ✓
- Accepted tradeoff (checkbox latency, no optimistic exception) → Task 5 uses strict server-first; only adds error-catch, no optimistic flip ✓

**2. Placeholder scan:** No `TBD`/`TODO`/"handle edge cases"/"similar to Task N". Every code step shows complete content. ✓

**3. Type consistency:**
- `createEvent` param type `Omit<CalendarEvent,'id'|'created'|'updated'|'user'>` matches `createServerEvent` (pocketbase `createEvent`) signature ✓
- `routinesStore.getById` signature unchanged, consumed by calendar `displayEvents` + `toggleTaskComplete` ✓
- `settingsStore.weekStartsOn` / `streakCelebrationEnabled` getters unchanged, consumed by calendar ✓
- `getExternalEventReminders(subscriptionId)` returns `ExternalEventReminder[]` with `ical_uid`, `disabled`, `minutes_before` — matches Task 6 `hydrate` usage ✓
- Store `create` methods return the server record type (`Category`/`Template`/`RoutineTemplate`/`CalendarEvent`); callers that use the return value (none rely on the old temp shape) ✓
