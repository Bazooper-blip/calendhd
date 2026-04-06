/// <reference path="../pb_data/types.d.ts" />

// Daily cron: generate events from active routine templates
cronAdd("routine_generator", "0 4 * * *", () => {
    const helpers = require(`${__hooks}/routine_helpers.js`);
    helpers.generateAllRoutineEvents();
});

// Generate on routine create
onRecordAfterCreateSuccess("routine_templates", (e) => {
    const helpers = require(`${__hooks}/routine_helpers.js`);
    const routine = e.record;
    if (routine.get("is_active")) {
        helpers.generateEventsForRoutine(routine);
    }
});

// Generate on routine update
onRecordAfterUpdateSuccess("routine_templates", (e) => {
    const helpers = require(`${__hooks}/routine_helpers.js`);
    const routine = e.record;
    if (routine.get("is_active")) {
        helpers.generateEventsForRoutine(routine);
    }
});

// Cascade delete: remove generated events when routine is deleted
onRecordAfterDeleteSuccess("routine_templates", (e) => {
    const routineId = e.record.id;
    try {
        const events = $app.findRecordsByFilter("events", "routine_template = {:rid}", "", 100, 0, { rid: routineId });
        for (let i = 0; i < events.length; i++) {
            try { $app.delete(events[i]); } catch (err) { /* ignore */ }
        }
    } catch (err) { /* No events to delete */ }
});
