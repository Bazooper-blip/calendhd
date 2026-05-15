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
