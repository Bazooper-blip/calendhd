# External-Event Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users get push notifications for events from iCal subscriptions, with a per-subscription default lead-time and per-event overrides ("remind me 30 min before *this* meeting" / "no reminder for *this* one").

**Architecture:** Two layers, both backed by PocketBase + mirrored to Dexie.
1. **Subscription default** — two new fields on `calendar_subscriptions` (`reminders_enabled`, `default_reminder_minutes`).
2. **Per-event override** — new `external_event_reminders` collection keyed by stable `(subscription_id, ical_uid)` so it survives the wipe-and-replace done by subscription sync.

**Why a parallel scheduled-reminders collection.** Rather than modify the existing `scheduled_reminders` schema (its `event` relation is `required: true` and changing that in-place is unverified for PB 0.37 — every existing migration in this repo only *adds* or *removes* fields, never mutates), we add a new `external_scheduled_reminders` collection mirroring its shape. The reminder cron (`020_reminder_cron.pb.js`) gains a second loop that iterates this new collection.

A new hook (`015_external_reminder_scheduler.pb.js`) is a thin shell that `require()`s helpers from `pb_helpers.js` (matching the pattern in `060_routine_generator.pb.js`) — module-level functions are NOT visible inside PB JSVM callbacks (callback-scope-isolation gotcha), so the helper logic lives in `pb_helpers.js` where `$app` is global-accessible.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, Dexie (IndexedDB), PocketBase 0.37 JSVM hooks, Vitest, web-push via the bundled push-service.

---

## File Structure

**New files:**
- `pocketbase/pb_migrations/0005_external_event_reminders.js` — additive schema changes (subscription fields, two new collections)
- `pocketbase/pb_hooks/015_external_reminder_scheduler.pb.js` — thin callbacks delegating to pb_helpers
- `src/lib/components/calendar/ExternalEventReminderRow.svelte` — the "Remind me" row inside the modal

**Modified files:**
- `src/lib/types/index.ts` — `CalendarSubscription` gets two fields; new `ExternalEventReminder` type
- `src/lib/db/index.ts` — Dexie schema bump to v3; new `external_event_reminders` table + helpers
- `src/lib/db/index.test.ts` — coverage for the new helpers
- `src/lib/api/pocketbase.ts` — CRUD for `external_event_reminders`
- `src/routes/subscriptions/+page.svelte` — toggle + minutes select for the subscription default
- `src/lib/components/calendar/ExternalEventModal.svelte` — embeds the new reminder row
- `pocketbase/pb_hooks/020_reminder_cron.pb.js` — additional loop iterating `external_scheduled_reminders`
- `pocketbase/pb_hooks/pb_helpers.js` — exports `scheduleExternalReminder()` + `rescheduleExternalRemindersForSubscription()` + `rescheduleExternalRemindersForOverride()`
- `src/lib/i18n/locales/en.json` + `src/lib/i18n/locales/sv.json` — new keys (must stay key-balanced)
- `ha-addon/calendhd/config.yaml` — bump `version:` to `1.5.0`
- `CLAUDE.md` — note the new collections + hook in the architecture section

---

## Task 1: PocketBase migration — subscription defaults + two new collections (additive only)

**Files:**
- Create: `pocketbase/pb_migrations/0005_external_event_reminders.js`

**Why additive only:** every prior migration in this repo only adds or removes fields. Mutating an existing field's `required` flag via `fields.add()` with the same name has no precedent and is unverified for PB 0.37. So we leave `scheduled_reminders` alone and create a parallel `external_scheduled_reminders` collection.

- [ ] **Step 1: Write the migration**

```javascript
/// <reference path="../pb_data/types.d.ts" />

// =============================================================================
// 0005 — External-event reminders
//
//  - calendar_subscriptions.reminders_enabled (bool)
//  - calendar_subscriptions.default_reminder_minutes (number)
//  - new collection external_event_reminders — per-event overrides keyed by
//    (subscription, ical_uid). Survives the wipe-and-replace of external_events
//    on every sync because it's keyed by the stable iCal UID.
//  - new collection external_scheduled_reminders — parallel to
//    scheduled_reminders, but for external events. Has the same processing
//    contract (scheduled_for / sent_at / delivery_method / error_message)
//    and the reminder cron iterates both collections.
// =============================================================================

migrate((app) => {
  const usersCollectionId = app.findCollectionByNameOrId("users").id;
  const calSubsId = app.findCollectionByNameOrId("calendar_subscriptions").id;

  // ── calendar_subscriptions additions ─────────────────────────────────
  const calSubs = app.findCollectionByNameOrId("calendar_subscriptions");
  calSubs.fields.add(new BoolField({
    name: "reminders_enabled",
    required: false
  }));
  calSubs.fields.add(new NumberField({
    name: "default_reminder_minutes",
    required: false,
    min: 0,
    max: 10080,
    onlyInt: true
  }));
  app.save(calSubs);

  // ── external_event_reminders (per-event overrides) ──────────────────
  const overrides = new Collection({
    type: "base",
    name: "external_event_reminders",
    listRule: "@request.auth.id = user",
    viewRule: "@request.auth.id = user",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id = user",
    deleteRule: "@request.auth.id = user",
    fields: [
      { type: "relation", name: "user", required: true,
        collectionId: usersCollectionId, maxSelect: 1, cascadeDelete: false },
      { type: "relation", name: "subscription", required: true,
        collectionId: calSubsId, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "ical_uid", required: true, max: 500 },
      { type: "number", name: "minutes_before", required: false,
        min: 0, max: 10080, onlyInt: true },
      { type: "bool", name: "disabled", required: false }
    ],
    indexes: [
      "CREATE INDEX idx_ext_rem_user ON external_event_reminders (user)",
      "CREATE INDEX idx_ext_rem_sub ON external_event_reminders (subscription)",
      "CREATE UNIQUE INDEX idx_ext_rem_sub_uid ON external_event_reminders (subscription, ical_uid)"
    ]
  });
  app.save(overrides);

  // ── external_scheduled_reminders (parallel to scheduled_reminders) ──
  const extSched = new Collection({
    type: "base",
    name: "external_scheduled_reminders",
    listRule: "@request.auth.id = user",
    viewRule: "@request.auth.id = user",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id = user",
    deleteRule: "@request.auth.id = user",
    fields: [
      { type: "relation", name: "user", required: true,
        collectionId: usersCollectionId, maxSelect: 1, cascadeDelete: true },
      { type: "relation", name: "subscription", required: true,
        collectionId: calSubsId, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "ical_uid", required: true, max: 500 },
      { type: "date", name: "scheduled_for", required: true },
      { type: "select", name: "reminder_type", required: false,
        values: ["notification", "email"], maxSelect: 1 },
      { type: "date", name: "sent_at", required: false },
      { type: "select", name: "delivery_method", required: false,
        values: ["ha_companion", "ntfy", "browser", "web_push"], maxSelect: 1 },
      { type: "text", name: "error_message", required: false, max: 1000 }
    ],
    indexes: [
      "CREATE INDEX idx_ext_sched_user ON external_scheduled_reminders (user)",
      "CREATE INDEX idx_ext_sched_scheduled ON external_scheduled_reminders (scheduled_for)",
      "CREATE INDEX idx_ext_sched_sub_uid ON external_scheduled_reminders (subscription, ical_uid)"
    ]
  });
  app.save(extSched);
}, (app) => {
  // Down migration — reverse order
  try {
    const extSched = app.findCollectionByNameOrId("external_scheduled_reminders");
    app.delete(extSched);
  } catch (e) { /* not present */ }

  try {
    const overrides = app.findCollectionByNameOrId("external_event_reminders");
    app.delete(overrides);
  } catch (e) { /* not present */ }

  const calSubs = app.findCollectionByNameOrId("calendar_subscriptions");
  calSubs.fields.removeByName("reminders_enabled");
  calSubs.fields.removeByName("default_reminder_minutes");
  app.save(calSubs);
});
```

