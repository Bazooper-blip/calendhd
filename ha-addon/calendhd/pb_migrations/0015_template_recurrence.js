/// <reference path="../pb_data/types.d.ts" />

// Templates can carry a repeat rule, applied to events created from them
// (same shape as events.recurrence_rule: frequency / interval / days_of_week
// / end_date / count).
migrate((app) => {
  const collection = app.findCollectionByNameOrId("templates");

  collection.fields.add(new JSONField({
    name: "recurrence_rule",
    required: false
  }));

  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("templates");
  collection.fields.removeByName("recurrence_rule");
  app.save(collection);
});
