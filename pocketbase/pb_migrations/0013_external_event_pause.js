/// <reference path="../pb_data/types.d.ts" />

// =============================================================================
// 0013 — External-event pause
//
// New collection external_event_pauses — one row per paused external event
// (or paused recurring series), keyed by (subscription, base iCal UID).
//
// Like external_event_reminders (0005), rows survive the wipe-and-replace of
// external_events on every sync because they're keyed by the stable feed UID.
// Recurring series are materialized with per-occurrence UIDs of the form
// "<uid>::<stamp>" (see 050_subscription_sync) — pauses store the BASE uid
// (everything before "::"), so one row pauses every occurrence of a series.
//
// `title` is a display snapshot taken when pausing, so the sidebar's
// "Paused events" list can label the row without an external_events lookup
// (the underlying rows may briefly not exist mid-sync).
// =============================================================================

migrate((app) => {
  const usersCollectionId = app.findCollectionByNameOrId("users").id;
  const calSubsId = app.findCollectionByNameOrId("calendar_subscriptions").id;

  const pauses = new Collection({
    type: "base",
    name: "external_event_pauses",
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
      { type: "text", name: "title", required: false, max: 500 }
    ],
    indexes: [
      "CREATE INDEX idx_ext_pause_user ON external_event_pauses (user)",
      "CREATE UNIQUE INDEX idx_ext_pause_sub_uid ON external_event_pauses (subscription, ical_uid)"
    ]
  });
  app.save(pauses);
}, (app) => {
  try {
    const pauses = app.findCollectionByNameOrId("external_event_pauses");
    app.delete(pauses);
  } catch (e) { /* not present */ }
});
