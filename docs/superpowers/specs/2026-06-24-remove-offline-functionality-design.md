# Design: Remove offline / local-first architecture (server-first rewrite)

- **Date:** 2026-06-24
- **Status:** Approved (ready for implementation plan)
- **Scope:** Frontend only (`src/**`) — no PocketBase hooks or migrations change

## Context & motivation

calenDHD was built local-first: every store writes to IndexedDB (Dexie) immediately,
updates the UI optimistically, then syncs to PocketBase in the background. IndexedDB is
**not** a cache layer — it is the primary store the UI reads and writes from, with a
`sync_status` (`synced | pending | conflict | deleted`) state machine and `local_id`
temp-ID plumbing on every record type.

In practice this app runs against a PocketBase server that is online 24/7 (Home Assistant
add-on, Docker, or reverse-proxied LAN). The offline machinery adds significant complexity
(a sync state machine, optimistic reconciliation in all 5 stores, pending-delete retry
loops, a dual local+remote write path for external-event reminders) for resilience that the
deployment model never exercises. This design removes it.

## Goal

Make **PocketBase the single source of truth**. Stores call the `$api/pocketbase` client
directly and `await` each write before updating in-memory UI state. Delete IndexedDB/Dexie,
`sync_status`, `local_id`, and the offline-resilience layer entirely.

The `brain_dump` feature already works exactly this way (direct PocketBase CRUD, no Dexie) —
it is the reference pattern for the rewritten stores.

## Non-goals (explicitly kept intact)

- **Push notifications** — the service worker stays; only its caching logic is removed.
- **Realtime subscriptions** — kept; they now do the reconciliation the optimistic path
  used to (see store pattern below).
- **PWA manifest / installability** — `static/manifest.json` is untouched.
- **External iCal subscription syncing** — `subscription.syncing` / `syncSuccess` UI is
  feed-refresh sync, unrelated to offline; kept.
- **PocketBase hooks & migrations** — no backend change.

## Decisions

1. **Removal scope:** everything, including the local-first IndexedDB architecture (not just
   the offline banner or service-worker caching).
2. **Write model:** strict server-first. Every create/edit/delete `await`s the PocketBase
   response, then updates UI state from the returned record. **No optimistic in-memory
   state**, no reconciliation, no temp IDs.
3. **Accepted tradeoff:** the checkbox/toggle latency below is accepted. We will **not** add
   an optimistic-checkbox exception.

## Architecture: server-first stores

### Store CRUD pattern — before vs after

Today each store does a local-first dance. Example, `categoriesStore.create`:

```ts
// BEFORE (≈30 lines): createLocalCategory → push temp record with local_id →
//   optimistic insert → try createCategory() → reconcile temp vs server vs realtime dupe
```

```ts
// AFTER:
async create(data) {
  const cat = await createCategory({ ...data, sort_order });  // await server
  // realtime 'create' also fires; existing dedup guard prevents a double-add
  return cat;
}
```

`load` collapses to `categories = await getCategories()`.

The same shape applies to all 5 stores: `calendar`, `categories`, `templates`, `routines`,
`settings`.

### What stays

- **Realtime dedup guards** (e.g. `if (!events.some(e => e.id === record.id))`) — these now
  carry the reconciliation load. Realtime `create`/`update`/`delete` handlers are kept as-is
  (minus the `hardDeleteLocalEvent` calls).
- **`loadGeneration` stale-token** in `calendar.loadEvents()` — still needed to discard
  overlapping server fetches during rapid prev/next navigation.

## Change inventory

### Files to DELETE

| File | Reason |
|------|--------|
| `src/lib/db/index.ts` | Dexie schema + all local helpers |
| `src/lib/db/routines.ts` | Routine-specific Dexie helpers |
| `src/lib/db/index.test.ts` | Tests for the deleted Dexie layer |
| `src/lib/db/routines.test.ts` | Tests for the deleted Dexie layer |
| `src/lib/components/ui/OfflineIndicator.svelte` | Offline banner |

### Files to EDIT

**`src/lib/stores/calendar.svelte.ts`** — the largest change:
- Remove the local-first read block (load from `getLocalEvents`/`getLocalExternalEvents`).
- Remove the pending-delete retry loop (`getPendingDeleteEvents` → re-attempt delete →
  `hardDeleteLocalEvent`).
- Remove the IndexedDB external-event caching (`db.external_events...delete()` +
  `setExternalEvents`).
- Rewrite `createEvent`/`updateEvent`/`deleteEvent` to strict server-first (await the
  server call, then update `events`); drop `createLocalEvent`, `markEventSynced`,
  `updateLocalEvent`, `deleteLocalEvent`, `hardDeleteLocalEvent`.
- Realtime `delete` handler: drop the `hardDeleteLocalEvent` lookup; just filter state.
- `createEvent`'s `data` param type changes from `Omit<LocalEvent, ...>` to the server-event
  shape (`Omit<CalendarEvent, 'id' | 'created' | 'updated' | 'user'>`).
- **Keep** `loadGeneration`, `getViewRange`, `displayEvents`, `toggleTaskComplete` cascade
  logic, and the realtime subscription wiring.

