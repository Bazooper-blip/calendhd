// Shared helpers for routine event generation (loaded via require() inside hooks)

// PB JSVM returns JSON fields as byte arrays from record.get().
// Decode UTF-8 byte arrays properly (String.fromCharCode treats each byte
// as a code point, mangling multi-byte chars like ä, ö, å).
function utf8Decode(bytes) {
    var str = '';
    var i = 0;
    while (i < bytes.length) {
        var b = bytes[i];
        if (b < 0x80) {
            str += String.fromCharCode(b);
            i++;
        } else if (b < 0xE0) {
            str += String.fromCharCode(((b & 0x1F) << 6) | (bytes[i+1] & 0x3F));
            i += 2;
        } else if (b < 0xF0) {
            str += String.fromCharCode(((b & 0x0F) << 12) | ((bytes[i+1] & 0x3F) << 6) | (bytes[i+2] & 0x3F));
            i += 3;
        } else {
            var cp = ((b & 0x07) << 18) | ((bytes[i+1] & 0x3F) << 12) | ((bytes[i+2] & 0x3F) << 6) | (bytes[i+3] & 0x3F);
            cp -= 0x10000;
            str += String.fromCharCode(0xD800 + (cp >> 10), 0xDC00 + (cp & 0x3FF));
            i += 4;
        }
    }
    return str;
}

function parseJsonField(value) {
    if (!value) return null;
    if (typeof value === "string") {
        try { return JSON.parse(value); } catch (e) { return null; }
    }
    if (typeof value === "object" && !Array.isArray(value)) return value;
    if (Array.isArray(value) || (typeof value === "object" && typeof value.length === "number")) {
        try {
            var str = utf8Decode(value);
            return JSON.parse(str);
        } catch (e) { return null; }
    }
    return value;
}

