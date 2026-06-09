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

// PB stores datetimes as 'YYYY-MM-DD HH:MM:SS.fffZ' (space separator) but
// Date.toISOString() emits 'YYYY-MM-DDTHH:MM:SS.fffZ' (T separator). SQL
// string compares are byte-wise — ' ' (0x20) < 'T' (0x54) — so passing a
// T-formatted value as a filter parameter against a datetime column excludes
// every same-day row. Always route filter parameters through this helper.
// (Storing via record.set() is safe; PB normalizes T → space on save.)
function pbDateFilter(date) {
    return date.toISOString().replace("T", " ");
}

// Expand an RRULE into concrete { start, end } occurrences within
// [rangeStart, rangeEnd]. Pure function (no $app/$dbx) so it is unit-testable
// under plain Node — see expandRecurrence.test.cjs. When there is no RRULE (or
// the rule's FREQ can't be understood) it returns the single DTSTART instance
// if it falls inside the window, preserving the legacy single-row behavior.
//
// Each occurrence is built from local calendar fields (year/month/day + the
// DTSTART wall-clock time), so the time-of-day and DST behavior of every
// occurrence matches DTSTART — the same timezone assumption the surrounding
// ICS parser already makes (the PB server runs in the calendar's timezone).
function expandRecurrence(rruleStr, startDate, endDate, isAllDay, rangeStart, rangeEnd) {
    function inWindow(d) {
        return !!d && d.getTime() >= rangeStart.getTime() && d.getTime() <= rangeEnd.getTime();
    }
    function singleInstance() {
        return inWindow(startDate) ? [{ start: startDate, end: endDate }] : [];
    }
    if (!rruleStr || !startDate) return singleInstance();

    // --- parse the RRULE into a flat map ---
    var rule = {};
    var parts = String(rruleStr).split(";");
    for (var p = 0; p < parts.length; p++) {
        var kv = parts[p].split("=");
        if (kv.length === 2 && kv[0]) rule[kv[0].toUpperCase().trim()] = kv[1].trim();
    }

    var freq = (rule.FREQ || "").toUpperCase();
    if (["DAILY", "WEEKLY", "MONTHLY", "YEARLY"].indexOf(freq) === -1) return singleInstance();

    var interval = parseInt(rule.INTERVAL, 10);
    if (!interval || interval < 1) interval = 1;
    var count = rule.COUNT ? parseInt(rule.COUNT, 10) : null;

    var DAY = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

    // BYDAY -> [{ nth: int|null, dow: 0-6 }]  (nth handles e.g. -1SU / 3MO)
    var byday = [];
    if (rule.BYDAY) {
        var bd = rule.BYDAY.split(",");
        for (var b = 0; b < bd.length; b++) {
            var bm = bd[b].match(/^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$/i);
            if (bm) byday.push({ nth: bm[1] ? parseInt(bm[1], 10) : null, dow: DAY[bm[2].toUpperCase()] });
        }
    }
    var bymonth = rule.BYMONTH ? rule.BYMONTH.split(",").map(function (x) { return parseInt(x, 10); }) : null;
    var bymonthday = rule.BYMONTHDAY ? rule.BYMONTHDAY.split(",").map(function (x) { return parseInt(x, 10); }) : null;
    var wkst = (rule.WKST && DAY[rule.WKST.toUpperCase()] !== undefined) ? DAY[rule.WKST.toUpperCase()] : 1;
    var until = parseUntil(rule.UNTIL);

    var H = startDate.getHours(), MIN = startDate.getMinutes(), SEC = startDate.getSeconds();
    var durationMs = (endDate && endDate.getTime() > startDate.getTime()) ? (endDate.getTime() - startDate.getTime()) : null;
    var effEnd = (until && until.getTime() < rangeEnd.getTime()) ? until : rangeEnd;

    var MAX_ITERS = 10000;
    var CAP = 1000;
    var out = [];
    var emitted = 0; // counted from series start (for COUNT, which counts pre-window too)
    var stopped = false;

    function mk(y, mo, d) {
        return isAllDay ? new Date(y, mo, d) : new Date(y, mo, d, H, MIN, SEC);
    }
    // Generators below emit in chronological order, so once we pass effEnd we stop.
    function pushOcc(s) {
        if (s.getTime() > effEnd.getTime()) { stopped = true; return false; }
        emitted++;
        if (s.getTime() >= rangeStart.getTime()) {
            out.push({ start: s, end: durationMs != null ? new Date(s.getTime() + durationMs) : null });
            if (out.length >= CAP) { stopped = true; return false; }
        }
        if (count && emitted >= count) { stopped = true; return false; }
        return true;
    }

    function daysInMonth(y, mo) { return new Date(y, mo + 1, 0).getDate(); }
    function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
    function startOfWeek(d) {
        var base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
        return addDays(base, -((base.getDay() - wkst + 7) % 7));
    }
    // nth weekday of a month -> day-of-month (1..31), or null if it doesn't exist
    function nthWeekday(y, mo, dow, nth) {
        var dim = daysInMonth(y, mo);
        if (nth > 0) {
            var first = new Date(y, mo, 1).getDay();
            var day = 1 + ((dow - first + 7) % 7) + (nth - 1) * 7;
            return day <= dim ? day : null;
        }
        var lastDow = new Date(y, mo, dim).getDay();
        var dayN = dim - ((lastDow - dow + 7) % 7) + (nth + 1) * 7;
        return dayN >= 1 ? dayN : null;
    }
    function allWeekdays(y, mo, dow) {
        var dim = daysInMonth(y, mo), res = [];
        for (var d = 1 + ((dow - new Date(y, mo, 1).getDay() + 7) % 7); d <= dim; d += 7) res.push(d);
        return res;
    }
    // Resolve candidate day-of-month values for one MONTHLY/YEARLY period.
    function monthDayCandidates(y, mo) {
        var days = [];
        if (bymonthday) {
            var dim = daysInMonth(y, mo);
            for (var i = 0; i < bymonthday.length; i++) {
                var n = bymonthday[i];
                var day = n > 0 ? n : dim + n + 1; // -1 => last day of month
                if (day >= 1 && day <= dim) days.push(day);
            }
        } else if (byday.length) {
            for (var j = 0; j < byday.length; j++) {
                if (byday[j].nth) {
                    var nd = nthWeekday(y, mo, byday[j].dow, byday[j].nth);
                    if (nd) days.push(nd);
                } else {
                    days = days.concat(allWeekdays(y, mo, byday[j].dow));
                }
            }
        } else {
            days.push(startDate.getDate());
        }
        days.sort(function (a, c) { return a - c; });
        var uniq = [];
        for (var k = 0; k < days.length; k++) if (uniq.indexOf(days[k]) === -1) uniq.push(days[k]);
        return uniq;
    }

    if (freq === "WEEKLY") {
        var dows = byday.length ? byday.map(function (x) { return x.dow; }) : [startDate.getDay()];
        // Some calendar exporters write DTSTART one day off from the BYDAY they
        // also emit (e.g. DTSTART Saturday + BYDAY=FR). Calendars honor BYDAY, so
        // snap a mismatched DTSTART onto the BYDAY weekday within its own week.
        var seriesStart = startDate;
        if (byday.length && dows.indexOf(startDate.getDay()) === -1) {
            var ws0 = startOfWeek(startDate), bestDay = null, bestDiff = Infinity;
            for (var s = 0; s < dows.length; s++) {
                var cand = addDays(ws0, (dows[s] - wkst + 7) % 7);
                var diff = Math.abs(cand.getTime() - startDate.getTime());
                if (diff < bestDiff) { bestDiff = diff; bestDay = cand; }
            }
            seriesStart = mk(bestDay.getFullYear(), bestDay.getMonth(), bestDay.getDate());
        }
        var offs = dows.map(function (x) { return (x - wkst + 7) % 7; }).sort(function (a, c) { return a - c; });
        var weekCursor = startOfWeek(seriesStart), iterW = 0;
        while (!stopped && weekCursor.getTime() <= effEnd.getTime() + 7 * 86400000 && iterW < MAX_ITERS) {
            iterW++;
            for (var o = 0; o < offs.length; o++) {
                var od = addDays(weekCursor, offs[o]);
                var occ = mk(od.getFullYear(), od.getMonth(), od.getDate());
                if (occ.getTime() < seriesStart.getTime()) continue;
                if (!pushOcc(occ)) break;
            }
            weekCursor = addDays(weekCursor, interval * 7);
        }
    } else if (freq === "DAILY") {
        var dc = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()), iterD = 0;
        while (!stopped && iterD < MAX_ITERS) {
            iterD++;
            if (!pushOcc(mk(dc.getFullYear(), dc.getMonth(), dc.getDate()))) break;
            dc = addDays(dc, interval);
            if (dc.getTime() > effEnd.getTime()) break;
        }
    } else if (freq === "MONTHLY") {
        var my = startDate.getFullYear(), mm = startDate.getMonth(), iterM = 0;
        while (!stopped && iterM < MAX_ITERS) {
            iterM++;
            var candM = monthDayCandidates(my, mm);
            for (var c = 0; c < candM.length; c++) {
                var occM = mk(my, mm, candM[c]);
                if (occM.getTime() < startDate.getTime()) continue;
                if (!pushOcc(occM)) break;
            }
            mm += interval;
            while (mm > 11) { mm -= 12; my++; }
            if (new Date(my, mm, 1).getTime() > effEnd.getTime()) break;
        }
    } else { // YEARLY
        var yy = startDate.getFullYear();
        var months = bymonth ? bymonth.map(function (x) { return x - 1; }).sort(function (a, c) { return a - c; }) : [startDate.getMonth()];
        var iterY = 0;
        while (!stopped && iterY < MAX_ITERS) {
            iterY++;
            for (var mi = 0; mi < months.length && !stopped; mi++) {
                var candY = monthDayCandidates(yy, months[mi]);
                for (var c2 = 0; c2 < candY.length; c2++) {
                    var occY = mk(yy, months[mi], candY[c2]);
                    if (occY.getTime() < startDate.getTime()) continue;
                    if (!pushOcc(occY)) break;
                }
            }
            yy += interval;
            if (new Date(yy, 0, 1).getTime() > effEnd.getTime()) break;
        }
    }

    return out;

    function parseUntil(str) {
        if (!str) return null;
        var um = String(str).trim().match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
        if (!um) return null;
        var y = parseInt(um[1], 10), mo = parseInt(um[2], 10) - 1, d = parseInt(um[3], 10);
        if (um[4] === undefined) return new Date(y, mo, d, 23, 59, 59); // date-only UNTIL is inclusive of the day
        var h = parseInt(um[4], 10), mn = parseInt(um[5], 10), sc = parseInt(um[6], 10);
        return um[7] === "Z" ? new Date(Date.UTC(y, mo, d, h, mn, sc)) : new Date(y, mo, d, h, mn, sc);
    }
}