> **Note:** `delivery_method` includes `"web_push"` as an additional value because that's what `020_reminder_cron.pb.js` actually writes (the existing `scheduled_reminders.delivery_method` schema uses `["ha_companion", "ntfy", "browser"]` but the cron writes `"web_push"` — this is a latent bug in the existing schema; the new collection avoids the schema/code mismatch).

- [ ] **Step 2: Apply migration locally**

Run: `cd pocketbase && ./pocketbase migrate up`
Expected: `Applied 0005_external_event_reminders.js` (or similar PB migration confirmation).

- [ ] **Step 3: Verify schema**

Run: `cd pocketbase && ./pocketbase --dev` (briefly), open Admin UI, confirm `external_event_reminders` exists with the expected fields and that `scheduled_reminders.event` is now optional.

- [ ] **Step 4: Commit**

```bash
git add pocketbase/pb_migrations/0005_external_event_reminders.js
git commit -m "feat(pb): migration 0005 — external-event reminder schema"
```

---

## Task 2: TypeScript types

**Files:**
- Modify: `src/lib/types/index.ts`

- [ ] **Step 1: Extend `CalendarSubscription` and add `ExternalEventReminder`**

In `src/lib/types/index.ts`, locate the `CalendarSubscription` interface (around line 118) and replace it with:

```typescript
export interface CalendarSubscription extends BaseRecord {
	user: string;
	name: string;
	url: string;
	color_override?: string;
	refresh_interval_minutes: number;
	last_refreshed?: string;
	is_active: boolean;
	error_message?: string;
	reminders_enabled?: boolean;
	default_reminder_minutes?: number;
}
```

Then, immediately after the `ExternalEvent` interface (around line 142), add:

```typescript
// Per-external-event reminder override, keyed by stable iCal UID so it
// survives the wipe-and-replace done by subscription sync.
export interface ExternalEventReminder extends BaseRecord {
	user: string;
	subscription: string;
	ical_uid: string;
	minutes_before?: number; // null = use subscription default
	disabled?: boolean;
}
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: PASS (no new errors).

- [ ] **Step 3: Commit**

```bash
git add src/lib/types/index.ts
git commit -m "feat(types): CalendarSubscription reminder fields + ExternalEventReminder"
```

---

## Task 3: Dexie schema bump (v3) + helpers — failing tests first

**Files:**
- Modify: `src/lib/db/index.ts`
- Test: `src/lib/db/index.test.ts`

- [ ] **Step 1: Write failing tests for new helpers**

Append to `src/lib/db/index.test.ts` (after the `Settings` describe block, before the file's final `});`):

```typescript
// --- External event reminder overrides ---

describe('External event reminder overrides', () => {
	beforeEach(async () => {
		await db.external_event_reminders.clear();
	});

	it('upsertExternalEventReminder creates a row keyed by (subscription, ical_uid)', async () => {
		await upsertExternalEventReminder({
			user: TEST_USER,
			subscription: 'sub-1',
			ical_uid: 'evt-uid-1',
			minutes_before: 30,
			disabled: false
		});

		const row = await getExternalEventReminder('sub-1', 'evt-uid-1');
		expect(row).toBeDefined();
		expect(row!.minutes_before).toBe(30);
		expect(row!.disabled).toBe(false);
	});

	it('upsertExternalEventReminder updates existing row', async () => {
		await upsertExternalEventReminder({
			user: TEST_USER,
			subscription: 'sub-1',
			ical_uid: 'evt-uid-1',
			minutes_before: 30,
			disabled: false
		});
		await upsertExternalEventReminder({
			user: TEST_USER,
			subscription: 'sub-1',
			ical_uid: 'evt-uid-1',
			minutes_before: 5,
			disabled: false
		});

		const row = await getExternalEventReminder('sub-1', 'evt-uid-1');
		expect(row!.minutes_before).toBe(5);

		const all = await db.external_event_reminders.toArray();
		expect(all).toHaveLength(1);
	});

	it('deleteExternalEventReminder removes the row', async () => {
		await upsertExternalEventReminder({
			user: TEST_USER,
			subscription: 'sub-1',
			ical_uid: 'evt-uid-1',
			minutes_before: 15,
			disabled: false
		});
		await deleteExternalEventReminder('sub-1', 'evt-uid-1');
		const row = await getExternalEventReminder('sub-1', 'evt-uid-1');
		expect(row).toBeUndefined();
	});

	it('getExternalEventReminder returns undefined for unknown key', async () => {
		const row = await getExternalEventReminder('sub-x', 'unknown');
		expect(row).toBeUndefined();
	});
});
```

Also extend the imports at the top of the file (lines 2-23):

```typescript
import {
	db,
	generateLocalId,
	createLocalEvent,
	getLocalEvent,
	getLocalEvents,
	updateLocalEvent,
	deleteLocalEvent,
	hardDeleteLocalEvent,
	getPendingDeleteEvents,
	markEventSynced,
	createLocalCategory,
	getLocalCategories,
	updateLocalCategory,
	deleteLocalCategory,
	createLocalTemplate,
	getLocalTemplates,
	updateLocalTemplate,
	deleteLocalTemplate,
	setLocalSettings,
	getLocalSettings,
	upsertExternalEventReminder,
	getExternalEventReminder,
	deleteExternalEventReminder
} from './index';
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm run test -- src/lib/db/index.test.ts`
Expected: FAIL — "upsertExternalEventReminder is not exported" (or similar import error) and the new test cases erroring.

- [ ] **Step 3: Bump Dexie schema and add helpers**

In `src/lib/db/index.ts`, replace the imports block (lines 1-10) with:

```typescript
import Dexie, { type EntityTable } from 'dexie';
import type {
	LocalEvent,
	LocalCategory,
	LocalTemplate,
	LocalRoutineTemplate,
	CalendarSubscription,
	ExternalEvent,
	ExternalEventReminder,
	UserSettings
} from '$types';
```

Then replace the `CalendHDDatabase` class (lines 13-35) with:

```typescript
class CalendHDDatabase extends Dexie {
	events!: EntityTable<LocalEvent, 'local_id'>;
	categories!: EntityTable<LocalCategory, 'local_id'>;
	templates!: EntityTable<LocalTemplate, 'local_id'>;
	subscriptions!: EntityTable<CalendarSubscription, 'id'>;
	external_events!: EntityTable<ExternalEvent, 'id'>;
	external_event_reminders!: EntityTable<ExternalEventReminder, 'id'>;
	settings!: EntityTable<UserSettings, 'id'>;
	routine_templates!: EntityTable<LocalRoutineTemplate, 'local_id'>;