module.exports = {
    parseJsonField: parseJsonField,

    deleteRoutineEventsForDate: function(routineId, targetDate) {
        var dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
        var dayEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59);

        var events;
        try {
            events = $app.findRecordsByFilter("events",
                "routine_template = {:rid} && start_time >= {:start} && start_time <= {:end}",
                "", 100, 0,
                { rid: routineId, start: dayStart.toISOString(), end: dayEnd.toISOString() }
            );
        } catch (err) {
            return;
        }

        for (var i = 0; i < events.length; i++) {
            try { $app.delete(events[i]); } catch (err) { /* ignore */ }
        }
    },

    generateEventsForRoutine: function(routine, targetDate) {
        var now = targetDate || new Date();

        var schedule = parseJsonField(routine.get("schedule"));
        if (!schedule || !schedule.days || !schedule.time) return;

        var dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
        var targetDayName = dayNames[now.getDay()];

        if (schedule.days.indexOf(targetDayName) === -1) return;

        var steps = parseJsonField(routine.get("steps"));
        if (!steps || !steps.length) return;

        var routineId = routine.id;
        var userId = routine.get("user");
        var timeParts = schedule.time.split(":");
        var startHour = parseInt(timeParts[0], 10);
        var startMinute = parseInt(timeParts[1], 10);
        var currentTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, startMinute, 0);

        for (var stepIdx = 0; stepIdx < steps.length; stepIdx++) {
            var step = steps[stepIdx];
            var dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
            var dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

            var existing;
            try {
                existing = $app.findRecordsByFilter("events",
                    "routine_template = {:rid} && routine_step_index = {:idx} && start_time >= {:start} && start_time <= {:end}",
                    "", 1, 0,
                    { rid: routineId, idx: stepIdx, start: dayStart.toISOString(), end: dayEnd.toISOString() }
                );
            } catch (err) {
                existing = [];
            }

            if (existing && existing.length > 0) {
                currentTime = new Date(currentTime.getTime() + (step.duration_minutes || 15) * 60000);
                continue;
            }

            var endTime = new Date(currentTime.getTime() + (step.duration_minutes || 15) * 60000);

            try {
                var collection = $app.findCollectionByNameOrId("events");
                var record = new Record(collection);
                record.set("user", userId);
                record.set("title", step.title);
                record.set("start_time", currentTime.toISOString());
                record.set("end_time", endTime.toISOString());
                record.set("is_all_day", false);
                record.set("is_task", true);
                record.set("icon", step.icon || routine.get("icon") || "");
                record.set("color_override", routine.get("color") || "");
                record.set("routine_template", routineId);
                record.set("routine_step_index", stepIdx);
                record.set("energy_level", step.energy_level || "medium");
                record.set("reminders", JSON.stringify([]));
                if (step.category) {
                    record.set("category", step.category);
                }
                $app.save(record);
            } catch (err) {
                console.log("[routine-gen] Failed to create event for step " + stepIdx + ": " + err);
            }

            currentTime = endTime;
        }
    },

    generateAllRoutineEvents: function() {
        var routines;
        try {
            routines = $app.findRecordsByFilter("routine_templates", "is_active = true", "", 100, 0);
        } catch (err) {
            return;
        }
        if (!routines || routines.length === 0) return;

        var today = new Date();
        var tomorrow = new Date(today.getTime() + 86400000);

        var self = this;
        for (var i = 0; i < routines.length; i++) {
            self.generateEventsForRoutine(routines[i], today);
            self.generateEventsForRoutine(routines[i], tomorrow);
        }
    },

    // ─────────────────────────────────────────────────────────────────
    // External-event reminders
    // ─────────────────────────────────────────────────────────────────

    scheduleExternalReminder: function(externalEvent) {
        var subscriptionId = externalEvent.get("subscription");
        var icalUid = externalEvent.get("uid");
        var userId = externalEvent.get("user");
        var startTime = externalEvent.get("start_time");
        if (!subscriptionId || !icalUid || !startTime) return;

        var subscription;
        try {
            subscription = $app.findRecordById("calendar_subscriptions", subscriptionId);
        } catch (err) {
            return;
        }
        if (!subscription.get("reminders_enabled")) return;

        var defaultMinutes = subscription.get("default_reminder_minutes");
        if (defaultMinutes === undefined || defaultMinutes === null || defaultMinutes === "") {
            defaultMinutes = 15;
        }

        // Look up override
        var minutesBefore = defaultMinutes;
        var disabled = false;
        try {
            var overrides = $app.findRecordsByFilter(
                "external_event_reminders",
                "subscription = {:sub} && ical_uid = {:uid}",
                "", 1, 0,
                { sub: subscriptionId, uid: icalUid }
            );
            if (overrides && overrides.length > 0) {
                var override = overrides[0];
                if (override.get("disabled")) {
                    disabled = true;
                } else {
                    var mb = override.get("minutes_before");
                    if (mb !== undefined && mb !== null && mb !== "") {
                        minutesBefore = mb;
                    }
                }
            }
        } catch (err) {
            // No override — use default
        }

        // Clean up any unsent scheduled rows for this (subscription, uid)
        try {
            var stale = $app.findAllRecords("external_scheduled_reminders", $dbx.and(
                $dbx.hashExp({ "subscription": subscriptionId, "ical_uid": icalUid }),
                $dbx.newExp("sent_at = '' OR sent_at IS NULL")
            ));
            for (var i = 0; i < stale.length; i++) {
                try { $app.delete(stale[i]); } catch (e) { /* ignore */ }
            }
        } catch (err) {
            // Nothing to clean up
        }

        if (disabled) return;

        var eventTime = new Date(startTime);
        var scheduledFor = new Date(eventTime.getTime() - (minutesBefore * 60 * 1000));
        if (scheduledFor <= new Date()) return;

        try {
            var collection = $app.findCollectionByNameOrId("external_scheduled_reminders");
            var record = new Record(collection);
            record.set("user", userId);
            record.set("subscription", subscriptionId);
            record.set("ical_uid", icalUid);
            record.set("scheduled_for", scheduledFor.toISOString());
            record.set("reminder_type", "notification");
            $app.save(record);
            console.log("[ext-rem] scheduled reminder for '" + externalEvent.get("title") + "' at " + scheduledFor.toISOString());
        } catch (err) {
            console.log("[ext-rem] failed to schedule:", err);
        }
    },

    rescheduleExternalRemindersForSubscription: function(subscriptionId) {
        var self = this;

        // Clear all unsent reminders for the subscription
        try {
            var stale = $app.findAllRecords("external_scheduled_reminders", $dbx.and(
                $dbx.hashExp({ "subscription": subscriptionId }),
                $dbx.newExp("sent_at = '' OR sent_at IS NULL")
            ));
            for (var i = 0; i < stale.length; i++) {
                try { $app.delete(stale[i]); } catch (e) { /* ignore */ }
            }
        } catch (err) {
            // No prior reminders
        }

        // Re-schedule for each upcoming external event
        try {
            var nowISO = new Date().toISOString();
            var events = $app.findRecordsByFilter(
                "external_events",
                "subscription = {:sub} && start_time >= {:now}",
                "", 500, 0,
                { sub: subscriptionId, now: nowISO }
            );
            for (var j = 0; j < events.length; j++) {
                self.scheduleExternalReminder(events[j]);
            }
        } catch (err) {
            console.log("[ext-rem] reschedule for subscription failed:", err);
        }
    },

    rescheduleExternalRemindersForOverride: function(subscriptionId, icalUid) {
        if (!subscriptionId || !icalUid) return;
        var self = this;
        try {
            var events = $app.findRecordsByFilter(
                "external_events",
                "subscription = {:sub} && uid = {:uid}",
                "", 50, 0,
                { sub: subscriptionId, uid: icalUid }
            );
            for (var i = 0; i < events.length; i++) {
                self.scheduleExternalReminder(events[i]);
            }
        } catch (err) {
            console.log("[ext-rem] reschedule for override failed:", err);
        }
    }
};
