/// <reference path="../pb_data/types.d.ts" />

// =============================================================================
// 0009 — Remove brain dump
//
// The brain-dump (quick thought capture) feature was removed from the app.
// Drop its collection; any captured thoughts are deleted with it.
// =============================================================================

migrate((app) => {
  const brainDump = app.findCollectionByNameOrId("brain_dump");
  app.delete(brainDump);
}, (app) => {
  // Down migration: recreate the collection as defined in 0004
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
      "CREATE INDEX idx_brain_dump_user ON brain_dump (user)"
    ]
  });
  app.save(brainDump);
});
