/// <reference path="../pb_data/types.d.ts" />

// =============================================================================
// 0004 — ADHD-friendly feature schema additions
//
//  - events.first_step       → optional "what's the first physical action"
//  - user_settings additions → buffer_minutes, density, daily_wins_enabled,
//                              streak_celebration_enabled
//  - new collection brain_dump → quick capture without scheduling
// =============================================================================

migrate((app) => {
  // events.first_step
  const events = app.findCollectionByNameOrId("events");
  events.fields.add(new TextField({
    name: "first_step",
    required: false,
    max: 500
  }));
  app.save(events);

  // user_settings additions
  const userSettings = app.findCollectionByNameOrId("user_settings");
  userSettings.fields.add(new NumberField({
    name: "buffer_minutes",
    required: false,
    min: 0,
    max: 120,
    onlyInt: true
  }));
  userSettings.fields.add(new SelectField({
    name: "density",
    required: false,
    values: ["compact", "comfortable", "spacious"],
    maxSelect: 1
  }));
  userSettings.fields.add(new BoolField({
    name: "daily_wins_enabled",
    required: false
  }));
  userSettings.fields.add(new BoolField({
    name: "streak_celebration_enabled",
    required: false
  }));
  app.save(userSettings);

  // brain_dump collection
  const usersCollectionId = app.findCollectionByNameOrId("users").id;
  const brainDump = new Collection({
    type: "base",
    name: "brain_dump",
    listRule: "@request.auth.id = user",
    viewRule: "@request.auth.id = user",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id = user",
    deleteRule: "@request.auth.id = user",
    fields: [
      { type: "relation", name: "user", required: true,
        collectionId: usersCollectionId, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "title", required: true, max: 500 },
      { type: "text", name: "notes", required: false, max: 10000 }
    ],
    indexes: [
      "CREATE INDEX idx_brain_dump_user ON brain_dump (user)",
      "CREATE INDEX idx_brain_dump_user_created ON brain_dump (user, created)"
    ]
  });
  app.save(brainDump);
}, (app) => {
  // Down migration
  const events = app.findCollectionByNameOrId("events");
  events.fields.removeByName("first_step");
  app.save(events);

  const userSettings = app.findCollectionByNameOrId("user_settings");
  userSettings.fields.removeByName("buffer_minutes");
  userSettings.fields.removeByName("density");
  userSettings.fields.removeByName("daily_wins_enabled");
  userSettings.fields.removeByName("streak_celebration_enabled");
  app.save(userSettings);

  const brainDump = app.findCollectionByNameOrId("brain_dump");
  app.delete(brainDump);
});