	constructor() {
		super('CalendHD');

		this.version(2).stores({
			events: 'local_id, id, user, start_time, end_time, category, template, sync_status, [user+start_time]',
			categories: 'local_id, id, user, sort_order, sync_status',
			templates: 'local_id, id, user, name, category, sync_status',
			subscriptions: 'id, user, name, is_active',
			external_events: 'id, user, subscription, uid, start_time, [user+start_time]',
			settings: 'id, user',
			routine_templates: 'local_id, id, user, name, is_active, sync_status'
		});

		this.version(3).stores({
			external_event_reminders: 'id, user, subscription, ical_uid, [subscription+ical_uid]'
		});
	}
}
```

Then append the helper functions to the bottom of the file (after `setLocalSettings`):

```typescript
// External event reminder overrides
// Keyed by (subscription, ical_uid) — survives the wipe-and-replace of
// external_events on every subscription sync.

export async function upsertExternalEventReminder(
	override: Omit<ExternalEventReminder, 'id' | 'created' | 'updated'> & { id?: string }
): Promise<void> {
	const existing = await db.external_event_reminders
		.where('[subscription+ical_uid]')
		.equals([override.subscription, override.ical_uid])
		.first();

	if (existing) {
		await db.external_event_reminders.update(existing.id, {
			minutes_before: override.minutes_before,
			disabled: override.disabled
		});
	} else {
		// Use a placeholder id until the server assigns one — primary key 'id'.
		const id = override.id ?? generateLocalId();
		await db.external_event_reminders.put({
			...override,
			id,
			created: '',
			updated: ''
		} as ExternalEventReminder);
	}
}

export async function getExternalEventReminder(
	subscription: string,
	icalUid: string
): Promise<ExternalEventReminder | undefined> {
	return db.external_event_reminders
		.where('[subscription+ical_uid]')
		.equals([subscription, icalUid])
		.first();
}

export async function deleteExternalEventReminder(
	subscription: string,
	icalUid: string
): Promise<void> {
	const existing = await db.external_event_reminders
		.where('[subscription+ical_uid]')
		.equals([subscription, icalUid])
		.first();
	if (existing) {
		await db.external_event_reminders.delete(existing.id);
	}
}

