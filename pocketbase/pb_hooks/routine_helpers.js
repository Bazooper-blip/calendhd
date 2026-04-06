// Shared helpers for routine event generation (loaded via require() inside hooks)

// PB JSVM returns JSON fields as byte arrays from record.get().
// This helper converts them to parsed objects.
function parseJsonField(value) {
    if (!value) return null;
    if (typeof value === "string") {
        try { return JSON.parse(value); } catch (e) { return null; }
    }
    // Already a proper object with expected properties
    if (typeof value === "object" && !Array.isArray(value)) return value;
    // Byte array: array of numbers representing ASCII/UTF-8 chars
    if (Array.isArray(value) || (typeof value === "object" && typeof value.length === "number")) {
        try {
            var str = String.fromCharCode.apply(null, value);
            return JSON.parse(str);
        } catch (e) { return null; }
    }
    return value;
}

module.exports = {
    generateEventsForRoutine: function(routine) {
        var schedule = parseJsonField(routine.get("schedule"));
        if (!schedule || !schedule.days || !schedule.time) return;

        var now = new Date();
        var dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
        var todayName = dayNames[now.getDay()];

        if (schedule.days.indexOf(todayName) === -1) return;

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
            var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
            var todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

            var existing;
            try {
                existing = $app.findRecordsByFilter("events",
                    "routine_template = {:rid} && routine_step_index = {:idx} && start_time >= {:start} && start_time <= {:end}",
                    "", 1, 0,
                    { rid: routineId, idx: stepIdx, start: todayStart.toISOString(), end: todayEnd.toISOString() }
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

        var self = this;
        for (var i = 0; i < routines.length; i++) {
            self.generateEventsForRoutine(routines[i]);
        }
    }
};
