/// <reference path="../pb_data/types.d.ts" />

// Clean schema for calenDHD singleton instance.
//
// Phase 1: Create all collections with their basic fields, the "user" relation
//          (which points to the built-in users auth collection), rules, and indexes.
// Phase 2: Add cross-collection relation fields (category, template, subscription,
//          event, recurrence_parent) and their indexes — these require the target
//          collections to already exist.

migrate((app) => {

  // Look up the built-in users auth collection by name (ID may vary by PB version).
  const usersCollectionId = app.findCollectionByNameOrId("users").id;

  // ── Phase 1: Create collections with user relation + basic fields ──

  // ── categories ──────────────────────────────────────────────────────
  const categories = new Collection({
    type: "base",
    name: "categories",
    listRule: "@request.auth.id = user",
    viewRule: "@request.auth.id = user",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id = user",
    deleteRule: "@request.auth.id = user",
    fields: [
      { type: "relation", name: "user", required: true,
        collectionId: usersCollectionId, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "name", required: true, max: 100 },
      { type: "text", name: "color", required: true, max: 20 },
      { type: "text", name: "icon", required: false, max: 50 },
      { type: "number", name: "sort_order", required: false }
    ],
    indexes: [
      "CREATE INDEX idx_categories_user ON categories (user)"
    ]
  });
  app.save(categories);

  // ── calendar_subscriptions ──────────────────────────────────────────
  const calSubs = new Collection({
    type: "base",
    name: "calendar_subscriptions",
    listRule: "@request.auth.id = user",
    viewRule: "@request.auth.id = user",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id = user",
    deleteRule: "@request.auth.id = user",
    fields: [
      { type: "relation", name: "user", required: true,
        collectionId: usersCollectionId, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "name", required: true, max: 200 },
      { type: "url", name: "url", required: true },
      { type: "text", name: "color_override", required: false, max: 20 },
      { type: "number", name: "refresh_interval_minutes", required: false },
      { type: "date", name: "last_refreshed", required: false },
      { type: "bool", name: "is_active", required: false },
      { type: "text", name: "error_message", required: false, max: 1000 }
    ],
    indexes: [
      "CREATE INDEX idx_calsubs_user ON calendar_subscriptions (user)"
    ]
  });
  app.save(calSubs);

  // ── user_settings ──────────────────────────────────────────────────
  const userSettings = new Collection({
    type: "base",
    name: "user_settings",
    listRule: "@request.auth.id = user",
    viewRule: "@request.auth.id = user",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id = user",
    deleteRule: "@request.auth.id = user",
    fields: [
      { type: "relation", name: "user", required: true,
        collectionId: usersCollectionId, maxSelect: 1, cascadeDelete: true },
      { type: "select", name: "default_view", required: false,
        values: ["day", "week", "month"], maxSelect: 1 },
      { type: "number", name: "week_starts_on", required: false },
      { type: "select", name: "time_format", required: false,
        values: ["12h", "24h"], maxSelect: 1 },
      { type: "select", name: "theme", required: false,
        values: ["light", "dark", "system"], maxSelect: 1 },
      { type: "text", name: "locale", required: false, max: 10, min: 2,
        pattern: "^[a-z]{2}(-[A-Z]{2})?$" },
      { type: "select", name: "color_palette", required: false,
        values: ["sage", "ocean", "lavender", "rose", "amber", "teal"], maxSelect: 1 },
      { type: "json", name: "default_reminders", required: false },
      { type: "bool", name: "notification_sound", required: false },
      { type: "bool", name: "reduce_animations", required: false },
      { type: "bool", name: "high_contrast", required: false },
      { type: "text", name: "timezone", required: false, max: 100 },
      { type: "json", name: "push_subscription", required: false },
      { type: "text", name: "ha_device_id", required: false, max: 200 },
      { type: "select", name: "notification_method", required: false,
        values: ["auto", "ha_companion", "ntfy", "browser"], maxSelect: 1 }
    ],
    indexes: [
      "CREATE UNIQUE INDEX idx_settings_user ON user_settings (user)"
    ]
  });
  app.save(userSettings);

  // ── templates ───────────────────────────────────────────────────────
  const templates = new Collection({
    type: "base",
    name: "templates",
    listRule: "@request.auth.id = user",
    viewRule: "@request.auth.id = user",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id = user",
    deleteRule: "@request.auth.id = user",
    fields: [
      { type: "relation", name: "user", required: true,
        collectionId: usersCollectionId, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "name", required: true, max: 200 },
      { type: "number", name: "default_duration_minutes", required: false },
      { type: "bool", name: "default_is_all_day", required: false },
      { type: "json", name: "default_reminders", required: false },
      { type: "text", name: "description", required: false, max: 5000 },
      { type: "file", name: "image", required: false, maxSelect: 1, maxSize: 5242880,
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"] },
      { type: "text", name: "icon", required: false, max: 100 },
      { type: "text", name: "color_override", required: false, max: 20 }
    ],
    indexes: [
      "CREATE INDEX idx_templates_user ON templates (user)"
    ]
  });
  app.save(templates);

  // ── events ──────────────────────────────────────────────────────────
  const events = new Collection({
    type: "base",
    name: "events",
    listRule: "@request.auth.id = user",
    viewRule: "@request.auth.id = user",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id = user",
    deleteRule: "@request.auth.id = user",
    fields: [
      { type: "relation", name: "user", required: true,
        collectionId: usersCollectionId, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "title", required: true, max: 500 },
      { type: "text", name: "description", required: false, max: 10000 },
      { type: "date", name: "start_time", required: true },
      { type: "date", name: "end_time", required: false },
      { type: "bool", name: "is_all_day", required: false },
      { type: "bool", name: "is_task", required: false },
      { type: "file", name: "image", required: false, maxSelect: 1, maxSize: 5242880,
        mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"] },
      { type: "text", name: "icon", required: false, max: 100 },
      { type: "text", name: "color_override", required: false, max: 20 },
      { type: "json", name: "recurrence_rule", required: false },
      { type: "json", name: "reminders", required: false },
      { type: "date", name: "completed_at", required: false },
      { type: "text", name: "local_id", required: false, max: 100 },
      { type: "date", name: "last_synced", required: false }
    ],
    indexes: [
      "CREATE INDEX idx_events_user ON events (user)",
      "CREATE INDEX idx_events_start ON events (start_time)",
      "CREATE INDEX idx_events_user_start ON events (user, start_time)"
    ]
  });
  app.save(events);

  // ── external_events ─────────────────────────────────────────────────
  const extEvents = new Collection({
    type: "base",
    name: "external_events",
    listRule: "@request.auth.id = user",
    viewRule: "@request.auth.id = user",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id = user",
    deleteRule: "@request.auth.id = user",
    fields: [
      { type: "relation", name: "user", required: true,
        collectionId: usersCollectionId, maxSelect: 1, cascadeDelete: false },
      { type: "text", name: "uid", required: true, max: 500 },
      { type: "text", name: "title", required: true, max: 500 },
      { type: "text", name: "description", required: false, max: 10000 },
      { type: "date", name: "start_time", required: true },
      { type: "date", name: "end_time", required: false },
      { type: "bool", name: "is_all_day", required: false },
      { type: "text", name: "location", required: false, max: 500 },
      { type: "json", name: "recurrence_rule", required: false },
      { type: "text", name: "raw_ics", required: false, max: 50000 }
    ],
    indexes: [
      "CREATE INDEX idx_ext_events_user ON external_events (user)",
      "CREATE INDEX idx_ext_events_uid ON external_events (uid)",
      "CREATE INDEX idx_ext_events_user_start ON external_events (user, start_time)"
    ]
  });
  app.save(extEvents);

  // ── scheduled_reminders ─────────────────────────────────────────────
  const reminders = new Collection({
    type: "base",
    name: "scheduled_reminders",
    listRule: "@request.auth.id = user",
    viewRule: "@request.auth.id = user",
    createRule: "@request.auth.id != ''",
    updateRule: "@request.auth.id = user",
    deleteRule: "@request.auth.id = user",
    fields: [
      { type: "relation", name: "user", required: true,
        collectionId: usersCollectionId, maxSelect: 1, cascadeDelete: true },
      { type: "date", name: "scheduled_for", required: true },
      { type: "select", name: "reminder_type", required: false,
        values: ["notification", "email"], maxSelect: 1 },
      { type: "date", name: "sent_at", required: false },
      { type: "select", name: "delivery_method", required: false,
        values: ["ha_companion", "ntfy", "browser"], maxSelect: 1 },
      { type: "text", name: "error_message", required: false, max: 1000 }
    ],
    indexes: [
      "CREATE INDEX idx_reminders_user ON scheduled_reminders (user)",
      "CREATE INDEX idx_reminders_scheduled ON scheduled_reminders (scheduled_for)"
    ]
  });
  app.save(reminders);

  // ── Phase 2: Add cross-collection relation fields ──────────────────
  // These reference custom collections that were just created above.

  const categoriesId = app.findCollectionByNameOrId("categories").id;
  const templatesId = app.findCollectionByNameOrId("templates").id;
  const eventsId = app.findCollectionByNameOrId("events").id;
  const calSubsId = app.findCollectionByNameOrId("calendar_subscriptions").id;

  // templates.category → categories
  const tpl = app.findCollectionByNameOrId("templates");
  tpl.fields.add(new RelationField({
    name: "category",
    required: false,
    collectionId: categoriesId,
    maxSelect: 1,
    cascadeDelete: false
  }));
  app.save(tpl);

  // events: template, category, recurrence_parent
  const evt = app.findCollectionByNameOrId("events");
  evt.fields.add(new RelationField({
    name: "template",
    required: false,
    collectionId: templatesId,
    maxSelect: 1,
    cascadeDelete: false
  }));
  evt.fields.add(new RelationField({
    name: "category",
    required: false,
    collectionId: categoriesId,
    maxSelect: 1,
    cascadeDelete: false
  }));
  evt.fields.add(new RelationField({
    name: "recurrence_parent",
    required: false,
    collectionId: eventsId,
    maxSelect: 1,
    cascadeDelete: false
  }));
  app.save(evt);

  // external_events.subscription → calendar_subscriptions
  const extEvt = app.findCollectionByNameOrId("external_events");
  extEvt.fields.add(new RelationField({
    name: "subscription",
    required: true,
    collectionId: calSubsId,
    maxSelect: 1,
    cascadeDelete: true
  }));
  extEvt.addIndex("idx_ext_events_sub", false, "subscription", "");
  app.save(extEvt);

  // scheduled_reminders.event → events
  const rem = app.findCollectionByNameOrId("scheduled_reminders");
  rem.fields.add(new RelationField({
    name: "event",
    required: true,
    collectionId: eventsId,
    maxSelect: 1,
    cascadeDelete: true
  }));
  rem.addIndex("idx_reminders_event", false, "event", "");
  app.save(rem);

}, (app) => {
  // Rollback: delete all collections in reverse dependency order
  const names = [
    "scheduled_reminders",
    "external_events",
    "events",
    "templates",
    "user_settings",
    "calendar_subscriptions",
    "categories"
  ];
  for (const name of names) {
    try {
      const col = app.findCollectionByNameOrId(name);
      app.delete(col);
    } catch (e) {
      // ignore if not found
    }
  }
});
