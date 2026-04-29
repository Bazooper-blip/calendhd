/// <reference path="../pb_data/types.d.ts" />

// Cron job: clean up old sent reminders daily at 3 AM
cronAdd("reminder_cleanup", "0 3 * * *", function() {
    // Delete sent reminders older than 30 days
    var thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    var cutoff = thirtyDaysAgo.toISOString();

    try {
        var oldReminders = $app.findAllRecords("scheduled_reminders", $dbx.and(
            $dbx.newExp("sent_at != '' AND sent_at IS NOT NULL"),
            $dbx.newExp("sent_at <= {:cutoff}", { cutoff: cutoff })
        ));

        if (oldReminders && oldReminders.length > 0) {
            for (var i = 0; i < oldReminders.length; i++) {
                $app.delete(oldReminders[i]);
            }
            console.log("Cleaned up " + oldReminders.length + " old sent reminders");
        }
    } catch (err) {
        // No old reminders found or error
        console.log("Reminder cleanup:", err);
    }
});
