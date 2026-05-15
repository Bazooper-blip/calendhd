# Multi-Device Push Subscriptions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every device that has enabled push notifications receive reminders, instead of only the most-recently-subscribed device. Singleton-user model is preserved — devices are rows under the singleton user, not separate users.

**Architecture:** Today, `user_settings.push_subscription` is a single JSON blob — each device's subscribe call overwrites the previous one (`src/lib/utils/notifications.ts:76-84`, `pocketbase/pb_hooks/020_reminder_cron.pb.js:102`). We replace it with a new `push_subscriptions` collection, one row per device keyed by the unique Web Push `endpoint`. The reminder cron (and the test-notification hook) iterate every row for the user and dispatch to each. Dead subscriptions (push-service returns 404/410) are pruned lazily on send. The migration backfills any existing `user_settings.push_subscription` value into a row in the new collection, then drops the field cleanly (no compat shim — CLAUDE.md: "No backwards-compat layer for the singleton user").

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, PocketBase 0.37 JSVM hooks, web-push (Node) push-service, Vitest, Dexie (no schema change needed — push subscriptions live server-side only, per-device data not user-edited content).

---

## File Structure

**New files:**
- `pocketbase/pb_migrations/0007_push_subscriptions.js` — new collection + backfill + drop legacy field

**Modified files:**
- `pocketbase/pb_hooks/pb_helpers.js` — new `sendPushToAllDevices(userId, title, body, tag)` helper that loops, sends, prunes
- `pocketbase/pb_hooks/020_reminder_cron.pb.js` — internal + external loops both call the new helper
- `pocketbase/pb_hooks/040_notification_test.pb.js` — uses the new helper, returns per-device summary
- `push-service/index.js` — `/send` returns upstream `statusCode` in the body and uses it as the HTTP status, so the cron can detect 404/410 and prune
- `src/lib/utils/notifications.ts` — `savePushSubscription` upserts a row in `push_subscriptions` (find-by-endpoint, update or create); `removePushSubscription` deletes the row by current endpoint *before* the browser unsubscribes
- `src/lib/api/pocketbase.ts` — register `push_subscriptions` in the `collections` map; export `getDevicePushSubscriptions/upsertDevicePushSubscription/deleteDevicePushSubscriptionByEndpoint`
- `src/lib/types/index.ts` — new `DevicePushSubscription` type; remove `push_subscription` from `UserSettings`
- `src/routes/settings/+page.svelte` — minor: no behavioral change required, but the toggle's status text becomes accurate ("Push notifications enabled on this device") since it already calls `hasPushSubscription()` against the browser's `pushManager`, which is per-device by design
- `ha-addon/calendhd/config.yaml` — bump `version:` to `1.5.8`
- `CLAUDE.md` — add the new collection + helper to the architecture section; note the single-blob → multi-row migration

**Sync after backend changes:** `./build-for-ha.sh` to mirror `pb_hooks/`, `pb_migrations/`, `push-service/`, and the rebuilt frontend bundle into `ha-addon/calendhd/`. Required even if HA detects the version bump (CLAUDE.md "Critical" section).

---

## Why a unique index on `endpoint` is the natural key

Each browser+VAPID-key combo produces one stable Web Push endpoint URL. The same browser calling `pushManager.subscribe()` twice returns the same endpoint (or `getSubscription()` returns the existing one). Different browsers/devices produce different endpoints. So `endpoint` uniquely identifies "device that wants pushes". A unique index lets us upsert atomically and guarantees we never duplicate.

