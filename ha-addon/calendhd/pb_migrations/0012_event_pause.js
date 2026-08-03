/// <reference path="../pb_data/types.d.ts" />

// Pause flag for (recurring) events: a paused event keeps its row — title,
// schedule, recurrence rule, reminders config — but is hidden from every
// calendar view and its reminders are skipped until resumed. Vacation mode.
migrate((app) => {
  const collection = app.findCollectionByNameOrId("events");

  collection.fields.add(new BoolField({
    name: "is_paused",
    required: false
  }));

  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("events");
  collection.fields.removeByName("is_paused");
  app.save(collection);
});