export async function getExternalEventRemindersForSubscription(
	subscription: string
): Promise<ExternalEventReminder[]> {
	return db.external_event_reminders.where('subscription').equals(subscription).toArray();
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm run test -- src/lib/db/index.test.ts`
Expected: PASS — all four new test cases plus existing ones.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/index.ts src/lib/db/index.test.ts
git commit -m "feat(db): external_event_reminders Dexie table + helpers"
```

---

## Task 4: PocketBase API helpers

**Files:**
- Modify: `src/lib/api/pocketbase.ts`

- [ ] **Step 1: Add the collection to the helper map**

In `src/lib/api/pocketbase.ts`, locate the `collections` object (around line 32) and add `external_event_reminders`:

```typescript
const collections = {
	users: () => getPocketBase().collection('users'),
	categories: () => getPocketBase().collection('categories'),
	templates: () => getPocketBase().collection('templates'),
	events: () => getPocketBase().collection('events'),
	calendar_subscriptions: () => getPocketBase().collection('calendar_subscriptions'),
	external_events: () => getPocketBase().collection('external_events'),
	external_event_reminders: () => getPocketBase().collection('external_event_reminders'),
	user_settings: () => getPocketBase().collection('user_settings'),
	scheduled_reminders: () => getPocketBase().collection('scheduled_reminders'),
	routine_templates: () => getPocketBase().collection('routine_templates'),
	brain_dump: () => getPocketBase().collection('brain_dump')
};
```

- [ ] **Step 2: Update the type import**

Locate the `import type` at the top (lines 2-12) and add `ExternalEventReminder`:

```typescript
import type {
	User,
	Category,
	Template,
	RoutineTemplate,
	CalendarEvent,
	CalendarSubscription,
	ExternalEvent,
	ExternalEventReminder,
	UserSettings,
	BrainDump
} from '$types';
```

- [ ] **Step 3: Add CRUD functions for external_event_reminders**

Append to `src/lib/api/pocketbase.ts` (end of file):

```typescript
// External event reminder overrides

export async function getExternalEventReminders(
	subscriptionId: string
): Promise<ExternalEventReminder[]> {
	const records = await collections.external_event_reminders().getFullList({
		filter: `subscription = "${subscriptionId}"`,
		batch: 200
	});
	return records as unknown as ExternalEventReminder[];
}

export async function upsertExternalEventReminderRemote(
	subscriptionId: string,
	icalUid: string,
	minutesBefore: number | null,
	disabled: boolean
): Promise<ExternalEventReminder> {
	const user = getCurrentUser();
	if (!user) throw new Error('Not authenticated');

	// Look up existing row for this (subscription, uid). Server-side filter
	// uses the unique index added by migration 0005.
	const existing = await collections.external_event_reminders().getFullList({
		filter: `subscription = "${subscriptionId}" && ical_uid = "${icalUid}"`,
		batch: 1
	});

	const payload = {
		user: user.id,
		subscription: subscriptionId,
		ical_uid: icalUid,
		minutes_before: minutesBefore,
		disabled
	};

	if (existing.length > 0) {
		const record = await collections
			.external_event_reminders()
			.update(existing[0].id, payload);
		return record as unknown as ExternalEventReminder;
	}
	const record = await collections.external_event_reminders().create(payload);
	return record as unknown as ExternalEventReminder;
}

export async function deleteExternalEventReminderRemote(
	subscriptionId: string,
	icalUid: string
): Promise<void> {
	const existing = await collections.external_event_reminders().getFullList({
		filter: `subscription = "${subscriptionId}" && ical_uid = "${icalUid}"`,
		batch: 1
	});
	if (existing.length > 0) {
		await collections.external_event_reminders().delete(existing[0].id);
	}
}
```

- [ ] **Step 4: Type-check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/api/pocketbase.ts
git commit -m "feat(api): CRUD for external_event_reminders"
```

---

## Task 5: Add scheduling helpers to pb_helpers.js

**Files:**
- Modify: `pocketbase/pb_hooks/pb_helpers.js`

**Why:** PB JSVM callbacks run in isolated goja runtimes — module-level functions in a hook file are NOT visible inside its callbacks. The established pattern (see `060_routine_generator.pb.js`) is: keep callbacks as thin shells that `require()` helpers from `pb_helpers.js` where `$app`, `$dbx`, `Record` are accessible globals.

- [ ] **Step 1: Append three new exports to pb_helpers.js**

Open `pocketbase/pb_hooks/pb_helpers.js`. The file ends with `generateAllRoutineEvents: function() { … }` followed by `};` at the end of the `module.exports` object. To extend it:

1. Add a comma after the closing `}` of `generateAllRoutineEvents` (it currently has no trailing comma because it's the last property).
2. Insert the three new functions before the closing `};`.

Concretely, replace the lines:

```javascript
    generateAllRoutineEvents: function() {
        var routines;
        try {
            routines = $app.findRecordsByFilter("routine_templates", "is_active = true", "", 100, 0);
        } catch (err) {
            return;
        }
        if (!routines || routines.length === 0) return;

        var today = new Date();
        var tomorrow = new Date(today.getTime() + 86400000);

        var self = this;
        for (var i = 0; i < routines.length; i++) {
            self.generateEventsForRoutine(routines[i], today);
            self.generateEventsForRoutine(routines[i], tomorrow);
        }
    }
};
```

with:

```javascript
    generateAllRoutineEvents: function() {
        var routines;
        try {
            routines = $app.findRecordsByFilter("routine_templates", "is_active = true", "", 100, 0);
        } catch (err) {
            return;
        }
        if (!routines || routines.length === 0) return;

        var today = new Date();
        var tomorrow = new Date(today.getTime() + 86400000);

        var self = this;
        for (var i = 0; i < routines.length; i++) {
            self.generateEventsForRoutine(routines[i], today);
            self.generateEventsForRoutine(routines[i], tomorrow);
        }
    },

    // ─────────────────────────────────────────────────────────────────
    // External-event reminders
    // ─────────────────────────────────────────────────────────────────

    scheduleExternalReminder: function(externalEvent) {
        var subscriptionId = externalEvent.get("subscription");
        var icalUid = externalEvent.get("uid");
        var userId = externalEvent.get("user");
        var startTime = externalEvent.get("start_time");
        if (!subscriptionId || !icalUid || !startTime) return;

        var subscription;
        try {
            subscription = $app.findRecordById("calendar_subscriptions", subscriptionId);
        } catch (err) {
            return;
        }
        if (!subscription.get("reminders_enabled")) return;

        var defaultMinutes = subscription.get("default_reminder_minutes");
        if (defaultMinutes === undefined || defaultMinutes === null || defaultMinutes === "") {
            defaultMinutes = 15;
        }

        // Look up override
        var minutesBefore = defaultMinutes;
        var disabled = false;
        try {
            var overrides = $app.findRecordsByFilter(
                "external_event_reminders",
                "subscription = {:sub} && ical_uid = {:uid}",
                "", 1, 0,
                { sub: subscriptionId, uid: icalUid }
            );
            if (overrides && overrides.length > 0) {
                var override = overrides[0];
                if (override.get("disabled")) {
                    disabled = true;
                } else {
                    var mb = override.get("minutes_before");
                    if (mb !== undefined && mb !== null && mb !== "") {
                        minutesBefore = mb;
                    }
                }
            }
        } catch (err) {
            // No override — use default
        }

        // Clean up any unsent scheduled rows for this (subscription, uid)
        try {
            var stale = $app.findAllRecords("external_scheduled_reminders", $dbx.and(
                $dbx.hashExp({ "subscription": subscriptionId, "ical_uid": icalUid }),
                $dbx.newExp("sent_at = '' OR sent_at IS NULL")
            ));
            for (var i = 0; i < stale.length; i++) {
                try { $app.delete(stale[i]); } catch (e) { /* ignore */ }
            }
        } catch (err) {
            // Nothing to clean up
        }

        if (disabled) return;

        var eventTime = new Date(startTime);
        var scheduledFor = new Date(eventTime.getTime() - (minutesBefore * 60 * 1000));
        if (scheduledFor <= new Date()) return;

        try {
            var collection = $app.findCollectionByNameOrId("external_scheduled_reminders");
            var record = new Record(collection);
            record.set("user", userId);
            record.set("subscription", subscriptionId);
            record.set("ical_uid", icalUid);
            record.set("scheduled_for", scheduledFor.toISOString());
            record.set("reminder_type", "notification");
            $app.save(record);
            console.log("[ext-rem] scheduled reminder for '" + externalEvent.get("title") + "' at " + scheduledFor.toISOString());
        } catch (err) {
            console.log("[ext-rem] failed to schedule:", err);
        }
    },

    rescheduleExternalRemindersForSubscription: function(subscriptionId) {
        // Clear all unsent reminders for the subscription
        try {
            var stale = $app.findAllRecords("external_scheduled_reminders", $dbx.and(
                $dbx.hashExp({ "subscription": subscriptionId }),
                $dbx.newExp("sent_at = '' OR sent_at IS NULL")
            ));
            for (var i = 0; i < stale.length; i++) {
                try { $app.delete(stale[i]); } catch (e) { /* ignore */ }
            }
        } catch (err) {
            // No prior reminders
        }

        // Re-schedule for each upcoming external event
        try {
            var nowISO = new Date().toISOString();
            var events = $app.findRecordsByFilter(
                "external_events",
                "subscription = {:sub} && start_time >= {:now}",
                "", 500, 0,
                { sub: subscriptionId, now: nowISO }
            );
            for (var j = 0; j < events.length; j++) {
                this.scheduleExternalReminder(events[j]);
            }
        } catch (err) {
            console.log("[ext-rem] reschedule for subscription failed:", err);
        }
    },

    rescheduleExternalRemindersForOverride: function(subscriptionId, icalUid) {
        if (!subscriptionId || !icalUid) return;
        try {
            var events = $app.findRecordsByFilter(
                "external_events",
                "subscription = {:sub} && uid = {:uid}",
                "", 50, 0,
                { sub: subscriptionId, uid: icalUid }
            );
            for (var i = 0; i < events.length; i++) {
                this.scheduleExternalReminder(events[i]);
            }
        } catch (err) {
            console.log("[ext-rem] reschedule for override failed:", err);
        }
    }
};
```

> **Watch the trailing brace:** the snippet above ends with `};` — that's the close of `module.exports`. After the edit, the file should end with `};` (one closing brace + semicolon), not `}};`.

- [ ] **Step 2: Sanity check — file must still parse**

Run: `cd pocketbase && ./pocketbase serve` for ~5 seconds.
Expected: PocketBase boots without "JS error" messages mentioning `pb_helpers.js`. Stop PB.

- [ ] **Step 3: Commit**

```bash
git add pocketbase/pb_hooks/pb_helpers.js
git commit -m "feat(pb): pb_helpers — external-event reminder scheduling helpers"
```

---

## Task 5b: External-event reminder scheduler hook (thin shell)

**Files:**
- Create: `pocketbase/pb_hooks/015_external_reminder_scheduler.pb.js`

**Why a thin shell:** each callback `require()`s the helper module fresh — that's the established pattern (see `060_routine_generator.pb.js`). DO NOT define `function foo() {}` at module level here; PB JSVM callbacks run in isolated goja runtimes and module-level declarations are not visible inside them.

- [ ] **Step 1: Write the hook**

```javascript
/// <reference path="../pb_data/types.d.ts" />

// =============================================================================
// 015 — Schedule reminders for external (subscription-sourced) events
//
// Thin callbacks delegating to pb_helpers — module-level functions are NOT
// visible inside PB JSVM callbacks (callback scope isolation), so the heavy
// lifting lives in pb_helpers.js.
// =============================================================================

// Schedule on external_event create/update — subscription sync calls these N
// times per refresh because it deletes-and-recreates external_events.
onRecordAfterCreateSuccess("external_events", (e) => {
    const helpers = require(`${__hooks}/pb_helpers.js`);
    helpers.scheduleExternalReminder(e.record);
});

onRecordAfterUpdateSuccess("external_events", (e) => {
    const helpers = require(`${__hooks}/pb_helpers.js`);
    helpers.scheduleExternalReminder(e.record);
});