We don't store a user-friendly device label in v1 — it's not needed to fix the bug, and the only client-visible behavior is the existing per-device toggle in settings (which already reads from the browser's local `pushManager`, not the server). YAGNI.

---

## Task 1: Add the `DevicePushSubscription` type and remove the legacy field

**Files:**
- Modify: `src/lib/types/index.ts:157-175`

- [ ] **Step 1: Add the new type after `ExternalEventReminder`**

Insert this above the `UserSettings` interface (around line 156):

```typescript
// One row per browser/device that has opted in to push notifications.
// Replaces the single `user_settings.push_subscription` JSON blob — that
// blob was overwritten on every device's first subscribe, so only the
// last device ever received reminders. Keyed by the unique Web Push
// `endpoint` (stable per browser+VAPID combo).
export interface DevicePushSubscription extends BaseRecord {
	user: string;
	endpoint: string;
	p256dh: string;
	auth: string;
	last_seen?: string;
}
```

- [ ] **Step 2: Remove `push_subscription` from `UserSettings`**

In the `UserSettings` interface (around line 170), delete this line:

```typescript
	push_subscription?: PushSubscriptionData; // Web Push subscription for notifications
```

If `PushSubscriptionData` is now unused elsewhere (grep first), remove its definition too. Run:

```bash
grep -rn "PushSubscriptionData" /home/sammy/Public/repo/calendhd/src/
```

Expected: zero results outside of `index.ts` itself. If so, delete the type. If not (the settings page or notifications.ts still references it), update those call sites in their respective tasks below.

- [ ] **Step 3: Run type check to surface every site that touched the old field**

Run: `npm run check`
Expected: failures in `src/lib/utils/notifications.ts` (`savePushSubscription` writes `push_subscription`) and possibly `getDefaultSettings()` if it includes the field. We will fix these in subsequent tasks.

- [ ] **Step 4: Commit**

```bash
git add src/lib/types/index.ts
git commit -m "types: add DevicePushSubscription, drop legacy push_subscription from UserSettings"
```

---

## Task 2: PocketBase migration — new collection + backfill + drop legacy field

**Files:**
- Create: `pocketbase/pb_migrations/0007_push_subscriptions.js`

- [ ] **Step 1: Write the migration**

```javascript
/// <reference path="../pb_data/types.d.ts" />

// =============================================================================
// 0007 — push_subscriptions: one row per device
//
// Replaces user_settings.push_subscription (single JSON blob — got overwritten
// on every device's first subscribe). New collection is keyed by the unique
// Web Push endpoint URL so each browser/device has its own row, and the
// reminder cron can fan out to every active subscription.
//
// Backfill: any existing user_settings.push_subscription is copied into a row
// in the new collection (best-effort; failures are logged, not fatal).
// Then the legacy field is removed — no compat shim (CLAUDE.md: "No
// backwards-compat layer for the singleton user").
// =============================================================================

migrate((app) => {
  const usersCollectionId = app.findCollectionByNameOrId("users").id;

  // ── new collection ────────────────────────────────────────────────────
  const pushSubs = new Collection({
    type: "base",
    name: "push_subscriptions",
    listRule: "@request.auth.id = user",
    viewRule: "@request.auth.id = user",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id = user",
    deleteRule: "@request.auth.id = user",
    fields: [
      { type: "relation", name: "user", required: true,
        collectionId: usersCollectionId, maxSelect: 1, cascadeDelete: true },
      { type: "text", name: "endpoint", required: true, max: 2000 },
      { type: "text", name: "p256dh", required: true, max: 500 },
      { type: "text", name: "auth", required: true, max: 500 },
      { type: "date", name: "last_seen", required: false }
    ],
    indexes: [
      "CREATE INDEX idx_push_sub_user ON push_subscriptions (user)",
      "CREATE UNIQUE INDEX idx_push_sub_endpoint ON push_subscriptions (endpoint)"
    ]
  });
  app.save(pushSubs);

  // ── backfill from user_settings.push_subscription ─────────────────────
  // Best-effort: log and continue on failure so the migration doesn't block
  // the addon from starting if a single row is malformed.
  try {
    const settings = app.findAllRecords("user_settings");
    for (let i = 0; i < settings.length; i++) {
      const row = settings[i];
      const userId = row.get("user");
      const raw = row.get("push_subscription");
      if (!raw || !userId) continue;

      // PB JSVM may return the json field as a byte array, an object, or a
      // string depending on the storage path. Handle all three inline (we
      // can't require() pb_helpers from migrations — different runtime).
      let parsed = null;
      try {
        if (typeof raw === "string") {
          parsed = JSON.parse(raw);
        } else if (Array.isArray(raw) || (typeof raw === "object" && typeof raw.length === "number")) {
          let s = "";
          for (let j = 0; j < raw.length; j++) s += String.fromCharCode(raw[j]);
          parsed = JSON.parse(s);
        } else if (typeof raw === "object") {
          parsed = raw;
        }
      } catch (e) {
        console.log("[mig 0007] backfill: parse failed for user " + userId + ": " + e);
        continue;
      }

      if (!parsed || !parsed.endpoint || !parsed.keys || !parsed.keys.p256dh || !parsed.keys.auth) {
        continue;
      }

      try {
        const collection = app.findCollectionByNameOrId("push_subscriptions");
        const rec = new Record(collection);
        rec.set("user", userId);
        rec.set("endpoint", parsed.endpoint);
        rec.set("p256dh", parsed.keys.p256dh);
        rec.set("auth", parsed.keys.auth);
        rec.set("last_seen", new Date().toISOString());
        app.save(rec);
        console.log("[mig 0007] backfilled push subscription for user " + userId);
      } catch (e) {
        // Likely the unique index rejected a duplicate — fine, skip.
        console.log("[mig 0007] backfill insert skipped for user " + userId + ": " + e);
      }
    }
  } catch (e) {
    console.log("[mig 0007] backfill skipped (no user_settings rows or query failed): " + e);
  }

  // ── drop legacy field ────────────────────────────────────────────────
  const userSettings = app.findCollectionByNameOrId("user_settings");
  userSettings.fields.removeByName("push_subscription");
  app.save(userSettings);
}, (app) => {
  // Down: re-add the field, then drop the new collection. We don't restore
  // backfilled blobs — the down path is best-effort schema reversal only.
  const userSettings = app.findCollectionByNameOrId("user_settings");
  userSettings.fields.add(new JSONField({
    name: "push_subscription",
    required: false
  }));
  app.save(userSettings);

  try {
    const pushSubs = app.findCollectionByNameOrId("push_subscriptions");
    app.delete(pushSubs);
  } catch (e) { /* not present */ }
});
```

- [ ] **Step 2: Smoke-test the migration locally**

Run PocketBase against the existing dev data and confirm the migration succeeds. From the project root:

```bash
cd pocketbase && ./pocketbase migrate up
```

Expected: console output ending with something like `Applied 0007_push_subscriptions.js`. If you have an existing `push_subscription` blob in your dev `user_settings`, expect a `[mig 0007] backfilled push subscription for user <id>` log line.

Then verify the new collection exists and has the backfill row (if applicable). One quick check via the PB admin UI at `http://127.0.0.1:8090/_/`, or via curl:

```bash
curl -s 'http://127.0.0.1:8090/api/collections/push_subscriptions/records' \
  -H "Authorization: Bearer $(curl -s -X POST http://127.0.0.1:8090/api/collections/users/auth-with-password \
    -H 'Content-Type: application/json' \
    -d '{"identity":"home@calendhd.local","password":"<your-singleton-pw>"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')"
```

Expected: `{"page":1,"perPage":30,"totalItems":<0 or 1>,"totalPages":...,"items":[...]}`. The endpoint/keys field values should match what was previously in `user_settings.push_subscription` (if anything).

If the migration fails, fix and retry — do not commit a broken migration.

- [ ] **Step 3: Commit**

```bash
git add pocketbase/pb_migrations/0007_push_subscriptions.js
git commit -m "pb: 0007 push_subscriptions collection (one row per device) with backfill"
```

---

## Task 3: Add `sendPushToAllDevices` helper in `pb_helpers.js`

**Files:**
- Modify: `pocketbase/pb_hooks/pb_helpers.js` — append a new exported function inside `module.exports`

**Why a helper here:** every other hook that needs to send a push (the cron, the test endpoint) is a thin shell that delegates to `pb_helpers.js` — same pattern as `scheduleExternalReminder`. Module-level functions are NOT visible inside PB JSVM callbacks (callback-scope-isolation gotcha), but `require()`'d helpers work because each callback re-`require()`s on call.

- [ ] **Step 1: Add the helper inside `module.exports`**

Insert this after `rescheduleExternalRemindersForOverride` (and inside the closing `}` of `module.exports`):

```javascript
    // ─────────────────────────────────────────────────────────────────
    // Multi-device push delivery
    //
    // Looks up every push_subscriptions row for the user and POSTs to the
    // push-service for each. Returns { sent: <count>, failed: <count> }.
    //
    // Dead subscriptions (push-service responds 404 or 410) are deleted —
    // those status codes mean the browser/server has discarded the
    // subscription and no future push will ever succeed for that endpoint.
    // Other failures (5xx, network) are logged and left alone so the row
    // stays available for the next cron tick.
    // ─────────────────────────────────────────────────────────────────
    sendPushToAllDevices: function(userId, title, body, tag) {
        var PUSH_SERVICE_URL = $os.getenv("PUSH_SERVICE_URL") || "http://localhost:3001";

        var subs;
        try {
            subs = $app.findRecordsByFilter(
                "push_subscriptions",
                "user = {:uid}",
                "", 100, 0,
                { uid: userId }
            );
        } catch (err) {
            console.log("[push-fanout] failed to load push_subscriptions: " + err);
            return { sent: 0, failed: 0 };
        }

        if (!subs || subs.length === 0) {
            return { sent: 0, failed: 0 };
        }

        var sent = 0;
        var failed = 0;

        for (var i = 0; i < subs.length; i++) {
            var row = subs[i];
            var endpoint = row.get("endpoint");
            var p256dh = row.get("p256dh");
            var auth = row.get("auth");

            if (!endpoint || !p256dh || !auth) {
                console.log("[push-fanout] skipping malformed row " + row.id);
                failed++;
                continue;
            }

            try {
                var res = $http.send({
                    url: PUSH_SERVICE_URL + "/send",
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        subscription: {
                            endpoint: endpoint,
                            keys: { p256dh: p256dh, auth: auth }
                        },
                        payload: {
                            title: title,
                            body: body,
                            tag: "calendhd-reminder-" + tag,
                            data: { tag: tag }
                        }
                    }),
                    timeout: 10
                });

                if (res.statusCode >= 200 && res.statusCode < 300) {
                    sent++;
                } else if (res.statusCode === 404 || res.statusCode === 410) {
                    // Subscription is dead — prune so the next cron tick is faster.
                    try {
                        $app.delete(row);
                        console.log("[push-fanout] pruned dead subscription " + row.id + " (status " + res.statusCode + ")");
                    } catch (delErr) {
                        console.log("[push-fanout] failed to prune dead subscription " + row.id + ": " + delErr);
                    }
                    failed++;
                } else {
                    console.log("[push-fanout] push failed for " + row.id + " with status " + res.statusCode);
                    failed++;
                }
            } catch (err) {
                console.log("[push-fanout] http error for " + row.id + ": " + err);
                failed++;
            }
        }

        return { sent: sent, failed: failed };
    }
```

Note the comma-handling: this is a property of the `module.exports` object literal, so the previous property must end with a comma. Verify the function above (`rescheduleExternalRemindersForOverride`) ends with `}` and add a `,` before pasting the new property.

- [ ] **Step 2: Quick syntax sanity-check via PocketBase startup**

Run: `cd pocketbase && ./pocketbase serve` (Ctrl-C after 2s).
Expected: PB starts without errors. If it logs `failed to load JS hooks: ...`, fix the syntax (likely a missing comma).

- [ ] **Step 3: Commit**

```bash
git add pocketbase/pb_hooks/pb_helpers.js
git commit -m "pb: helper sendPushToAllDevices fans out to every device row, prunes 404/410"
```

---

## Task 4: Update the reminder cron to use the new helper

**Files:**
- Modify: `pocketbase/pb_hooks/020_reminder_cron.pb.js`

The cron currently has a `sendWebPushNotification(userSettings, title, message, eventId)` inner function that reads the single `user_settings.push_subscription` blob. Replace it with calls to the new helper for both the internal-reminder loop and the external-reminder loop.

- [ ] **Step 1: Replace `sendWebPushNotification` body and call sites**

Find this block (approx. lines 95-141 in `020_reminder_cron.pb.js`):

```javascript
    function sendWebPushNotification(userSettings, title, message, eventId) {
        if (!userSettings) {
            return { success: false, error: "no_user_settings" };
        }

        // PB JSVM returns json fields as byte arrays — use the shared decoder.
        var helpers = require(`${__hooks}/pb_helpers.js`);
        var pushSubscription = helpers.parseJsonField(userSettings.get("push_subscription"));

        if (!pushSubscription) {
            return { success: false, error: "no_push_subscription" };
        }
        if (!pushSubscription.endpoint || !pushSubscription.keys) {
            return { success: false, error: "invalid_subscription" };
        }

        // Send push notification via push service
        try {
            var res = $http.send({
                url: PUSH_SERVICE_URL + "/send",
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    subscription: pushSubscription,
                    payload: {
                        title: title,
                        body: message,
                        tag: "calendhd-reminder-" + eventId,
                        data: {
                            eventId: eventId
                        }
                    }
                }),
                timeout: 10
            });

            if (res.statusCode >= 200 && res.statusCode < 300) {
                return { success: true, error: "" };
            } else {
                return { success: false, error: "push_api_" + res.statusCode };
            }
        } catch (err) {
            return { success: false, error: "push_request_failed: " + err };
        }
    }
```

Replace it with:

```javascript
    // Fan out to every device subscribed under this user. Returns success
    // if at least one device received the push; otherwise reports the
    // count so the failure log line shows "0 sent / N failed".
    function sendWebPushNotification(userId, title, message, tag) {
        if (!userId) {
            return { success: false, error: "no_user" };
        }
        var helpers = require(`${__hooks}/pb_helpers.js`);
        var result = helpers.sendPushToAllDevices(userId, title, message, tag);
        if (result.sent > 0) {
            return { success: true, error: "", sent: result.sent, failed: result.failed };
        }
        if (result.sent === 0 && result.failed === 0) {
            return { success: false, error: "no_devices" };
        }
        return { success: false, error: "push_fanout_failed_" + result.failed };
    }
```

Update the call site in `processReminder` (around line 77):

```javascript
        // Try to send Web Push notification
        var pushResult = sendWebPushNotification(userSettings, eventTitle, message, eventId);
```

becomes:

```javascript
        // Fan out to every device row for this user. We no longer need
        // userSettings here — kept the lookup above so log messages can
        // still mention the user, and to preserve future per-user toggles.
        var pushResult = sendWebPushNotification(userId, eventTitle, message, eventId);
```

And update the call site in `processExternalReminder` (around line 239):

```javascript
        // sendWebPushNotification's existing signature is
        // (userSettings, title, message, eventId). Pass the tag in eventId's
        // slot — the existing implementation only uses it to build the tag.
        var pushResult = sendWebPushNotification(userSettings, eventTitle, message, notificationTag);
```

becomes:

```javascript
        var pushResult = sendWebPushNotification(userId, eventTitle, message, notificationTag);
```

The `userSettings` lookups above each call site can stay — they're harmless and may be needed for future per-user-on/off toggles. Don't delete them.

- [ ] **Step 2: Restart PocketBase, confirm no startup errors**

Run: `cd pocketbase && ./pocketbase serve` (Ctrl-C after 2s).
Expected: starts cleanly.

- [ ] **Step 3: Commit**

```bash
git add pocketbase/pb_hooks/020_reminder_cron.pb.js
git commit -m "pb: reminder cron fans out to every device via sendPushToAllDevices"
```

---

## Task 5: Update the test-notification hook to fan out

**Files:**
- Modify: `pocketbase/pb_hooks/040_notification_test.pb.js`

The "Send test notification" button in settings hits `POST /api/calendhd/test-notification`. Currently it reads the single blob and sends to one endpoint. Switch it to the helper so the user can verify all devices light up.

- [ ] **Step 1: Replace the lookup-and-send block**

Open `pocketbase/pb_hooks/040_notification_test.pb.js`. Replace the entire block from `// PB JSVM returns json fields as byte arrays — use the shared decoder.` through the end of the `try { ... }` block that calls `$http.send` (approximately lines 52-98) with:

```javascript
    var helpers = require(`${__hooks}/pb_helpers.js`);
    var result = helpers.sendPushToAllDevices(
        userId,
        "calenDHD Test",
        "Push notifications are working!",
        "test"
    );

    if (result.sent === 0 && result.failed === 0) {
        return e.json(400, { error: "No devices subscribed. Please enable push notifications first." });
    }

    if (result.sent > 0 && result.failed === 0) {
        return e.json(200, { success: true, sent: result.sent });
    }

    if (result.sent > 0) {
        // Mixed: some succeeded, some failed (probably stale subs we just pruned).
        return e.json(200, { success: true, sent: result.sent, failed: result.failed });
    }

    return e.json(200, { success: false, error: "All " + result.failed + " device(s) failed", failed: result.failed });
```

Also delete the now-unused `userSettings` lookup at the top of the route handler (the `try { var settingsRecords = ... }` block immediately above), and delete the `if (!userSettings)` guard. Keep the `if (!authRecord)` guard.

The final shape of the route should be: read `userId`, call helper, return one of four responses based on the counts.

- [ ] **Step 2: Restart PocketBase, sanity-check**

Run: `cd pocketbase && ./pocketbase serve` (Ctrl-C after 2s).
Expected: starts cleanly.

- [ ] **Step 3: Commit**

```bash
git add pocketbase/pb_hooks/040_notification_test.pb.js
git commit -m "pb: test-notification hook fans out to every device via shared helper"
```

---

## Task 6: Push-service forwards the upstream status code on failure

**Files:**
- Modify: `push-service/index.js:42-56` (sendPushNotification) and `:80-95` (`/send` route handler)

Today the push-service catches every web-push error as a generic 500. The cron can't tell 410 (subscription gone — prune) from 5xx (transient — retry next tick). Surface the upstream `statusCode`.

- [ ] **Step 1: Make `sendPushNotification` return/expose statusCode**

Find this function (around line 42):

```javascript
async function sendPushNotification(subscription, payload) {
    if (VAPID_PUBLIC_KEY === 'YOUR_VAPID_PUBLIC_KEY_HERE') {
        throw new Error('VAPID keys not configured');
    }

    const pushSubscription = {
        endpoint: subscription.endpoint,
        keys: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth
        }
    };

    await webpush.sendNotification(pushSubscription, JSON.stringify(payload));
}
```

No change needed in the function itself — `webpush.sendNotification` already throws an error with `.statusCode` set when the push provider rejects (404/410/etc).

- [ ] **Step 2: Update the `/send` route handler to forward statusCode**

Find this block (around line 89):

```javascript
        // POST /send - Send a push notification
        if (req.method === 'POST' && req.url === '/send') {
            const body = await parseBody(req);

            if (!body.subscription || !body.payload) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing subscription or payload' }));
                return;
            }

            await sendPushNotification(body.subscription, body.payload);

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true }));
            return;
        }
```

Replace the `await sendPushNotification(...)` line + the success response with a try/catch that forwards the upstream status:

```javascript
        // POST /send - Send a push notification.
        // Forwards web-push's upstream statusCode so the caller (PB cron) can
        // distinguish prune-worthy failures (404/410 — subscription is dead)
        // from transient ones (5xx — try again next tick).
        if (req.method === 'POST' && req.url === '/send') {
            const body = await parseBody(req);

            if (!body.subscription || !body.payload) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Missing subscription or payload' }));
                return;
            }

            try {
                await sendPushNotification(body.subscription, body.payload);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
            } catch (err) {
                const upstream = typeof err.statusCode === 'number' ? err.statusCode : 500;
                res.writeHead(upstream, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    error: err.message || 'Push send failed',
                    statusCode: upstream
                }));
            }
            return;
        }
```

The outer `try { ... } catch (error) { ... }` at the bottom of the request handler still catches anything that escapes (e.g. body-parse failures). We want the inner try/catch here so a successful upstream-410 doesn't get swallowed as a generic 500.

- [ ] **Step 3: Sanity-check the push-service still parses**

Run: `cd push-service && node -c index.js`
Expected: no output (success).

- [ ] **Step 4: Commit**

```bash
git add push-service/index.js
git commit -m "push-service: forward web-push upstream statusCode on /send failures"
```

---

## Task 7: Update the API client — register `push_subscriptions`, add CRUD helpers

**Files:**
- Modify: `src/lib/api/pocketbase.ts`

- [ ] **Step 1: Register the collection helper**

In the `collections` object (around line 33-45), add `push_subscriptions` between `user_settings` and `scheduled_reminders`:

```typescript
	push_subscriptions: () => getPocketBase().collection('push_subscriptions'),
```

Also import the new type at the top (line 2-13):

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
	BrainDump,
	DevicePushSubscription
} from '$types';
```

- [ ] **Step 2: Add the three CRUD helpers**

Add these functions immediately after `getDefaultSettings()` (around line 369) and before `getVapidPublicKey()`:

```typescript
// ─────────────────────────────────────────────────────────────────
// Device push subscriptions (one row per browser/device).
// Replaces the single user_settings.push_subscription blob — see
// pb_migrations/0007_push_subscriptions.js for context.
// ─────────────────────────────────────────────────────────────────