module.exports = {
    parseJsonField: parseJsonField,
    pbDateFilter: pbDateFilter,
    expandRecurrence: expandRecurrence,

    deleteRoutineEventsForDate: function(routineId, targetDate) {
        var dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
        var dayEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59);

        var events;
        try {
            events = $app.findRecordsByFilter("events",
                "routine_template = {:rid} && start_time >= {:start} && start_time <= {:end}",
                "", 100, 0,
                { rid: routineId, start: pbDateFilter(dayStart), end: pbDateFilter(dayEnd) }
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
                    { rid: routineId, idx: stepIdx, start: pbDateFilter(dayStart), end: pbDateFilter(dayEnd) }
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
                $dbx.exp("sent_at = '' OR sent_at IS NULL")
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
                $dbx.exp("sent_at = '' OR sent_at IS NULL")
            ));
            for (var i = 0; i < stale.length; i++) {
                try { $app.delete(stale[i]); } catch (e) { /* ignore */ }
            }
        } catch (err) {
            // No prior reminders
        }

        // Re-schedule for each upcoming external event
        try {
            var events = $app.findRecordsByFilter(
                "external_events",
                "subscription = {:sub} && start_time >= {:now}",
                "", 500, 0,
                { sub: subscriptionId, now: pbDateFilter(new Date()) }
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
    },

    // ─────────────────────────────────────────────────────────────────
    // Multi-device push delivery
    //
    // Looks up every push_subscriptions row for the user and POSTs to the
    // push-service for each. Returns { sent: <count>, failed: <count> }.
    //
    // Dead subscriptions (push-service responds 404 or 410) are deleted —
    // those status codes mean the browser/server has discarded the
    // subscription and no future push will ever succeed for that endpoint.
    // Other failures (5xx, network) are logged and left alone so the row
    // stays available for the next cron tick.
    // ─────────────────────────────────────────────────────────────────
    sendPushToAllDevices: function(userId, title, body, tag) {
        var PUSH_SERVICE_URL = $os.getenv("PUSH_SERVICE_URL") || "http://localhost:3001";

        var subs;
        try {
            subs = $app.findRecordsByFilter(
                "push_subscriptions",
                "user = {:uid}",
                "", 100, 0,
                { uid: userId }
            );
        } catch (err) {
            console.log("[push-fanout] failed to load push_subscriptions: " + err);
            return { sent: 0, failed: 0 };
        }

        if (!subs || subs.length === 0) {
            return { sent: 0, failed: 0 };
        }

        var sent = 0;
        var failed = 0;

        for (var i = 0; i < subs.length; i++) {
            var row = subs[i];
            var endpoint = row.get("endpoint");
            var p256dh = row.get("p256dh");
            var auth = row.get("auth");

            if (!endpoint || !p256dh || !auth) {
                console.log("[push-fanout] skipping malformed row " + row.id);
                failed++;
                continue;
            }

            try {
                var res = $http.send({
                    url: PUSH_SERVICE_URL + "/send",
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        subscription: {
                            endpoint: endpoint,
                            keys: { p256dh: p256dh, auth: auth }
                        },
                        payload: {
                            title: title,
                            body: body,
                            tag: "calendhd-reminder-" + tag,
                            data: { tag: tag }
                        }
                    }),
                    timeout: 10
                });

                if (res.statusCode >= 200 && res.statusCode < 300) {
                    sent++;
                } else if (res.statusCode === 404 || res.statusCode === 410) {
                    // Subscription is dead — prune so the next cron tick is faster.
                    try {
                        $app.delete(row);
                        console.log("[push-fanout] pruned dead subscription " + row.id + " (status " + res.statusCode + ")");
                    } catch (delErr) {
                        console.log("[push-fanout] failed to prune dead subscription " + row.id + ": " + delErr);
                    }
                    failed++;
                } else {
                    console.log("[push-fanout] push failed for " + row.id + " with status " + res.statusCode);
                    failed++;
                }
            } catch (err) {
                console.log("[push-fanout] http error for " + row.id + ": " + err);
                failed++;
            }
        }

        return { sent: sent, failed: failed };
    }
};