**`src/lib/stores/categories.svelte.ts`**, **`templates.svelte.ts`**, **`routines.svelte.ts`**,
**`settings.svelte.ts`** — drop the "load local first" block and the
`db.<table>.where('id')...` lookups in `update`/`delete`; make each method server-first.
`settings`: `load` → `getUserSettings()`; `update` → `await updateUserSettings()`; remove
`getLocalSettings`/`setLocalSettings`.

**`src/routes/+layout.svelte`** — remove the `OfflineIndicator` import (line 6) and the
`<OfflineIndicator />` render (line 124).

**`src/lib/components/ui/index.ts`** — remove the `OfflineIndicator` re-export.

**`src/lib/components/calendar/ExternalEventReminderRow.svelte`** — currently hydrates from
the local cache (`getExternalEventReminder`) and **dual-writes** to both local and remote.
Switch to PocketBase-only:
- Hydrate via a remote read: reuse the existing `getExternalEventReminders(subscriptionId)`
  and filter its result by `uid`. (Per-row refetch is acceptable — single-household volume is
  tiny; no new API surface needed.)
- In `persist()`, drop the three local calls (`deleteExternalEventReminder`,
  `upsertExternalEventReminder` x2); keep only the `*Remote` calls.

**`src/lib/types/index.ts`**:
- Delete `LocalEvent`, `LocalCategory`, `LocalTemplate`, `LocalRoutineTemplate`.
- Remove `local_id?` and `last_synced?` from `CalendarEvent`.
- Keep the server `ExternalEventReminder` type.

**`src/service-worker.ts`**:
- **Keep** the `push` and `notificationclick` handlers — this is why the SW exists.
- Remove the `install`/`activate`/`fetch` caching logic, the `cacheFirst`/`networkFirst`
  helpers, the `$service-worker` import (`build, files, version`), and the `CACHE_NAME`/
  `ASSETS` constants.
- Remove the dead `sync` (background-sync, `calendhd-sync`) handler — nothing in the app ever
  registers it.
- Keep the `SKIP_WAITING` message handler (harmless; lets SW updates activate promptly).

**`src/lib/i18n/locales/en.json` + `sv.json`** — remove the `status.*` block
(`online`, `offline`, `offlineMessage`, `dismiss`). Both files MUST stay key-balanced —
verify with the Python structural-diff snippet in CLAUDE.md. Keep `subscription.syncing` /
`subscription.syncSuccess`.

**`src/tests/setup.ts`** — remove the `fake-indexeddb` polyfill import/setup.

**`package.json`** — drop `dexie` and `fake-indexeddb` dependencies.

### Verify (not assumed)

- `src/lib/i18n/index.ts` appeared in the `$db`/local grep — almost certainly a false
  positive on `getLocale`/`setLocale`. Confirm it does **not** import `$db` before assuming
  no change is needed.

## Tests

- Delete `src/lib/db/index.test.ts` and `src/lib/db/routines.test.ts` with the db layer.
- Remaining util tests (`date.test.ts`, `recurrence.test.ts`, `index.test.ts`) are
  unaffected.
- Optional (not required for this change): light store tests that mock `$api/pocketbase` to
  assert server-first behavior. Out of scope unless we want the coverage.
- `npm run check` (svelte-check) must pass — the type changes (removed `Local*` types,
  changed `createEvent` param type) will surface any missed call sites.

## Build / release

This is a `src/**` change, so per CLAUDE.md the work is not complete until:

1. `./build-for-ha.sh` rebuilds the frontend into
   `ha-addon/calendhd/rootfs/opt/calendhd/public/` (otherwise HA ships an identical artifact).
2. `version:` in `ha-addon/calendhd/config.yaml` is bumped.

## Known tradeoffs / risks (accepted)

- **Checkbox / toggle latency.** `toggleTaskComplete` and the routine-step cascade (several
  sequential `updateEvent`s) now each wait on a network round-trip before the UI updates.
  Most user-visible regression. **Accepted** — no optimistic exception.
- **Brief settings flash on cold load.** Theme/locale/timezone now arrive via one network
  fetch instead of instant IndexedDB. Sub-second.
- **No data when the network is down.** By design.
- **Orphaned IndexedDB on existing devices.** Old `CalendHD` Dexie databases on users'
  browsers become unused dead weight. Harmless; not worth a cleanup migration. (Could add a
  one-line `indexedDB.deleteDatabase('CalendHD')` on startup if we want tidiness — optional.)

## Verification checklist

- [ ] `npm run check` passes (no references to deleted types/helpers).
- [ ] `npm run test` passes (db tests removed, others green).
- [ ] i18n en/sv key-balanced (Python diff prints two empty lists).
- [ ] App loads, CRUD works for events/categories/templates/routines/settings against a
      running PocketBase.
- [ ] Push notification (test endpoint) still fires.
- [ ] Realtime: a change in one tab/device appears in another.
- [ ] External-event reminder modal hydrates and saves (PocketBase-only path).
- [ ] `./build-for-ha.sh` run + `config.yaml` version bumped.
