/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const usersCollectionId = app.findCollectionByNameOrId("users").id;

  // ── routine_templates ──────────────────────────────────────────
  const routineTemplates = new Collection({
    type: "base",
    name: "routine_templates",
    listRule: "@request.auth.id = user",
    viewRule: "@request.auth.id = user",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id = user",
    deleteRule: "@request.auth.id = user",
    fields: [
      { type: "relation", name: "user", required: true,
        collectionId: usersCollectionId, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "name", required: true, max: 200 },
      { type: "json", name: "steps", required: true },
      { type: "json", name: "schedule", required: true },
      { type: "bool", name: "is_active", required: false },
      { type: "text", name: "color", required: false, max: 20 },
      { type: "text", name: "icon", required: false, max: 100 }
    ],
    indexes: [
      "CREATE INDEX idx_routine_templates_user ON routine_templates (user)",
      "CREATE INDEX idx_routine_templates_active ON routine_templates (user, is_active)"
    ]
  });
  app.save(routineTemplates);

  // ── Add routine fields to events ───────────────────────────────
  const routineTemplatesId = app.findCollectionByNameOrId("routine_templates").id;
  const evt = app.findCollectionByNameOrId("events");

  evt.fields.add(new RelationField({
    name: "routine_template",
    required: false,
    collectionId: routineTemplatesId,
    maxSelect: 1,
    cascadeDelete: false
  }));
  evt.fields.add(new NumberField({
    name: "routine_step_index",
    required: false
  }));
  evt.fields.add(new TextField({
    name: "energy_level",
    required: false,
    max: 10
  }));

  app.save(evt);

}, (app) => {
  // Rollback: remove routine fields from events, then delete collection
  try {
    const evt = app.findCollectionByNameOrId("events");
    evt.fields.removeByName("routine_template");
    evt.fields.removeByName("routine_step_index");
    evt.fields.removeByName("energy_level");
    app.save(evt);
  } catch (e) { /* ignore */ }

  try {
    const col = app.findCollectionByNameOrId("routine_templates");
    app.delete(col);
  } catch (e) { /* ignore */ }
});
