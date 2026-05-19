/// <reference path="../pb_data/types.d.ts" />

// =============================================================================
// 0008 — day_view_style: pick between the timeline and agenda day-view layouts
//
//  user_settings.day_view_style → "timeline" | "agenda"
//    timeline (default): existing 24-hour grid
//    agenda: chronological list with past/now/upcoming sections + free-time gaps
// =============================================================================

migrate((app) => {
  const userSettings = app.findCollectionByNameOrId("user_settings");
  userSettings.fields.add(new SelectField({
    name: "day_view_style",
    required: false,
    values: ["timeline", "agenda"],
    maxSelect: 1
  }));
  app.save(userSettings);
}, (app) => {
  const userSettings = app.findCollectionByNameOrId("user_settings");
  userSettings.fields.removeByName("day_view_style");
  app.save(userSettings);
});
