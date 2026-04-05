/// <reference path="../pb_data/types.d.ts" />

// Schedule reminders when events are created
onRecordAfterCreateSuccess("events", function(e) {
    var event = e.record;

    var reminders = event.get("reminders");
    if (typeof reminders === "string") {
        try { reminders = JSON.parse(reminders); } catch (err) { reminders = null; }
    }
    if (!reminders || !Array.isArray(reminders) || reminders.length === 0) {
        return;
    }

    var startTime = event.get("start_time");
    if (!startTime) {
        return;
    }

    var userId = event.get("user");
    var eventTime = new Date(startTime);
    var now = new Date();

    for (var i = 0; i < reminders.length; i++) {
        var reminder = reminders[i];
        if (reminder.type !== "notification") {
            continue;
        }

        var minutesBefore = reminder.minutes_before || 0;
        var scheduledFor = new Date(eventTime.getTime() - (minutesBefore * 60 * 1000));

        if (scheduledFor <= now) {
            continue;
        }

        try {
            var collection = $app.findCollectionByNameOrId("scheduled_reminders");
            var record = new Record(collection);
            record.set("user", userId);
            record.set("event", event.id);
            record.set("scheduled_for", scheduledFor.toISOString());
            record.set("reminder_type", "notification");
            $app.save(record);
            console.log("Created scheduled reminder for event '" + event.get("title") + "' at " + scheduledFor.toISOString());
        } catch (err) {
            console.log("Failed to create scheduled reminder:", err);
        }
    }
});

// Reschedule reminders when events are updated
onRecordAfterUpdateSuccess("events", function(e) {
    var event = e.record;

    // Delete existing unsent reminders for this event
    try {
        var existing = $app.findAllRecords("scheduled_reminders", $dbx.and(
            $dbx.hashExp({ "event": event.id }),
            $dbx.newExp("sent_at = '' OR sent_at IS NULL")
        ));
        for (var i = 0; i < existing.length; i++) {
            $app.delete(existing[i]);
        }
    } catch (err) {
        // No existing reminders found, that's OK
    }

    // Create new reminders
    var reminders = event.get("reminders");
    if (typeof reminders === "string") {
        try { reminders = JSON.parse(reminders); } catch (err) { reminders = null; }
    }
    if (!reminders || !Array.isArray(reminders) || reminders.length === 0) {
        return;
    }

    var startTime = event.get("start_time");
    if (!startTime) {
        return;
    }

    var userId = event.get("user");
    var eventTime = new Date(startTime);
    var now = new Date();

    for (var i = 0; i < reminders.length; i++) {
        var reminder = reminders[i];
        if (reminder.type !== "notification") {
            continue;
        }

        var minutesBefore = reminder.minutes_before || 0;
        var scheduledFor = new Date(eventTime.getTime() - (minutesBefore * 60 * 1000));

        if (scheduledFor <= now) {
            continue;
        }

        try {
            var collection = $app.findCollectionByNameOrId("scheduled_reminders");
            var record = new Record(collection);
            record.set("user", userId);
            record.set("event", event.id);
            record.set("scheduled_for", scheduledFor.toISOString());
            record.set("reminder_type", "notification");
            $app.save(record);
            console.log("Created scheduled reminder for event '" + event.get("title") + "' at " + scheduledFor.toISOString());
        } catch (err) {
            console.log("Failed to create scheduled reminder:", err);
        }
    }
});