// Reschedule everything for a subscription whose defaults changed.
onRecordAfterUpdateSuccess("calendar_subscriptions", (e) => {
    const helpers = require(`${__hooks}/pb_helpers.js`);
    helpers.rescheduleExternalRemindersForSubscription(e.record.id);
});

// A new/updated/deleted override should re-schedule for that specific
// (subscription, uid). Read keys BEFORE delegating because the deleted record
// is still queryable inside the callback.
onRecordAfterCreateSuccess("external_event_reminders", (e) => {
    const helpers = require(`${__hooks}/pb_helpers.js`);
    helpers.rescheduleExternalRemindersForOverride(
        e.record.get("subscription"),
        e.record.get("ical_uid")
    );
});

onRecordAfterUpdateSuccess("external_event_reminders", (e) => {
    const helpers = require(`${__hooks}/pb_helpers.js`);
    helpers.rescheduleExternalRemindersForOverride(
        e.record.get("subscription"),
        e.record.get("ical_uid")
    );
});

onRecordAfterDeleteSuccess("external_event_reminders", (e) => {
    const helpers = require(`${__hooks}/pb_helpers.js`);
    helpers.rescheduleExternalRemindersForOverride(
        e.record.get("subscription"),
        e.record.get("ical_uid")
    );
});
```

- [ ] **Step 2: Restart PocketBase and verify the hook loads**

Run: `cd pocketbase && ./pocketbase serve` for ~5 seconds.
Expected: startup logs show no parse errors mentioning `015_external_reminder_scheduler.pb.js`. Stop PB.

- [ ] **Step 3: Commit**

```bash
git add pocketbase/pb_hooks/015_external_reminder_scheduler.pb.js
git commit -m "feat(pb): hook 015 — schedule external-event reminders"
```

---

## Task 6: Add a parallel external-reminder loop to the cron

**Files:**
- Modify: `pocketbase/pb_hooks/020_reminder_cron.pb.js`

**Why a parallel loop instead of polymorphism:** the existing `scheduled_reminders` collection's `event` relation is `required: true`. Mutating that to optional in a migration is unverified for PB 0.37 (no precedent in this repo). Instead, the cron iterates a second, parallel `external_scheduled_reminders` collection. The internal-event path (lines 8-31 + `processReminder`) is left UNCHANGED.

- [ ] **Step 1: Add the external loop and helper inside the cronAdd callback**

In `pocketbase/pb_hooks/020_reminder_cron.pb.js`, locate the closing brace of the `cronAdd` callback (currently around line 165 — `});` at end of file) and INSERT immediately before that closing `});`:

```javascript

    // ── External-event reminders ──────────────────────────────────
    // Parallel collection: external_scheduled_reminders. Same processing
    // contract (scheduled_for / sent_at / delivery_method / error_message).
    var dueExternal;
    try {
        dueExternal = $app.findAllRecords("external_scheduled_reminders", $dbx.and(
            $dbx.newExp("scheduled_for <= {:now}", { now: nowISO }),
            $dbx.newExp("sent_at = '' OR sent_at IS NULL")
        ));
    } catch (err) {
        dueExternal = [];
    }

    if (dueExternal && dueExternal.length > 0) {
        console.log("Processing " + dueExternal.length + " due external reminders");
        for (var k = 0; k < dueExternal.length; k++) {
            processExternalReminder(dueExternal[k], nowISO);
        }
    }

    function processExternalReminder(reminder, nowISO) {
        var userId = reminder.get("user");
        var subId = reminder.get("subscription");
        var uid = reminder.get("ical_uid");
        if (!subId || !uid) {
            markExternalReminderSent(reminder, nowISO, "missing_external_keys");
            return;
        }

        // Look up the matching external event (UID is stable across re-syncs)
        var ext;
        try {
            var matches = $app.findRecordsByFilter(
                "external_events",
                "subscription = {:sub} && uid = {:uid}",
                "", 1, 0,
                { sub: subId, uid: uid }
            );
            if (!matches || matches.length === 0) {
                markExternalReminderSent(reminder, nowISO, "external_event_missing");
                return;
            }
            ext = matches[0];
        } catch (err) {
            markExternalReminderSent(reminder, nowISO, "external_lookup_failed");
            return;
        }

        var eventTitle = ext.get("title") || "Event";
        var eventStart = ext.get("start_time") || "";
        var notificationTag = "calendhd-ext-reminder-" + uid;

        // Load user settings
        var userSettings;
        try {
            var settingsRecords = $app.findAllRecords("user_settings", $dbx.hashExp({ "user": userId }));
            userSettings = settingsRecords.length > 0 ? settingsRecords[0] : null;
        } catch (err) {
            userSettings = null;
        }

        var message = formatReminderMessage(eventTitle, eventStart);

        // sendWebPushNotification's existing signature is
        // (userSettings, title, message, eventId). Pass the tag in eventId's
        // slot — the existing implementation only uses it to build the tag.
        var pushResult = sendWebPushNotification(userSettings, eventTitle, message, notificationTag);
        var deliveryMethod = "";
        var errorMessage = "";
        if (pushResult.success) {
            deliveryMethod = "web_push";
        } else {
            errorMessage = pushResult.error;
        }

        markExternalReminderSent(reminder, nowISO, errorMessage, deliveryMethod);

        if (pushResult.success) {
            console.log("Sent ext reminder for '" + eventTitle + "' via " + deliveryMethod + " to user " + userId);
        } else {
            console.log("Failed to send ext reminder for '" + eventTitle + "': " + errorMessage);
        }
    }

    function markExternalReminderSent(reminder, nowISO, errorMessage, deliveryMethod) {
        try {
            reminder.set("sent_at", nowISO);
            if (deliveryMethod) {
                reminder.set("delivery_method", deliveryMethod);
            }
            if (errorMessage) {
                reminder.set("error_message", errorMessage);
            }
            $app.save(reminder);
        } catch (err) {
            console.log("Failed to mark ext reminder as sent:", err);
        }
    }
```

> **Important — placement:** these functions MUST be inside the `cronAdd` callback (alongside the existing `processReminder` / `sendWebPushNotification` helpers). Defining them at module level would invisible them to the cron's goja runtime (callback scope isolation gotcha). The existing helpers `formatReminderMessage`, `sendWebPushNotification`, `markReminderSent` are already inside the callback (lines 33+), so they're in scope when the new functions reference them.

- [ ] **Step 2: Reuse the existing return-early guard correctly**

The existing cron returns early when `dueReminders.length === 0`. Locate this block (around lines 23-25):

```javascript
    if (!dueReminders || dueReminders.length === 0) {
        return;
    }
```

Replace it with:

```javascript
    var hasInternal = dueReminders && dueReminders.length > 0;
    if (hasInternal) {
        console.log("Processing " + dueReminders.length + " due reminders");
    }
```

Then locate the existing internal-loop (around lines 27-31):

```javascript
    console.log("Processing " + dueReminders.length + " due reminders");

    for (var i = 0; i < dueReminders.length; i++) {
        processReminder(dueReminders[i], nowISO);
    }
```

Replace with:

```javascript
    if (hasInternal) {
        for (var i = 0; i < dueReminders.length; i++) {
            processReminder(dueReminders[i], nowISO);
        }
    }
