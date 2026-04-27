/// <reference path="../pb_data/types.d.ts" />

// Cron job: check for due reminders every minute
cronAdd("reminder_sender", "* * * * *", function() {
    // PB JSVM runs callbacks in an isolated goja runtime — read env vars inside.
    var PUSH_SERVICE_URL = $os.getenv("PUSH_SERVICE_URL") || "http://localhost:3001";

    var now = new Date();
    var nowISO = now.toISOString();

    // Find all unsent reminders that are due
    var dueReminders;
    try {
        dueReminders = $app.findAllRecords("scheduled_reminders", $dbx.and(
            $dbx.newExp("scheduled_for <= {:now}", { now: nowISO }),
            $dbx.newExp("sent_at = '' OR sent_at IS NULL")
        ));
    } catch (err) {
        // No due reminders
        return;
    }

    if (!dueReminders || dueReminders.length === 0) {
        return;
    }

    console.log("Processing " + dueReminders.length + " due reminders");

    for (var i = 0; i < dueReminders.length; i++) {
        processReminder(dueReminders[i], nowISO);
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

        // Format the notification message
        var message = formatReminderMessage(eventTitle, eventStart);

        var sent = false;
        var deliveryMethod = "";
        var errorMessage = "";

        // Try to send Web Push notification
        var pushResult = sendWebPushNotification(userSettings, eventTitle, message, eventId);
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
    }

    function sendWebPushNotification(userSettings, title, message, eventId) {
        if (!userSettings) {
            return { success: false, error: "no_user_settings" };
        }

        // PB JSVM returns json fields as byte arrays — use the shared decoder.
        var helpers = require(`${__hooks}/routine_helpers.js`);
        var pushSubscription = helpers.parseJsonField(userSettings.get("push_subscription"));

        if (!pushSubscription) {
            return { success: false, error: "no_push_subscription" };
        }
        if (!pushSubscription.endpoint || !pushSubscription.keys) {
            return { success: false, error: "invalid_subscription" };
        }

        // Send push notification via push service
        try {
            var res = $http.send({
                url: PUSH_SERVICE_URL + "/send",
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    subscription: pushSubscription,
                    payload: {
                        title: title,
                        body: message,
                        tag: "calendhd-reminder-" + eventId,
                        data: {
                            eventId: eventId
                        }
                    }
                }),
                timeout: 10
            });

            if (res.statusCode >= 200 && res.statusCode < 300) {
                return { success: true, error: "" };
            } else {
                return { success: false, error: "push_api_" + res.statusCode };
            }
        } catch (err) {
            return { success: false, error: "push_request_failed: " + err };
        }
    }

    function formatReminderMessage(title, startTime) {
        if (!startTime) {
            return "Reminder: " + title;
        }
        var eventDate = new Date(startTime);
        var hours = eventDate.getHours();
        var minutes = eventDate.getMinutes();
        var timeStr = (hours < 10 ? "0" : "") + hours + ":" + (minutes < 10 ? "0" : "") + minutes;
        return title + " at " + timeStr;
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
});
