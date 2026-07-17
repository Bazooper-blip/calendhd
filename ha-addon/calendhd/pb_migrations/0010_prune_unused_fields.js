/// <reference path="../pb_data/types.d.ts" />

// =============================================================================
// 0010 — Prune schema fields nothing reads or writes
//
// Audit of app (src/**), hooks (pb_hooks/**), and push-service usage found
// these columns are referenced by no code path:
//
//  user_settings
//   - reduce_animations, high_contrast     → never shipped; the app honors the
//                                            OS-level prefers-reduced-motion
//   - ha_device_id, notification_method    → pre-web-push notification design;
//                                            delivery is Web Push only now
//   - buffer_minutes, density,
//     daily_wins_enabled,
//     streak_celebration_enabled (0004),
//     day_view_style (0008)                → the Focus settings / timeline day
//                                            view were removed from the app
//  events
//   - image                                → attachment UI never built
//   - local_id, last_synced               → offline/Dexie sync layer removed
//   - recurrence_parent                   → recurrence expands client-side;
//                                            instances are never materialized
//   - template                            → "created from template" provenance
//                                            was never populated (templates
//                                            copy values at form time)
//  templates
//   - image                                → attachment UI never built
//  external_events
//   - raw_ics                              → sync stores parsed fields only
//
// Dropping a column deletes any stored values for it. That is the point:
// nothing can read them back.
// =============================================================================

migrate((app) => {
  const drop = (collectionName, fieldNames) => {
    const col = app.findCollectionByNameOrId(collectionName);
    for (const name of fieldNames) {
      // removeByName is a no-op when the field doesn't exist
      col.fields.removeByName(name);
    }
    app.save(col);
  };

  drop("user_settings", [
    "reduce_animations",
    "high_contrast",
    "ha_device_id",
    "notification_method",
    "buffer_minutes",
    "density",
    "daily_wins_enabled",
    "streak_celebration_enabled",
    "day_view_style"
  ]);

  drop("events", ["image", "local_id", "last_synced", "recurrence_parent", "template"]);
  drop("templates", ["image"]);
  drop("external_events", ["raw_ics"]);
}, (app) => {
  // Down migration: restore the fields as originally defined (0001/0004/0008).
  // Values dropped by the up migration are not recoverable.
  const userSettings = app.findCollectionByNameOrId("user_settings");
  userSettings.fields.add(new BoolField({ name: "reduce_animations", required: false }));
  userSettings.fields.add(new BoolField({ name: "high_contrast", required: false }));
  userSettings.fields.add(new TextField({ name: "ha_device_id", required: false, max: 200 }));
  userSettings.fields.add(new SelectField({
    name: "notification_method", required: false,
    values: ["auto", "ha_companion", "ntfy", "browser"], maxSelect: 1
  }));
  userSettings.fields.add(new NumberField({
    name: "buffer_minutes", required: false, min: 0, max: 120, onlyInt: true
  }));
  userSettings.fields.add(new SelectField({
    name: "density", required: false,
    values: ["compact", "comfortable", "spacious"], maxSelect: 1
  }));
  userSettings.fields.add(new BoolField({ name: "daily_wins_enabled", required: false }));
  userSettings.fields.add(new BoolField({ name: "streak_celebration_enabled", required: false }));
  userSettings.fields.add(new SelectField({
    name: "day_view_style", required: false,
    values: ["timeline", "agenda"], maxSelect: 1
  }));
  app.save(userSettings);

  const templatesId = app.findCollectionByNameOrId("templates").id;
  const eventsId = app.findCollectionByNameOrId("events").id;

  const events = app.findCollectionByNameOrId("events");
  events.fields.add(new FileField({
    name: "image", required: false, maxSelect: 1, maxSize: 5242880,
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"]
  }));
  events.fields.add(new TextField({ name: "local_id", required: false, max: 100 }));
  events.fields.add(new DateField({ name: "last_synced", required: false }));
  events.fields.add(new RelationField({
    name: "recurrence_parent", required: false,
    collectionId: eventsId, maxSelect: 1, cascadeDelete: false
  }));
  events.fields.add(new RelationField({
    name: "template", required: false,
    collectionId: templatesId, maxSelect: 1, cascadeDelete: false
  }));
  app.save(events);

  const templates = app.findCollectionByNameOrId("templates");
  templates.fields.add(new FileField({
    name: "image", required: false, maxSelect: 1, maxSize: 5242880,
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"]
  }));
  app.save(templates);

  const extEvents = app.findCollectionByNameOrId("external_events");
  extEvents.fields.add(new TextField({ name: "raw_ics", required: false, max: 50000 }));
  app.save(extEvents);
});
