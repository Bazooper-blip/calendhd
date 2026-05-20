/// <reference path="../pb_data/types.d.ts" />

// =============================================================================
// 0010 — household users: per-device settings, shared calendar data
//
// The app stays a singleton household, but now supports optional named users
// alongside the bootstrap `home@calendhd.local` account so each device can
// pick its own settings (theme, view, density, …) while still seeing the
// same events/categories/routines as everyone else.
//
// Data model decision: the `user` field on shared collections becomes a
// soft "originator" tag, not an ACL field. Any authenticated user (singleton
// or named) may CRUD any row in the shared collections. Per-user state
// (user_settings, push_subscriptions, scheduled_reminders, …) stays locked
// to its owner.
//
// Push notifications stay per-user. A named user only receives pushes for
// events they personally created. The singleton (guest) account receives
// pushes for guest-created events and routine-generator events. For
// household-wide notifications, keep the receiving device signed in as
// guest.
// =============================================================================

migrate((app) => {
  // Shared collections — any authenticated user can CRUD any row.
  const SHARED_COLLECTIONS = [
    "events",
    "categories",
    "templates",
    "routine_templates",
    "calendar_subscriptions",
    "external_events",
    "external_event_reminders"
  ];
  const SHARED_RULE = "@request.auth.id != ''";

  for (const name of SHARED_COLLECTIONS) {
    const col = app.findCollectionByNameOrId(name);
    col.listRule = SHARED_RULE;
    col.viewRule = SHARED_RULE;
    col.createRule = SHARED_RULE;
    col.updateRule = SHARED_RULE;
    col.deleteRule = SHARED_RULE;
    app.save(col);
  }

  // Users collection — allow any signed-in user to register new accounts
  // and see other accounts (for the device-switcher UI). Self-update and
  // self-delete only.
  const users = app.findCollectionByNameOrId("users");
  users.listRule = "@request.auth.id != ''";
  users.viewRule = "@request.auth.id != ''";
  users.createRule = "@request.auth.id != ''";
  users.updateRule = "id = @request.auth.id";
  users.deleteRule = "id = @request.auth.id";
  app.save(users);
}, (app) => {
  // Down migration — restore per-user ACL rules.
  const SHARED_COLLECTIONS = [
    "events",
    "categories",
    "templates",
    "routine_templates",
    "calendar_subscriptions",
    "external_events",
    "external_event_reminders"
  ];

  for (const name of SHARED_COLLECTIONS) {
    const col = app.findCollectionByNameOrId(name);
    col.listRule = "@request.auth.id = user";
    col.viewRule = "@request.auth.id = user";
    col.createRule = "@request.auth.id != ''";
    col.updateRule = "@request.auth.id = user";
    col.deleteRule = "@request.auth.id = user";
    app.save(col);
  }

  const users = app.findCollectionByNameOrId("users");
  users.listRule = null;
  users.viewRule = null;
  users.createRule = null;
  users.updateRule = null;
  users.deleteRule = null;
  app.save(users);
});
