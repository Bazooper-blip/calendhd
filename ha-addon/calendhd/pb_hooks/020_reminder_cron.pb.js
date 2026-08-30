/// <reference path="../pb_data/types.d.ts" />

// Cron job: check for due reminders every minute
cronAdd("reminder_sender", "* * * * *", function() {
    var now = new Date();
    var nowISO = now.toISOString();
    // PB stores datetimes as 'YYYY-MM-DD HH:MM:SS.fffZ' (space separator).
    // toISOString() produces a 'T' separator. SQL '<=' is a lexical compare,
    // and ' ' (32) < 'T' (84) — so a T-formatted RHS makes every "today" row
    // lexically "due" the instant UTC rolls over to a new day. Match storage.
    var nowSQL = nowISO.replace("T", " ");

    // Find all unsent reminders that are due. Failures fall open (empty list)
    // and are logged — a broken internal query must NOT early-return, since
    // that would silently skip the external reminder block below.
    var dueReminders = [];
    try {
        dueReminders = $app.findAllRecords("scheduled_reminders", $dbx.and(
            $dbx.exp("scheduled_for <= {:now}", { now: nowSQL }),
            $dbx.exp("sent_at = '' OR sent_at IS NULL")
        ));
    } catch (err) {
        console.log("reminder_sender: scheduled_reminders query failed: " + err);
    }

    if (dueReminders && dueReminders.length > 0) {
        console.log("Processing " + dueReminders.length + " due reminders");
        for (var i = 0; i < dueReminders.length; i++) {
            processReminder(dueReminders[i], nowISO);
        }
    }

    // --- Helper functions (inside callback scope) ---

    function processReminder(reminder, nowISO) {
        var userId = reminder.get("user");
        var eventId = reminder.get("event");

        // Load the event
        var event;
        try {
            event = $app.findRecordById("events", eventId);
        } catch (err) {
            // Event was deleted, mark reminder as sent
            markReminderSent(reminder, nowISO, "event_deleted");
            return;
        }

        // Belt-and-braces: the scheduler already deletes pending reminders
        // when an event is paused, but never notify for a paused event.
        if (event.getBool("is_paused")) {
            markReminderSent(reminder, nowISO, "event_paused");
            return;
        }

        // Load user settings
        var userSettings;
        try {
            var settingsRecords = $app.findAllRecords("user_settings", $dbx.hashExp({ "user": userId }));
            userSettings = settingsRecords.length > 0 ? settingsRecords[0] : null;
        } catch (err) {
            userSettings = null;
        }

        var eventTitle = event.get("title") || "Event";
        var eventStart = event.get("start_time") || "";
        var firstStep = event.get("first_step") || "";

        // Recurring events: the stored start_time is the series seed (often
        // long past). Describe the occurrence this reminder was armed for —
        // the first one at/after its scheduled_for.
        var helpers = require(`${__hooks}/pb_helpers.js`);
        var rule = helpers.parseJsonField(event.get("recurrence_rule"));
        if (rule && rule.frequency && eventStart) {
            var seedStart = new Date(String(eventStart).replace(" ", "T"));
            var schedFor = new Date(String(reminder.get("scheduled_for")).replace(" ", "T"));
            var occStart = helpers.firstLocalOccurrenceOnOrAfter(rule, seedStart, schedFor);
            if (occStart) {
                eventStart = occStart.toISOString();
            }
        }

        // Format the notification message — first_step (if set) is the actionable
        // body line; otherwise fall back to "<title> at <HH:mm>". The push-service
        // shows title as the heading and message as the body.
        var message = firstStep
            ? firstStep
            : formatReminderMessage(eventTitle, eventStart);

        var sent = false;
        var deliveryMethod = "";
        var errorMessage = "";

        // Fan out to every device row for this user. We no longer need
        // userSettings here — kept the lookup above so log messages can
        // still mention the user, and to preserve future per-user toggles.
        var pushResult = sendWebPushNotification(userId, eventTitle, message, eventId);
        if (pushResult.success) {
            sent = true;
            deliveryMethod = "web_push";
        } else {
            errorMessage = pushResult.error;
        }

        // Mark as sent regardless to prevent infinite retries
        markReminderSent(reminder, nowISO, errorMessage, deliveryMethod);

        if (sent) {
            console.log("Sent reminder for '" + eventTitle + "' via " + deliveryMethod + " to user " + userId);
        } else {
            console.log("Failed to send reminder for '" + eventTitle + "': " + errorMessage);
        }

        // Recurring events: re-arm the next occurrence's reminders. (The
        // scheduler hook only arms on create/update; without this the series
        // would go silent after its first send.)
        if (rule && rule.frequency) {
            rearmRecurringReminders(event, rule, helpers, new Date());
        }
    }

    // Insert the next scheduled_reminders row(s) for a recurring event.
    // Every firing re-computes ALL of the event's reminder configs; rows
    // whose scheduled_for already exists unsent are skipped, so an event
    // with several lead times ends up with exactly one row per config.
    function rearmRecurringReminders(event, rule, helpers, nowDate) {
        var reminders = helpers.parseJsonField(event.get("reminders"));
        if (!reminders || !Array.isArray(reminders) || reminders.length === 0) {
            return;
        }
        var seedStart = new Date(String(event.get("start_time")).replace(" ", "T"));

        var pendingTimes = {};
        try {
            var pending = $app.findRecordsByFilter("scheduled_reminders", "event = {:ev}", "", 200, 0, { ev: event.id });
            for (var i = 0; i < pending.length; i++) {
                if (!pending[i].getString("sent_at")) {
                    pendingTimes[pending[i].getString("scheduled_for")] = true;
                }
            }
        } catch (err) { /* none pending */ }

        for (var j = 0; j < reminders.length; j++) {
            if (reminders[j].type !== "notification") {
                continue;
            }
            var scheduledFor = helpers.nextReminderTime(rule, seedStart, reminders[j].minutes_before || 0, nowDate);
            if (!scheduledFor) {
                continue; // series exhausted (count/end_date)
            }
            // Stored rows use PB's space-separated datetime format.
            if (pendingTimes[scheduledFor.toISOString().replace("T", " ")]) {
                continue;
            }
            try {
                var collection = $app.findCollectionByNameOrId("scheduled_reminders");
                var record = new Record(collection);
                record.set("user", event.get("user"));
                record.set("event", event.id);
                record.set("scheduled_for", scheduledFor.toISOString());
                record.set("reminder_type", "notification");
                $app.save(record);
                console.log("Re-armed recurring reminder for '" + event.get("title") + "' at " + scheduledFor.toISOString());
            } catch (err) {
                console.log("Failed to re-arm recurring reminder:", err);
            }
        }
    }

    // Fan out to every device subscribed under this user. Returns success
    // if at least one device received the push; otherwise reports the
    // count so the failure log line shows "0 sent / N failed".
    function sendWebPushNotification(userId, title, message, tag) {
        if (!userId) {
            return { success: false, error: "no_user" };
        }
        var helpers = require(`${__hooks}/pb_helpers.js`);
        var result = helpers.sendPushToAllDevices(userId, title, message, tag);
        if (result.sent > 0) {
            return { success: true, error: "", sent: result.sent, failed: result.failed };
        }
        if (result.sent === 0 && result.failed === 0) {
            return { success: false, error: "no_devices" };
        }
        return { success: false, error: "push_fanout_failed_" + result.failed };
    }

    function formatReminderMessage(title, startTime) {
        if (!startTime) {
            return "Reminder: " + title;
        }
        var eventDate = new Date(startTime);
        var hours = eventDate.getHours();
        var minutes = eventDate.getMinutes();
        var timeStr = (hours < 10 ? "0" : "") + hours + ":" + (minutes < 10 ? "0" : "") + minutes;
        // Include a day label so reminders sent a day or more ahead aren't
        // misread as "happening now". Same-day reminders read "<title> today
        // at HH:mm"; further-out ones read "<title> on Tue, Jun 16 at HH:mm".
        return title + " " + relativeDayLabel(eventDate, new Date()) + " at " + timeStr;
    }

    // Human-friendly day label relative to `now`: "today" / "tomorrow" for the
    // near term, otherwise "on <Dow>, <Mon> <D>". Uses local calendar fields —
    // the PB server runs in the calendar's timezone (same assumption the
    // formatting above and the ICS parser already make).
    function relativeDayLabel(eventDate, now) {
        function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
        var diffDays = Math.round((startOfDay(eventDate).getTime() - startOfDay(now).getTime()) / 86400000);
        if (diffDays === 0) return "today";
        if (diffDays === 1) return "tomorrow";
        var DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        return "on " + DOW[eventDate.getDay()] + ", " + MON[eventDate.getMonth()] + " " + eventDate.getDate();
    }

    function markReminderSent(reminder, nowISO, errorMessage, deliveryMethod) {
        try {
            reminder.set("sent_at", nowISO);
            if (deliveryMethod) {
                reminder.set("delivery_method", deliveryMethod);
            }
            if (errorMessage) {
                reminder.set("error_message", errorMessage);
            }
            $app.save(reminder);
        } catch (err) {
            console.log("Failed to mark reminder as sent:", err);
        }
    }

    // ── External-event reminders ──────────────────────────────────
    // Parallel collection: external_scheduled_reminders. Same processing
    // contract (scheduled_for / sent_at / delivery_method / error_message).
    // Failures fall open (empty list) and are logged so an external-only
    // outage stays visible without blocking the internal pipeline above.
    var dueExternal = [];
    try {
        dueExternal = $app.findAllRecords("external_scheduled_reminders", $dbx.and(
            $dbx.exp("scheduled_for <= {:now}", { now: nowSQL }),
            $dbx.exp("sent_at = '' OR sent_at IS NULL")
        ));
    } catch (err) {
        console.log("reminder_sender: external_scheduled_reminders query failed: " + err);
    }

    if (dueExternal && dueExternal.length > 0) {
        console.log("Processing " + dueExternal.length + " due external reminders");
        for (var k = 0; k < dueExternal.length; k++) {
            processExternalReminder(dueExternal[k], nowISO);
        }
    }

    function processExternalReminder(reminder, nowISO) {
        var userId = reminder.get("user");
        var subId = reminder.get("subscription");
        var uid = reminder.get("ical_uid");
        if (!subId || !uid) {
            markExternalReminderSent(reminder, nowISO, "missing_external_keys");
            return;
        }

        // Look up the matching external event (UID is stable across re-syncs)
        var ext;
        try {
            var matches = $app.findRecordsByFilter(
                "external_events",
                "subscription = {:sub} && uid = {:uid}",
                "", 1, 0,
                { sub: subId, uid: uid }
            );
            if (!matches || matches.length === 0) {
                markExternalReminderSent(reminder, nowISO, "external_event_missing");
                return;
            }
            ext = matches[0];
        } catch (err) {
            markExternalReminderSent(reminder, nowISO, "external_lookup_failed");
            return;
        }

        var eventTitle = ext.get("title") || "Event";
        var eventStart = ext.get("start_time") || "";
        // sendPushToAllDevices prefixes "calendhd-reminder-"; pass "ext-<uid>"
        // so the final notification tag is "calendhd-reminder-ext-<uid>".
        var notificationTag = "ext-" + uid;

        var message = formatReminderMessage(eventTitle, eventStart);

        var pushResult = sendWebPushNotification(userId, eventTitle, message, notificationTag);
        var deliveryMethod = "";
        var errorMessage = "";
        if (pushResult.success) {
            deliveryMethod = "web_push";
        } else {
            errorMessage = pushResult.error;
        }

        markExternalReminderSent(reminder, nowISO, errorMessage, deliveryMethod);

        if (pushResult.success) {
            console.log("Sent ext reminder for '" + eventTitle + "' via " + deliveryMethod + " to user " + userId);
        } else {
            console.log("Failed to send ext reminder for '" + eventTitle + "': " + errorMessage);
        }
    }

    function markExternalReminderSent(reminder, nowISO, errorMessage, deliveryMethod) {
        try {
            reminder.set("sent_at", nowISO);
            if (deliveryMethod) {
                reminder.set("delivery_method", deliveryMethod);
            }
            if (errorMessage) {
                reminder.set("error_message", errorMessage);
            }
            $app.save(reminder);
        } catch (err) {
            console.log("Failed to mark ext reminder as sent:", err);
        }
    }
});
