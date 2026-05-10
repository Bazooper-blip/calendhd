/// <reference path="../pb_data/types.d.ts" />

// =============================================================================
// 0006 — Add "web_push" to scheduled_reminders.delivery_method values
//
// Migration 0001 set the allowed values to ["ha_companion","ntfy","browser"];
// migration 0005 (external pipeline) added "web_push" but only for the parallel
// external_scheduled_reminders collection. The cron writes "web_push" for both,
// so internal saves were silently rejected — markReminderSent threw, sent_at
// stayed empty, and every cron tick re-fired the same reminder. Browsers
// dedupe pushes by tag, so the user sees no notifications at all.
//
// Was masked before 1.5.4 because the cron never actually ran.
// =============================================================================

migrate((app) => {
  const collection = app.findCollectionByNameOrId("scheduled_reminders");
  for (let i = 0; i < collection.fields.length; i++) {
    if (collection.fields[i].name === "delivery_method") {
      collection.fields[i].values = ["ha_companion", "ntfy", "browser", "web_push"];
      break;
    }
  }
  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("scheduled_reminders");
  for (let i = 0; i < collection.fields.length; i++) {
    if (collection.fields[i].name === "delivery_method") {
      collection.fields[i].values = ["ha_companion", "ntfy", "browser"];
      break;
    }
  }
  app.save(collection);
});
