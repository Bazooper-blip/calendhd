/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = app.findCollectionByNameOrId("routine_templates");

  collection.fields.add(new TextField({
    name: "target_end_time",
    required: false,
    max: 5
  }));

  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("routine_templates");
  collection.fields.removeByName("target_end_time");
  app.save(collection);
});
