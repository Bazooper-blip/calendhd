/// <reference path="../pb_data/types.d.ts" />

// Opt-in toggle for "a new event was added" push notifications: when enabled,
// creating a local event fans out a push to every subscribed device (see
// 025_new_event_notification.pb.js). Off by default — the creator's own
// devices get pinged too (the singleton account can't tell devices apart),
// which not every household wants.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("user_settings");

  collection.fields.add(new BoolField({
    name: "notify_new_events",
    required: false
  }));

  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("user_settings");
  collection.fields.removeByName("notify_new_events");
  app.save(collection);
});
