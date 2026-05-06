/// <reference path="../pb_data/types.d.ts" />

// =============================================================================
// 015 — Schedule reminders for external (subscription-sourced) events
//
// Thin callbacks delegating to pb_helpers — module-level functions are NOT
// visible inside PB JSVM callbacks (callback scope isolation), so the heavy
// lifting lives in pb_helpers.js.
// =============================================================================

// Schedule on external_event create/update — subscription sync calls these N
// times per refresh because it deletes-and-recreates external_events.
onRecordAfterCreateSuccess((e) => {
    const helpers = require(`${__hooks}/pb_helpers.js`);
    helpers.scheduleExternalReminder(e.record);
}, "external_events");

onRecordAfterUpdateSuccess((e) => {
    const helpers = require(`${__hooks}/pb_helpers.js`);
    helpers.scheduleExternalReminder(e.record);
}, "external_events");

// Reschedule everything for a subscription whose record changed.
// PB JSVM doesn't expose previous-vs-current values, so we can't tell
// whether a reminder-relevant field changed (reminders_enabled,
// default_reminder_minutes) vs an unrelated one (last_refreshed,
// error_message). We over-trigger and let scheduleExternalReminder
// short-circuit when reminders are disabled — wasteful on every sync
// but ensures settings-change-without-sync paths stay correct.
onRecordAfterUpdateSuccess((e) => {
    const helpers = require(`${__hooks}/pb_helpers.js`);
    helpers.rescheduleExternalRemindersForSubscription(e.record.id);
}, "calendar_subscriptions");

// A new/updated/deleted override should re-schedule for that specific
// (subscription, uid). Read keys BEFORE delegating because the deleted record
// is still queryable inside the callback.
onRecordAfterCreateSuccess((e) => {
    const helpers = require(`${__hooks}/pb_helpers.js`);
    helpers.rescheduleExternalRemindersForOverride(
        e.record.get("subscription"),
        e.record.get("ical_uid")
    );
}, "external_event_reminders");

onRecordAfterUpdateSuccess((e) => {
    const helpers = require(`${__hooks}/pb_helpers.js`);
    helpers.rescheduleExternalRemindersForOverride(
        e.record.get("subscription"),
        e.record.get("ical_uid")
    );
}, "external_event_reminders");

onRecordAfterDeleteSuccess((e) => {
    const helpers = require(`${__hooks}/pb_helpers.js`);
    helpers.rescheduleExternalRemindersForOverride(
        e.record.get("subscription"),
        e.record.get("ical_uid")
    );
}, "external_event_reminders");
