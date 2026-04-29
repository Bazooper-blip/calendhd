/// <reference path="../pb_data/types.d.ts" />

// Daily cron: generate events from active routine templates (today + tomorrow)
cronAdd("routine_generator", "0 4 * * *", () => {
    const helpers = require(`${__hooks}/pb_helpers.js`);
    helpers.generateAllRoutineEvents();
});

// Generate on routine create (today + tomorrow)
onRecordAfterCreateSuccess("routine_templates", (e) => {
    const helpers = require(`${__hooks}/pb_helpers.js`);
    const routine = e.record;
    if (routine.get("is_active")) {
        const today = new Date();
        const tomorrow = new Date(today.getTime() + 86400000);
        helpers.generateEventsForRoutine(routine, today);
        helpers.generateEventsForRoutine(routine, tomorrow);
    }
});

// Delete + regenerate on routine update (today + tomorrow)
onRecordAfterUpdateSuccess("routine_templates", (e) => {
    const helpers = require(`${__hooks}/pb_helpers.js`);
    const routine = e.record;
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 86400000);

    // Clean slate: delete all events for today and tomorrow
    helpers.deleteRoutineEventsForDate(routine.id, today);
    helpers.deleteRoutineEventsForDate(routine.id, tomorrow);

    // Regenerate if active
    if (routine.get("is_active")) {
        helpers.generateEventsForRoutine(routine, today);
        helpers.generateEventsForRoutine(routine, tomorrow);
    }
});

// Cascade delete: remove all generated events when routine is deleted
onRecordAfterDeleteSuccess("routine_templates", (e) => {
    const routineId = e.record.id;
    try {
        const events = $app.findRecordsByFilter("events", "routine_template = {:rid}", "", 100, 0, { rid: routineId });
        for (let i = 0; i < events.length; i++) {
            try { $app.delete(events[i]); } catch (err) { /* ignore */ }
        }
    } catch (err) { /* No events to delete */ }
});
