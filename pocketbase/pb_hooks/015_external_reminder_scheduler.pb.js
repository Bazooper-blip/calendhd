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
onRecordAfterCreateSuccess("external_events", (e) => {
    const helpers = require(`${__hooks}/pb_helpers.js`);
    helpers.scheduleExternalReminder(e.record);
});

onRecordAfterUpdateSuccess("external_events", (e) => {
    const helpers = require(`${__hooks}/pb_helpers.js`);
    helpers.scheduleExternalReminder(e.record);
});

// Reschedule everything for a subscription whose defaults changed.
onRecordAfterUpdateSuccess("calendar_subscriptions", (e) => {
    const helpers = require(`${__hooks}/pb_helpers.js`);
    helpers.rescheduleExternalRemindersForSubscription(e.record.id);
});

// A new/updated/deleted override should re-schedule for that specific
// (subscription, uid). Read keys BEFORE delegating because the deleted record
// is still queryable inside the callback.
onRecordAfterCreateSuccess("external_event_reminders", (e) => {
    const helpers = require(`${__hooks}/pb_helpers.js`);
    helpers.rescheduleExternalRemindersForOverride(
        e.record.get("subscription"),
        e.record.get("ical_uid")
    );
});

onRecordAfterUpdateSuccess("external_event_reminders", (e) => {
    const helpers = require(`${__hooks}/pb_helpers.js`);
    helpers.rescheduleExternalRemindersForOverride(
        e.record.get("subscription"),
        e.record.get("ical_uid")
    );
});

onRecordAfterDeleteSuccess("external_event_reminders", (e) => {
    const helpers = require(`${__hooks}/pb_helpers.js`);
    helpers.rescheduleExternalRemindersForOverride(
        e.record.get("subscription"),
        e.record.get("ical_uid")
    );
});
