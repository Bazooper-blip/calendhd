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
