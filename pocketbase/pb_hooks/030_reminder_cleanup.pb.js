/// <reference path="../pb_data/types.d.ts" />

// Cron job: clean up old sent reminders daily at 3 AM
cronAdd("reminder_cleanup", "0 3 * * *", function() {
    // Delete sent reminders older than 30 days
    var thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    // PB stores datetimes with a space separator; lexical SQL compare against a
    // T-separator string is off by ~1 day. See note in 020_reminder_cron.pb.js.
    var cutoff = thirtyDaysAgo.toISOString().replace("T", " ");

    try {
        var oldReminders = $app.findAllRecords("scheduled_reminders", $dbx.and(
            $dbx.exp("sent_at != '' AND sent_at IS NOT NULL"),
            $dbx.exp("sent_at <= {:cutoff}", { cutoff: cutoff })
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