```

This way the function falls through to the new external-loop block instead of returning early when only external reminders are due.

- [ ] **Step 3: Manual smoke test**

Run: `cd pocketbase && ./pocketbase serve`. Open the Admin UI and create an `external_scheduled_reminders` row directly:
```
user = <singleton user id>
subscription = <a real subscription id>
ical_uid = <any uid that exists in external_events for that sub>
scheduled_for = <ISO timestamp ~30s from now>
reminder_type = notification
```
Expected: within ~1 minute the cron logs `Processing 1 due external reminders` followed by `Sent ext reminder…` (or a clear error if push isn't wired locally — `no_push_subscription` is fine, just confirm the external loop ran). Stop PB.

- [ ] **Step 4: Commit**

```bash
git add pocketbase/pb_hooks/020_reminder_cron.pb.js
git commit -m "feat(pb): cron iterates external_scheduled_reminders"
```

---

## Task 7: ExternalEventReminderRow component

**Files:**
- Create: `src/lib/components/calendar/ExternalEventReminderRow.svelte`

- [ ] **Step 1: Write the component**

```svelte
<script lang="ts">
	import { _ } from '$lib/i18n';
	import { toast } from 'svelte-sonner';
	import {
		upsertExternalEventReminderRemote,
		deleteExternalEventReminderRemote
	} from '$api/pocketbase';
	import {
		upsertExternalEventReminder,
		deleteExternalEventReminder,
		getExternalEventReminder
	} from '$db';
	import type { CalendarSubscription, ExternalEvent } from '$types';

	interface Props {
		external: ExternalEvent;
		subscription: CalendarSubscription | null;
	}

	let { external, subscription }: Props = $props();

	type Mode = 'default' | 'off' | 'custom';

	let mode = $state<Mode>('default');
	let customMinutes = $state<number>(15);
	let saving = $state(false);
	let loaded = $state(false);

	const remindersEnabled = $derived(subscription?.reminders_enabled ?? false);
	const defaultMinutes = $derived(subscription?.default_reminder_minutes ?? 15);

	$effect(() => {
		void hydrate(external.subscription, external.uid);
	});

	async function hydrate(subscriptionId: string, uid: string) {
		loaded = false;
		const row = await getExternalEventReminder(subscriptionId, uid);
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

	async function persist() {
		if (!subscription) return;
		saving = true;
		try {
			if (mode === 'default') {
				await deleteExternalEventReminderRemote(external.subscription, external.uid);
				await deleteExternalEventReminder(external.subscription, external.uid);
			} else if (mode === 'off') {
				await upsertExternalEventReminderRemote(
					external.subscription,
					external.uid,
					null,
					true
				);
				await upsertExternalEventReminder({
					user: external.user,
					subscription: external.subscription,
					ical_uid: external.uid,
					minutes_before: undefined,
					disabled: true
				});
			} else {
				await upsertExternalEventReminderRemote(
					external.subscription,
					external.uid,
					customMinutes,
					false
				);
				await upsertExternalEventReminder({
					user: external.user,
					subscription: external.subscription,
					ical_uid: external.uid,
					minutes_before: customMinutes,
					disabled: false
				});
			}
			toast.success($_('externalEvent.reminderSaved'));
		} catch (err) {
			toast.error($_('errors.generic'));
		} finally {
			saving = false;
		}
	}

	function onModeChange(newMode: Mode) {
		mode = newMode;
		void persist();
	}

	function onCustomMinutesChange(value: number) {
		customMinutes = value;
		if (mode === 'custom') void persist();
	}

	const minuteOptions = [5, 10, 15, 30, 60, 120, 1440];
</script>

{#if !remindersEnabled}
	<div class="text-xs text-neutral-500 dark:text-neutral-400">
		{$_('externalEvent.remindersOffForSubscription')}
	</div>
{:else if loaded}
	<div class="space-y-2">
		<div class="flex flex-wrap items-center gap-2">
			<label class="inline-flex items-center gap-1.5 text-sm">
				<input
					type="radio"
					name="reminder-mode"
					value="default"
					checked={mode === 'default'}
					disabled={saving}
					onchange={() => onModeChange('default')}
				/>
				<span class="text-neutral-700 dark:text-neutral-200">
					{$_('externalEvent.reminderUseDefault', { values: { minutes: defaultMinutes } })}
				</span>
			</label>
			<label class="inline-flex items-center gap-1.5 text-sm">
				<input
					type="radio"
					name="reminder-mode"
					value="custom"
					checked={mode === 'custom'}
					disabled={saving}
					onchange={() => onModeChange('custom')}
				/>
				<span class="text-neutral-700 dark:text-neutral-200">{$_('externalEvent.reminderCustom')}</span>
			</label>
			<label class="inline-flex items-center gap-1.5 text-sm">
				<input
					type="radio"
					name="reminder-mode"
					value="off"
					checked={mode === 'off'}
					disabled={saving}
					onchange={() => onModeChange('off')}
				/>
				<span class="text-neutral-700 dark:text-neutral-200">{$_('externalEvent.reminderOff')}</span>
			</label>
		</div>

		{#if mode === 'custom'}
			<select
				bind:value={customMinutes}
				disabled={saving}
				onchange={() => onCustomMinutesChange(customMinutes)}
				class="px-3 py-1.5 rounded-lg border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-sm text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
			>
				{#each minuteOptions as m}
					<option value={m}>
						{m < 60
							? `${m} ${$_('time.minutes')}`
							: m === 60
								? `1 ${$_('time.hour')}`
								: m === 1440
									? `1 ${$_('time.day')}`
									: `${m / 60} ${$_('time.hours')}`}
					</option>
				{/each}
			</select>
		{/if}
	</div>
{/if}
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: PASS (i18n keys are not yet present — that's fine, they're loaded at runtime; the missing-key warning will show at dev time but is resolved by Task 9).

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/calendar/ExternalEventReminderRow.svelte
git commit -m "feat(ui): ExternalEventReminderRow component"
```

---

## Task 8: Wire the reminder row into ExternalEventModal

**Files:**
- Modify: `src/lib/components/calendar/ExternalEventModal.svelte`

- [ ] **Step 1: Import + load subscription + render row**

Replace the contents of `src/lib/components/calendar/ExternalEventModal.svelte` with:

```svelte
<script lang="ts">
	import { Modal } from '$components/ui';
	import { _ } from '$lib/i18n';
	import { settingsStore } from '$stores';
	import { formatDateSmart, formatTimeRange } from '$utils';
	import { getPocketBase } from '$api/pocketbase';
	import ExternalEventReminderRow from './ExternalEventReminderRow.svelte';
	import type { DisplayEvent, ExternalEvent, CalendarSubscription } from '$types';

	interface Props {
		event: DisplayEvent | null;
		onclose: () => void;
	}

	let { event, onclose }: Props = $props();

	let subscription = $state<CalendarSubscription | null>(null);

	const open = $derived(event !== null);
	const format24h = $derived(settingsStore.timeFormat === '24h');

	const external = $derived.by(() => {
		if (!event) return null;
		return event.original_event as ExternalEvent;
	});

	$effect(() => {
		if (!external) {
			subscription = null;
			return;
		}
		void loadSubscription(external.subscription);
	});

	async function loadSubscription(id: string) {
		try {
			const record = await getPocketBase()
				.collection('calendar_subscriptions')
				.getOne(id);
			subscription = record as unknown as CalendarSubscription;
		} catch {
			subscription = null;
		}
	}

	const dateLabel = $derived.by(() => {
		if (!event) return '';
		const t = {
			today: $_('common.today'),
			tomorrow: $_('common.tomorrow'),
			yesterday: $_('common.yesterday')
		};
		return formatDateSmart(event.start, t);
	});

	const timeLabel = $derived.by(() => {
		if (!event) return '';
		if (event.is_all_day) return $_('time.allDay');
		return formatTimeRange(event.start, event.end, format24h);
	});
</script>

<Modal {open} title={event?.title ?? ''} size="md" {onclose}>
	{#if event && external}
		<div class="space-y-4">
			<div class="flex items-center gap-2 flex-wrap">
				<span
					class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border-l-4"
					style:background-color="{event.color}20"
					style:border-left-color={event.color}
				>
					<span class="w-2 h-2 rounded-full" style:background-color={event.color}></span>
					<span class="text-neutral-700 dark:text-neutral-200">
						{event.subscription_name ?? $_('externalEvent.fromCalendar')}
					</span>
				</span>
				<span class="inline-flex items-center gap-1 rounded-full bg-neutral-100 dark:bg-neutral-700 px-2 py-1 text-xs text-neutral-600 dark:text-neutral-300">
					<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
					</svg>
					{$_('externalEvent.readOnly')}
				</span>
			</div>

			<div>
				<div class="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">
					{$_('event.date')}
				</div>
				<div class="text-sm text-neutral-800 dark:text-neutral-100">{dateLabel}</div>
				<div class="text-sm text-neutral-600 dark:text-neutral-300">{timeLabel}</div>
			</div>

			{#if external.location}
				<div>
					<div class="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">
						{$_('externalEvent.location')}
					</div>
					<div class="text-sm text-neutral-800 dark:text-neutral-100 whitespace-pre-line break-words">
						{external.location}
					</div>
				</div>
			{/if}

			{#if external.description}
				<div>
					<div class="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">
						{$_('event.description')}
					</div>
					<div class="text-sm text-neutral-800 dark:text-neutral-100 whitespace-pre-line break-words">
						{external.description}
					</div>
				</div>
			{/if}

			<div class="pt-2 border-t border-neutral-100 dark:border-neutral-700">
				<div class="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-2">
					{$_('externalEvent.reminderHeader')}
				</div>
				<ExternalEventReminderRow {external} {subscription} />
			</div>
		</div>
	{/if}
</Modal>
```

- [ ] **Step 2: Type-check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/calendar/ExternalEventModal.svelte
git commit -m "feat(ui): embed reminder row in ExternalEventModal"
```

---

## Task 9: i18n keys (en + sv must stay key-balanced)

**Files:**
- Modify: `src/lib/i18n/locales/en.json`
- Modify: `src/lib/i18n/locales/sv.json`

- [ ] **Step 1: Add English keys**

Open `src/lib/i18n/locales/en.json`. Locate the `externalEvent` object (search for `"externalEvent"`) and merge in:

```json
"reminderHeader": "Reminder",
"reminderUseDefault": "Default ({minutes} min before)",
"reminderCustom": "Custom",
"reminderOff": "Off",
"reminderSaved": "Reminder updated",
"remindersOffForSubscription": "Reminders are turned off for this calendar. Enable them in Subscriptions."
```

Then locate the `subscription` object and add:

```json
"remindersEnabled": "Send reminders for events",
"defaultReminderMinutes": "Default lead time"
```

Add a `time` block (or merge into the existing one) with:

```json
"minutes": "minutes",
"hour": "hour",
"hours": "hours",
"day": "day"
```
(Skip any keys that already exist — `minutes`/`allDay` may already be defined.)

- [ ] **Step 2: Add Swedish keys**

Open `src/lib/i18n/locales/sv.json`. Add the matching keys in the same paths:

```json
// externalEvent.*
"reminderHeader": "Påminnelse",
"reminderUseDefault": "Standard ({minutes} min innan)",
"reminderCustom": "Anpassad",
"reminderOff": "Av",
"reminderSaved": "Påminnelse uppdaterad",
"remindersOffForSubscription": "Påminnelser är avstängda för den här kalendern. Aktivera dem i Prenumerationer."

// subscription.*
"remindersEnabled": "Skicka påminnelser för händelser",
"defaultReminderMinutes": "Standard ledtid"

// time.*
"minutes": "minuter",
"hour": "timme",
"hours": "timmar",
"day": "dag"
```

- [ ] **Step 3: Verify key parity**

Run:
```bash
python3 -c "import json; e=json.load(open('src/lib/i18n/locales/en.json')); s=json.load(open('src/lib/i18n/locales/sv.json'))
def k(d,p=''):
    out=set()
    for x,v in d.items():
        if isinstance(v,dict): out.update(k(v,(f'{p}.{x}' if p else x)))
        else: out.add(f'{p}.{x}' if p else x)
    return out
print('en-only:', sorted(k(e)-k(s)))
print('sv-only:', sorted(k(s)-k(e)))"
```
Expected: both lists empty.

- [ ] **Step 4: Commit**

```bash
git add src/lib/i18n/locales/en.json src/lib/i18n/locales/sv.json
git commit -m "i18n: external-event reminder + subscription default keys (en/sv)"
```

---

## Task 10: Subscription form — toggle + default minutes

**Files:**
- Modify: `src/routes/subscriptions/+page.svelte`

- [ ] **Step 1: Add state for the new fields**

In `src/routes/subscriptions/+page.svelte`, find the form-state block (around lines 17-21) and replace with:

```typescript
// Form state
let name = $state('');
let url = $state('');
let colorOverride = $state('');
let refreshIntervalMinutes = $state(60);
let remindersEnabled = $state(false);
let defaultReminderMinutes = $state(15);
```

Update `openCreateModal` (lines 39-46):

```typescript
function openCreateModal() {
	editingSubscription = null;
	name = '';
	url = '';
	colorOverride = '#9A88B5';
	refreshIntervalMinutes = 60;
	remindersEnabled = false;
	defaultReminderMinutes = 15;
	showModal = true;
}
```

Update `openEditModal` (lines 48-55):

```typescript
function openEditModal(subscription: CalendarSubscription) {
	editingSubscription = subscription;
	name = subscription.name;
	url = subscription.url;
	colorOverride = subscription.color_override || '#9A88B5';
	refreshIntervalMinutes = subscription.refresh_interval_minutes;
	remindersEnabled = subscription.reminders_enabled ?? false;
	defaultReminderMinutes = subscription.default_reminder_minutes ?? 15;
	showModal = true;
}
```

Update `handleSubmit` (around lines 62-101) to include the new fields in the create + update payloads. Replace the `if (editingSubscription)` block with:

```typescript
if (editingSubscription) {
	await updateSubscription(editingSubscription.id, {
		name,
		url: normalizedUrl,
		color_override: colorOverride || undefined,
		refresh_interval_minutes: refreshIntervalMinutes,
		reminders_enabled: remindersEnabled,
		default_reminder_minutes: defaultReminderMinutes
	});
	toast.success($t('subscription.updated'));
	await syncSubscription(editingSubscription.id);
} else {
	const newSub = await createSubscription({
		name,
		url: normalizedUrl,
		color_override: colorOverride || undefined,
		refresh_interval_minutes: refreshIntervalMinutes,
		is_active: true,
		reminders_enabled: remindersEnabled,
		default_reminder_minutes: defaultReminderMinutes
	});
	toast.success($t('subscription.created'));
	await loadSubscriptions();
	await syncSubscription(newSub.id);
}
```

- [ ] **Step 2: Add the form fields to the modal**

In the same file, locate the `<select id="refresh">` block (around line 351) and append immediately after the closing `</select>`'s containing `<div>`:

```svelte
<div class="pt-2 border-t border-neutral-100 dark:border-neutral-700">
	<label class="flex items-center justify-between gap-2 mb-3">
		<span class="text-sm font-medium text-neutral-700 dark:text-neutral-300">
			{$t('subscription.remindersEnabled')}
		</span>
		<Toggle bind:checked={remindersEnabled} />
	</label>

	{#if remindersEnabled}
		<label for="default-reminder" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
			{$t('subscription.defaultReminderMinutes')}
		</label>
		<select
			id="default-reminder"
			bind:value={defaultReminderMinutes}
			class="w-full px-3 py-2 rounded-lg border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-neutral-700 text-neutral-800 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500"
		>
			<option value={5}>5 {$t('time.minutes')}</option>
			<option value={10}>10 {$t('time.minutes')}</option>
			<option value={15}>15 {$t('time.minutes')}</option>
			<option value={30}>30 {$t('time.minutes')}</option>
			<option value={60}>1 {$t('time.hour')}</option>
			<option value={120}>2 {$t('time.hours')}</option>
			<option value={1440}>1 {$t('time.day')}</option>
		</select>
	{/if}
</div>
```

- [ ] **Step 3: Type-check**

Run: `npm run check`
Expected: PASS.

- [ ] **Step 4: Manual smoke test**

Run: `npm run dev` (with PocketBase serving). Open `/subscriptions`, edit any subscription, toggle "Send reminders" on, choose 30 min, save. Expected: form closes, the subscription record on PB shows `reminders_enabled: true, default_reminder_minutes: 30` (verify in Admin UI).

- [ ] **Step 5: Commit**

```bash
git add src/routes/subscriptions/+page.svelte
git commit -m "feat(ui): subscription form — reminders toggle + default minutes"
```

---

## Task 11: End-to-end manual verification

This task has no code, only verification. It exists so the executor doesn't skip the integration check.

- [ ] **Step 1: Start the stack**

Run: `cd pocketbase && ./pocketbase serve` (terminal A) and `npm run dev` (terminal B).

- [ ] **Step 2: Subscribe to a known iCal feed with at least one event in the next ~10 minutes**

Use a quick test feed (e.g. a Google Calendar public ICS with a short-fuse event you create yourself), then go to `/subscriptions` and:
- Add the subscription, toggle "Send reminders" ON, set default to 5 minutes, save.
- Confirm the manual sync runs and external_events appear in `/calendar/day/today`.

- [ ] **Step 3: Verify default reminder fired**

Wait for the time `(event.start - 5min)`. Expected: a push notification arrives with the event title (or, if push isn't configured locally, check the `external_scheduled_reminders` admin UI: a row with `subscription` matching your sub and `sent_at` populated within 1 minute of the scheduled time).

- [ ] **Step 4: Verify per-event override**

Open another upcoming external event in the calendar, click it, choose **Custom → 1 min**. Wait. Expected: the reminder fires 1 minute before that event's start, not 5.

- [ ] **Step 5: Verify "Off" override**

Open another upcoming external event, choose **Off**. Expected: no notification fires for that event when its time arrives.

- [ ] **Step 6: Verify override survives re-sync**

Trigger a manual sync of the subscription (button on `/subscriptions`). Expected: the override rows in `external_event_reminders` are unchanged; new `scheduled_reminders` rows appear for upcoming events with the override values applied.

If any of these fail, debug and fix BEFORE moving on. Common failure modes:
- Hook didn't load → check PocketBase startup logs for parse errors
- Override not applied → confirm `external_event_reminders` row has the right `subscription` (PB id, not name) and `ical_uid`
- Push not received → verify `user_settings.push_subscription` is set; check push-service logs

- [ ] **Step 7: Commit any fix-ups**

```bash
git status
# If anything was changed during debugging:
git add <files>
git commit -m "fix: <specific issue>"
```

---

## Task 12: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the new collections in the Migrations section**

In `CLAUDE.md`, find the migrations list (in the PocketBase section) and append:

```
5. `0005_external_event_reminders.js` — `calendar_subscriptions.{reminders_enabled, default_reminder_minutes}`; new `external_event_reminders` collection (per-event overrides keyed by subscription+ical_uid); new `external_scheduled_reminders` collection (parallel to `scheduled_reminders` for the external-event reminder pipeline)
```

- [ ] **Step 2: Document the new hook**

In the same section, in the Hooks list, add:

```
- `015_external_reminder_scheduler.pb.js` — thin shell that delegates to pb_helpers; on `external_events` create/update writes a row to `external_scheduled_reminders` applying per-event override + subscription default; reschedules when overrides or subscription settings change
```

- [ ] **Step 3: Note Dexie v3**

In the Dexie schema table at the top of the database section, add a row:

```
| external_event_reminders | id | Per-external-event reminder override (keyed by subscription+ical_uid). Mirrored from PB; pure local cache for the modal. |
```

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs(claude.md): external-event reminder schema + hook"
```

---

## Task 13: Sync to HA addon and bump version

**Files:**
- Modify: `ha-addon/calendhd/config.yaml`
- (build script writes everything else into `ha-addon/calendhd/`)

- [ ] **Step 1: Bump the addon version**

In `ha-addon/calendhd/config.yaml`, change `version:` to the next release number (current is the version after 1.4.5; pick `1.5.0` since this is a feature addition).

- [ ] **Step 2: Run the build script**

Run (Windows): `./build-for-ha.cmd`
Or (Linux/macOS): `./build-for-ha.sh`

Expected: script reports a successful build and rsync of `pb_hooks/`, `pb_migrations/`, and `rootfs/opt/calendhd/public/`. No errors.

- [ ] **Step 3: Verify the new files landed in the addon**

Run:
```bash
ls ha-addon/calendhd/pb_hooks/015_external_reminder_scheduler.pb.js
ls ha-addon/calendhd/pb_migrations/0005_external_event_reminders.js
```
Expected: both files exist.

- [ ] **Step 4: Commit the addon sync**

```bash
git add ha-addon/calendhd/
git commit -m "release: 1.5.0 — external-event reminders"
```

- [ ] **Step 5: Update the changelog**

In `ha-addon/calendhd/CHANGELOG.md`, prepend:

```markdown
## 1.5.0

- Add reminders for external (subscription) events: per-subscription default lead-time, per-event override (custom minutes / off), survives re-sync.
```

Commit:

```bash
git add ha-addon/calendhd/CHANGELOG.md
git commit -m "docs(addon): changelog 1.5.0"
```

---

## Definition of Done

- [ ] All Task 1-13 steps green and committed
- [ ] `npm run check` clean
- [ ] `npm run test` clean
- [ ] Manual e2e (Task 11) passed for default / custom / off / re-sync paths
- [ ] HA addon `1.5.0` rebuilt and committed
- [ ] CLAUDE.md updated
