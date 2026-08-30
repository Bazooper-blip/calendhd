/// <reference path="../pb_data/types.d.ts" />

// =============================================================================
// "New event added" push notification
//
// When the household has opted in (user_settings.notify_new_events, added by
// migration 0014, default off), creating a local event fans out a push to
// every subscribed device via helpers.sendPushToAllDevices — so everyone in
// the household sees "New event added: Vet visit · Tue, Aug 11 at 08:30"
// even if someone else added it from their phone.
//
// Deliberately NOT notified:
//   - routine-generated events (routine_template set): the daily routine
//     generator cron would spam a push per step every morning
//   - paused events (is_paused): hidden everywhere until resumed
//   - external_events: 050_subscription_sync wipes and re-creates rows on
//     every sync, so a create-hook there would re-announce the whole feed
//     each cycle (a stable diff would need its own bookkeeping)
//
// Caveat: the singleton account can't tell devices apart, so the device that
// created the event is notified too. That's why the toggle defaults to off.
// =============================================================================

onRecordAfterCreateSuccess(function (e) {
    e.next();
    var event = e.record;

    if (event.getBool("is_paused")) return;
    if (event.getString("routine_template") !== "") return;

    var userId = event.get("user");
    if (!userId) return;

    // PB JSVM: constants and require() must live inside the callback body.
    var helpers = require(`${__hooks}/pb_helpers.js`);

    // Opt-in check + formatting prefs from the household's settings row.
    var enabled = false;
    var timeFormat = "24h";
    var locale = "en";
    try {
        var settingsRows = $app.findRecordsByFilter("user_settings", "user = {:uid}", "", 1, 0, { uid: userId });
        if (settingsRows && settingsRows.length > 0) {
            enabled = settingsRows[0].getBool("notify_new_events");
            timeFormat = settingsRows[0].getString("time_format") || "24h";
            var loc = settingsRows[0].getString("locale") || "en";
            locale = loc.indexOf("sv") === 0 ? "sv" : "en";
        }
    } catch (err) {
        // No settings row yet — feature is opt-in, so stay silent.
    }
    if (!enabled) return;

    var L = locale === "sv" ? {
        title: "Ny händelse tillagd",
        allDay: "Heldag",
        weekdays: ["sön", "mån", "tis", "ons", "tors", "fre", "lör"],
        months: ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"],
        dateLabel: function (d) { return this.weekdays[d.getDay()] + " " + d.getDate() + " " + this.months[d.getMonth()]; },
        at: "kl."
    } : {
        title: "New event added",
        allDay: "All day",
        weekdays: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
        months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        dateLabel: function (d) { return this.weekdays[d.getDay()] + ", " + this.months[d.getMonth()] + " " + d.getDate(); },
        at: "at"
    };

    function pad(n) { return n < 10 ? "0" + n : "" + n; }
    function fmtTime(d) {
        if (timeFormat === "12h") {
            var h12 = d.getHours() % 12;
            if (h12 === 0) h12 = 12;
            return h12 + ":" + pad(d.getMinutes()) + (d.getHours() < 12 ? " AM" : " PM");
        }
        return pad(d.getHours()) + ":" + pad(d.getMinutes());
    }

    var body = event.getString("title") || "Event";
    // PB stores 'YYYY-MM-DD HH:MM:SS.fffZ'; goja Date needs the T separator.
    var startRaw = event.getString("start_time");
    var start = startRaw ? new Date(String(startRaw).replace(" ", "T")) : null;
    if (start && !isNaN(start.getTime())) {
        body += " · " + L.dateLabel(start);
        if (event.getBool("is_all_day")) {
            body += " · " + L.allDay;
        } else {
            body += " " + L.at + " " + fmtTime(start);
        }
    }

    try {
        var result = helpers.sendPushToAllDevices(userId, L.title, body, "new-event-" + event.id);
        console.log("[new-event-notify] '" + event.getString("title") + "': sent=" + result.sent + " failed=" + result.failed);
    } catch (err) {
        console.log("[new-event-notify] push failed: " + err);
    }
}, "events");
