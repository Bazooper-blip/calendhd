/// <reference path="../pb_data/types.d.ts" />

// Daily cron: generate events from active routine templates
cronAdd("routine_generator", "0 4 * * *", function() {
    generateRoutineEvents();
});

// Also generate on routine create/update (so events appear immediately)
onRecordAfterCreateSuccess("routine_templates", function(e) {
    var routine = e.record;
    if (routine.get("is_active")) {
        generateEventsForRoutine(routine);
    }
});

onRecordAfterUpdateSuccess("routine_templates", function(e) {
    var routine = e.record;
    if (routine.get("is_active")) {
        generateEventsForRoutine(routine);
    }
});

// Cascade delete: remove generated events when routine is deleted
onRecordAfterDeleteSuccess("routine_templates", function(e) {
    var routineId = e.record.id;
    try {
        var events = $app.findAllRecords("events", $dbx.hashExp({
            "routine_template": routineId
        }));
        for (var i = 0; i < events.length; i++) {
            try {
                $app.delete(events[i]);
            } catch (err) {
                console.log("Failed to delete routine event:", err);
            }
        }
        console.log("Deleted " + events.length + " events for routine " + routineId);
    } catch (err) {
        // No events to delete
    }
});

function generateRoutineEvents() {
    var routines;
    try {
        routines = $app.findAllRecords("routine_templates", $dbx.hashExp({
            "is_active": true
        }));
    } catch (err) {
        return; // No active routines
    }

    if (!routines || routines.length === 0) return;

    console.log("Processing " + routines.length + " active routines");

    for (var i = 0; i < routines.length; i++) {
        generateEventsForRoutine(routines[i]);
    }
}

function generateEventsForRoutine(routine) {
    var scheduleRaw = routine.get("schedule");
    if (typeof scheduleRaw === "string") {
        try { scheduleRaw = JSON.parse(scheduleRaw); } catch (err) { return; }
    }
    if (!scheduleRaw || !scheduleRaw.days || !scheduleRaw.time) return;

    // Check if today matches the schedule
    var now = new Date();
    var dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    var todayName = dayNames[now.getDay()];

    if (scheduleRaw.days.indexOf(todayName) === -1) return;

    var stepsRaw = routine.get("steps");
    if (typeof stepsRaw === "string") {
        try { stepsRaw = JSON.parse(stepsRaw); } catch (err) { return; }
    }
    if (!stepsRaw || stepsRaw.length === 0) return;

    var routineId = routine.id;
    var userId = routine.get("user");

    // Parse start time
    var timeParts = scheduleRaw.time.split(":");
    var startHour = parseInt(timeParts[0], 10);
    var startMinute = parseInt(timeParts[1], 10);

    // Build today's date at the routine start time
    var currentTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, startMinute, 0);

    for (var stepIdx = 0; stepIdx < stepsRaw.length; stepIdx++) {
        var step = stepsRaw[stepIdx];

        // Check if event already exists for this routine + step + today
        var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        var todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

        var existing;
        try {
            existing = $app.findAllRecords("events", $dbx.and(
                $dbx.hashExp({ "routine_template": routineId }),
                $dbx.newExp("routine_step_index = {:idx}", { idx: stepIdx }),
                $dbx.newExp("start_time >= {:start}", { start: todayStart.toISOString() }),
                $dbx.newExp("start_time <= {:end}", { end: todayEnd.toISOString() })
            ));
        } catch (err) {
            existing = [];
        }

        if (existing && existing.length > 0) {
            // Event already exists for this step today, skip
            currentTime = new Date(currentTime.getTime() + (step.duration_minutes || 15) * 60000);
            continue;
        }

        // Create the event
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
            console.log("Generated routine event: " + step.title + " at " + currentTime.toISOString());
        } catch (err) {
            console.log("Failed to create routine event for step " + stepIdx + ": " + err);
        }

        currentTime = endTime;
    }
}