export async function getDevicePushSubscriptions(): Promise<DevicePushSubscription[]> {
	const user = getCurrentUser();
	if (!user) return [];
	const records = await collections.push_subscriptions().getFullList({
		filter: `user = "${user.id}"`,
		batch: 200
	});
	return records as unknown as DevicePushSubscription[];
}

// Upsert by endpoint: find any row with the same endpoint and update it,
// otherwise create a new one. The unique index on `endpoint` guarantees
// at most one row exists for any given browser+VAPID combo.
export async function upsertDevicePushSubscription(
	endpoint: string,
	p256dh: string,
	auth: string
): Promise<DevicePushSubscription> {
	const user = getCurrentUser();
	if (!user) throw new Error('Not authenticated');

	const lastSeen = new Date().toISOString();

	// Try to find an existing row for this endpoint. We escape quotes
	// defensively even though endpoints don't typically contain them.
	const escaped = endpoint.replace(/"/g, '\\"');
	const existing = await collections.push_subscriptions().getFullList({
		filter: `endpoint = "${escaped}"`,
		batch: 1
	});

	if (existing.length > 0) {
		const row = existing[0] as unknown as DevicePushSubscription;
		const updated = await collections.push_subscriptions().update(row.id, {
			user: user.id,
			p256dh,
			auth,
			last_seen: lastSeen
		});
		return updated as unknown as DevicePushSubscription;
	}

	const created = await collections.push_subscriptions().create({
		user: user.id,
		endpoint,
		p256dh,
		auth,
		last_seen: lastSeen
	});
	return created as unknown as DevicePushSubscription;
}

export async function deleteDevicePushSubscriptionByEndpoint(endpoint: string): Promise<void> {
	const escaped = endpoint.replace(/"/g, '\\"');
	const matches = await collections.push_subscriptions().getFullList({
		filter: `endpoint = "${escaped}"`,
		batch: 1
	});
	if (matches.length === 0) return;
	await collections.push_subscriptions().delete(matches[0].id);
}
```

- [ ] **Step 3: Run type check**

Run: `npm run check`
Expected: errors in `src/lib/utils/notifications.ts` (still references the old field) and possibly `getDefaultSettings()` if it includes `push_subscription` in its return shape. We'll fix `notifications.ts` next; if `getDefaultSettings` references `push_subscription`, remove it now.

```bash
grep -n "push_subscription" /home/sammy/Public/repo/calendhd/src/lib/api/pocketbase.ts
```

If any results inside `getDefaultSettings` or elsewhere in `pocketbase.ts`, delete those lines. Re-run `npm run check`. Should narrow down to errors in `notifications.ts` only.

- [ ] **Step 4: Commit**

```bash
git add src/lib/api/pocketbase.ts
git commit -m "api: push_subscriptions collection + upsert/delete-by-endpoint helpers"
```

---

## Task 8: Update `notifications.ts` to upsert against `push_subscriptions`

**Files:**
- Modify: `src/lib/utils/notifications.ts:69-98`

`savePushSubscription` and `removePushSubscription` currently mutate `user_settings.push_subscription`. Switch them to the new collection. Also rework `removePushSubscription` to capture the endpoint *before* the browser unsubscribes, so we can delete the right row.

- [ ] **Step 1: Replace the imports and the two functions**

Update the import block at the top (lines 1-2):

```typescript
import { browser } from '$app/environment';
import {
	getCurrentUser,
	upsertDevicePushSubscription,
	deleteDevicePushSubscriptionByEndpoint
} from '$api/pocketbase';
```

Replace `savePushSubscription` (lines 69-85) with:

```typescript
// Save (upsert) this device's push subscription on the server. Each device
// gets its own row in push_subscriptions keyed by the unique Web Push
// `endpoint`, so multi-device works — see pb_migrations/0007.
export async function savePushSubscription(subscription: PushSubscription): Promise<void> {
	const user = getCurrentUser();
	if (!user) throw new Error('Not authenticated');

	const json = subscription.toJSON();
	if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
		throw new Error('Push subscription is missing endpoint or keys');
	}

	await upsertDevicePushSubscription(json.endpoint, json.keys.p256dh, json.keys.auth);
}
```

Replace `removePushSubscription` (lines 87-98) with:

```typescript
// Remove this device's push subscription row from the server. We capture
// the endpoint here (before the caller unsubscribes the browser) so we know
// which row to delete — once the browser unsubscribes, the registration's
// endpoint is gone.
export async function removePushSubscription(): Promise<void> {
	const user = getCurrentUser();
	if (!user) throw new Error('Not authenticated');

	if (!isNotificationSupported()) return;

	const registration = await navigator.serviceWorker.ready;
	const subscription = await registration.pushManager.getSubscription();
	if (!subscription) return;

	const endpoint = subscription.toJSON().endpoint;
	if (!endpoint) return;

	await deleteDevicePushSubscriptionByEndpoint(endpoint);
}
```

Note that the call site in the settings page (`src/routes/settings/+page.svelte:73-85`) calls `unsubscribeFromPush()` *first*, then `removePushSubscription()`. That order needs to flip — otherwise `removePushSubscription` can't read the endpoint. Fix that next.

- [ ] **Step 2: Fix the call order in the settings page**

Open `src/routes/settings/+page.svelte`. Find `handleDisableNotifications` (lines 73-85) and swap the order:

```svelte
	async function handleDisableNotifications() {
		notificationLoading = true;
		try {
			// Delete the server row FIRST, while we can still read the endpoint
			// from the active push subscription.
			await removePushSubscription();
			await unsubscribeFromPush();
			hasSubscription = false;
			toast.success($_('settings.notificationsDisabled'));
		} catch (error) {
			toast.error(error instanceof Error ? error.message : $_('settings.notificationsDisableFailed'));
		} finally {
			notificationLoading = false;
		}
	}
```

- [ ] **Step 3: Confirm `npm run check` is clean**

Run: `npm run check`
Expected: no type errors. If anything still references `push_subscription` (the user_settings field), `getUserSettings`, or `updateUserSettings` in this notification flow, fix it.

```bash
grep -rn "push_subscription" /home/sammy/Public/repo/calendhd/src/
```

Expected: zero matches. (`push_subscriptions` — plural, the collection name — is fine and will be present in `pocketbase.ts`.)

- [ ] **Step 4: Run unit tests**

Run: `npm run test`
Expected: all green. The existing tests don't cover push subscriptions — they cover Dexie helpers and pure utils — so this should pass without modification.

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/notifications.ts src/routes/settings/+page.svelte
git commit -m "client: push subscriptions go to push_subscriptions collection (per-device)"
```

---

## Task 9: Manual end-to-end smoke test (two-device verification)

This is the only way to actually prove the fix works — there's no headless way to verify two real Web Push endpoints both fire.

- [ ] **Step 1: Build the frontend, start the stack**

Run in three terminals (or background two of them):

```bash
# Terminal 1 — push service
cd push-service && VAPID_PUBLIC_KEY=<your-key> VAPID_PRIVATE_KEY=<your-key> VAPID_EMAIL=mailto:test@example.com npm start

# Terminal 2 — pocketbase
cd pocketbase && PUSH_SERVICE_URL=http://localhost:3001 ./pocketbase serve

# Terminal 3 — frontend
npm run dev
```

If you don't have VAPID keys handy: `cd push-service && node generate-vapid.js`.

- [ ] **Step 2: Subscribe two browsers**

Open the app at `http://localhost:5173` in two different browsers (e.g., Firefox + Chromium, or two normal-windowed Chrome profiles — note: the *same* browser in two normal windows shares the same service worker registration, so they share the same endpoint and don't actually test multi-device. Use distinct browsers or a private window).

In each: Settings → Notifications → Enable. Accept the permission prompt.

- [ ] **Step 3: Verify both rows exist server-side**

```bash
TOKEN=$(curl -s -X POST http://127.0.0.1:8090/api/collections/users/auth-with-password \
    -H 'Content-Type: application/json' \
    -d '{"identity":"home@calendhd.local","password":"<your-singleton-pw>"}' | python3 -c 'import sys,json; print(json.load(sys.stdin)["token"])')

curl -s "http://127.0.0.1:8090/api/collections/push_subscriptions/records" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

Expected: `totalItems: 2`, two distinct `endpoint` values.

- [ ] **Step 4: Hit the test endpoint, confirm both browsers notify**

In one of the browsers' Settings page, click the "Send test push notification" button (whatever the existing button text is — it calls `POST /api/calendhd/test-notification`).

Expected: both browsers display the "calenDHD Test" notification within a few seconds. The response payload should be `{"success": true, "sent": 2}`.

- [ ] **Step 5: Verify reminder cron fans out to both devices**

Create a calendar event scheduled ~2 minutes in the future with a 1-minute-before reminder. Wait for the cron to fire. Both browsers should display the reminder.

Watch PB logs (Terminal 2):

```
Sent reminder for '<title>' via web_push to user <id>
```

Should appear once per event. The push-service log (Terminal 1) should show two POSTs to `/send` for that event.

- [ ] **Step 6: Verify dead-subscription pruning**

In one browser, open DevTools → Application → Service Workers → "Push messaging" subscription → unsubscribe manually (or just clear the site's storage). Then trigger another notification.

The push-service should respond `410` for the dead endpoint; PB logs should show:

```
[push-fanout] pruned dead subscription <id> (status 410)
```

Re-run the curl from Step 3. Expected: `totalItems: 1`.

- [ ] **Step 7: If anything fails, debug before continuing**

Common failure modes:
- "no_devices" reported by cron → migration didn't run, or rows are missing from push_subscriptions (check unique-index conflicts in PB logs)
- 401 from push-service → VAPID keys mismatch between push-service env and what the client used to subscribe (re-subscribe both browsers after fixing)
- Only one browser notifies → check both endpoint URLs are distinct in the curl result; if they're the same, you're using the same browser (see Step 2 note)

---

## Task 10: Sync into HA addon, bump version, update CLAUDE.md

**Files:**
- Modify: `ha-addon/calendhd/config.yaml:2` — `version: "1.5.7"` → `version: "1.5.8"`
- Modify: `CLAUDE.md` — architecture section
- Run: `./build-for-ha.sh`

The sync script copies `pb_hooks/`, `pb_migrations/`, `push-service/`, and the rebuilt frontend into `ha-addon/calendhd/`. Required even if HA detects the version bump (CLAUDE.md "Critical" section: "the rebuilt `_app/*` chunks land in `ha-addon/calendhd/rootfs/opt/calendhd/public/`").

- [ ] **Step 1: Bump addon version**

Edit `ha-addon/calendhd/config.yaml:2`:

```yaml
version: "1.5.8"
```

- [ ] **Step 2: Update CLAUDE.md architecture section**

In `CLAUDE.md`, find the table under "Dexie Database Schema" and the bullet list under "Migrations" / "Hooks". Add the new collection + migration + helper:

In the **Migrations** numbered list, append:

```markdown
6. `0007_push_subscriptions.js` — new `push_subscriptions` collection (one row per device, keyed by unique Web Push endpoint); backfills the legacy `user_settings.push_subscription` blob and drops it
```

In the **Hooks** bullet list, no new file — the change is inside `pb_helpers.js` and `020_reminder_cron.pb.js`. But add a one-line note at the bottom of the hooks section:

```markdown
- `pb_helpers.js` exports `sendPushToAllDevices(userId, title, body, tag)` — fans out a push to every row in `push_subscriptions` for the user, prunes dead subscriptions on 404/410
```

In the section labeled "**Singleton-account password rotation.**" or nearby, find the discussion of "No backwards-compat layer for the singleton user" and add (as a new paragraph or bullet just below it):

```markdown
**Multi-device push.** Each browser/device that opts in to notifications gets its own row in the `push_subscriptions` collection (keyed by the unique Web Push endpoint URL). The reminder cron fans out to every row for the singleton user, so notifications fire on every active device, not just the most recent one. Dead subscriptions are pruned lazily when the push-service returns 404 or 410. See `pb_migrations/0007_push_subscriptions.js`.
```

- [ ] **Step 3: Run the addon sync script**

Run: `./build-for-ha.sh`
Expected: builds frontend, copies hooks/migrations/push-service/build output into `ha-addon/calendhd/`. The script ends with a line about the version it built.

- [ ] **Step 4: Verify the addon directory now matches**

```bash
diff -q pocketbase/pb_hooks/pb_helpers.js ha-addon/calendhd/pb_hooks/pb_helpers.js
diff -q pocketbase/pb_migrations/0007_push_subscriptions.js ha-addon/calendhd/pb_migrations/0007_push_subscriptions.js
ls ha-addon/calendhd/pb_migrations/ | grep 0007
ls ha-addon/calendhd/rootfs/opt/calendhd/public/_app/ | head -3
```

Expected: no `diff` output (files match), `0007_push_subscriptions.js` present in addon, fresh `_app/` chunks present.

- [ ] **Step 5: Commit everything together**

```bash
git add ha-addon/ CLAUDE.md
git commit -m "release: 1.5.8 — multi-device push subscriptions"
```

This single commit is intentional — the addon's `rootfs/opt/calendhd/public/` is the source of truth for the in-image bundle (CLAUDE.md), so the version bump and the rebuilt frontend must land together. Anything else (CLAUDE.md doc updates) goes in this same release commit per the existing pattern (see recent commits: `release: 1.5.7 — fix same-day external reminders never firing`).

---

## Summary of test coverage

- **Unit (vitest):** no new tests required. The Dexie schema is unchanged, and the new code paths are (a) PB JSVM hooks (no harness), (b) thin PB SDK calls in the API client (testing those would mean mocking PB — existing code doesn't do that, no precedent), and (c) the upsert function in `notifications.ts` which is straightforward delegation to the API client.
- **Integration (manual):** Task 9 covers the end-to-end multi-device flow including pruning. This is the only meaningful verification for Web Push.
- **Type safety:** `npm run check` after Tasks 1, 7, 8 catches every site that touched the old field.
- **Migration safety:** Task 2 Step 2 smoke-tests the migration against existing dev data. The migration is additive-then-destructive within a single transaction (PB applies migrations atomically), so a backfill failure rolls back cleanly.
