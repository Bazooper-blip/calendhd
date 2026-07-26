/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = app.findCollectionByNameOrId("templates");

  collection.fields.add(new TextField({
    name: "default_start_time",
    required: false,
    max: 5
  }));

  collection.fields.add(new TextField({
    name: "default_end_time",
    required: false,
    max: 5
  }));

  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("templates");
  collection.fields.removeByName("default_start_time");
  collection.fields.removeByName("default_end_time");
  app.save(collection);
});
