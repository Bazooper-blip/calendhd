/// <reference path="../pb_data/types.d.ts" />

// =============================================================================
// TRMNL feed endpoint
//
// GET /api/calendhd/trmnl?days=5[&token=...]
//
// Read-only JSON feed consumed by the TRMNL e-ink dashboard private plugin
// (see trmnl-plugin/ at the repo root). TRMNL's cloud polls this URL on the
// plugin's refresh interval and merges the payload into Liquid templates —
// PocketBase stays the single source of truth, the device only renders.
//
// Auth: if the TRMNL_FEED_TOKEN env var is set, requests must carry it either
// as `Authorization: Bearer <token>` (TRMNL polling headers) or `?token=`.
// When unset the endpoint is open, consistent with the app's security model
// (the network perimeter is the trust boundary — see 005_singleton_init.pb.js).
// Set the token when you punch a hole through an auth proxy (e.g. a Cloudflare
// Access bypass rule for this path) so only TRMNL can use it.
//
// Timezone: all wall-clock times are derived with local Date getters, i.e. the
// PB server's timezone is assumed to be the household's — the same assumption
// the routine generator and ICS parser already make.
//
// Semantics intentionally mirror the app:
//   - events are bucketed by their stored start_time's local day (the app's
//     getEventsForDay does the same; local recurrence_rule is not expanded
//     anywhere, and external iCal recurrences are already materialized into
//     concrete rows by 050_subscription_sync)
//   - current/next mirror the /now screen (timed events only)
//   - day_progress mirrors DayProgress.svelte (waking hours 06:00–22:00)
// =============================================================================

routerAdd("GET", "/api/calendhd/trmnl", function (e) {
    // PB JSVM runs callbacks in an isolated goja runtime — declare constants
    // and require() inside the callback body.
    var helpers = require(`${__hooks}/pb_helpers.js`);

    var SINGLETON_EMAIL = "home@calendhd.local";
    var DEFAULT_EVENT_COLOR = "#7C9885";   // sage — matches calendar.svelte.ts
    var DEFAULT_EXTERNAL_COLOR = "#9A88B5"; // lavender — matches calendar.svelte.ts
    var MAX_EVENTS_PER_DAY = 10;            // keep the polled payload lean

    // ---- optional shared-token auth ----------------------------------------
    var requiredToken = $os.getenv("TRMNL_FEED_TOKEN") || "";
    if (requiredToken) {
        var provided = "";
        var authHeader = e.request.header.get("Authorization") || "";
        if (authHeader.indexOf("Bearer ") === 0) {
            provided = authHeader.substring(7).trim();
        }
        if (!provided) {
            provided = e.request.url.query().get("token") || "";
        }
        if (provided !== requiredToken) {
            return e.json(401, { error: "Invalid or missing feed token" });
        }
    }

    // ---- window ------------------------------------------------------------
    var days = parseInt(e.request.url.query().get("days"), 10);
    if (isNaN(days) || days < 1) days = 5;
    if (days > 14) days = 14;

    var now = new Date();
    var windowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    var windowEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + days - 1, 23, 59, 59);

    // ---- singleton user + settings ------------------------------------------
    var user;
    try {
        user = $app.findAuthRecordByEmail("users", SINGLETON_EMAIL);
    } catch (err) {
        return e.json(503, { error: "Singleton account not initialized yet" });
    }
    var userId = user.id;

    var timeFormat = "24h";
    var locale = "en";
    try {
        var settingsRows = $app.findRecordsByFilter("user_settings", "user = {:uid}", "", 1, 0, { uid: userId });
        if (settingsRows && settingsRows.length > 0) {
            timeFormat = settingsRows[0].getString("time_format") || "24h";
            var loc = settingsRows[0].getString("locale") || "en";
            locale = loc.indexOf("sv") === 0 ? "sv" : "en";
        }
    } catch (err) {
        // No settings yet — defaults are fine.
    }

    // ---- locale tables -------------------------------------------------------
    var L = locale === "sv" ? {
        weekdays: ["Söndag", "Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag"],
        months: ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"],
        today: "Idag", tomorrow: "Imorgon",
        dateLabel: function (d) { return d.getDate() + " " + this.months[d.getMonth()]; }
    } : {
        weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        today: "Today", tomorrow: "Tomorrow",
        dateLabel: function (d) { return this.months[d.getMonth()] + " " + d.getDate(); }
    };

    // ---- formatting helpers --------------------------------------------------
    function pad(n) { return n < 10 ? "0" + n : "" + n; }

    function dateKey(d) {
        return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    }

    function fmtTime(d) {
        if (timeFormat === "12h") {
            var h12 = d.getHours() % 12;
            if (h12 === 0) h12 = 12;
            return h12 + ":" + pad(d.getMinutes()) + (d.getHours() < 12 ? " AM" : " PM");
        }
        return pad(d.getHours()) + ":" + pad(d.getMinutes());
    }

    // "34 min" / "2h 15m" — mirrors formatRelative() on the /now screen
    function fmtRelative(minutes) {
        if (minutes < 1) return locale === "sv" ? "nu" : "now";
        if (minutes < 60) return minutes + " min";
        var h = Math.floor(minutes / 60);
        var m = minutes % 60;
        return m === 0 ? h + "h" : h + "h " + m + "m";
    }

    // PB stores 'YYYY-MM-DD HH:MM:SS.fffZ'; goja Date needs the T separator.
    function parsePbDate(str) {
        if (!str) return null;
        var d = new Date(String(str).replace(" ", "T"));
        return isNaN(d.getTime()) ? null : d;
    }

    // ---- lookup maps -----------------------------------------------------------
    var categoryById = {};
    try {
        var cats = $app.findRecordsByFilter("categories", "user = {:uid}", "", 200, 0, { uid: userId });
        for (var ci = 0; ci < cats.length; ci++) {
            categoryById[cats[ci].id] = {
                name: cats[ci].getString("name"),
                color: cats[ci].getString("color")
            };
        }
    } catch (err) { /* no categories yet */ }

    var subscriptionById = {};
    try {
        var subs = $app.findRecordsByFilter("calendar_subscriptions", "user = {:uid}", "", 200, 0, { uid: userId });
        for (var si = 0; si < subs.length; si++) {
            subscriptionById[subs[si].id] = {
                name: subs[si].getString("name"),
                color: subs[si].getString("color_override")
            };
        }
    } catch (err) { /* no subscriptions yet */ }

    var routineNameById = {};
    try {
        var routines = $app.findRecordsByFilter("routine_templates", "user = {:uid}", "", 200, 0, { uid: userId });
        for (var ri = 0; ri < routines.length; ri++) {
            routineNameById[routines[ri].id] = routines[ri].getString("name");
        }
    } catch (err) { /* no routines yet */ }

    // ---- load events in window ---------------------------------------------
    var filter = "user = {:uid} && start_time >= {:start} && start_time <= {:end}";
    var filterParams = {
        uid: userId,
        start: helpers.pbDateFilter(windowStart),
        end: helpers.pbDateFilter(windowEnd)
    };

    var localRecords = [];
    var externalRecords = [];
    try {
        localRecords = $app.findRecordsByFilter("events", filter, "start_time", 500, 0, filterParams);
    } catch (err) { /* none in window */ }
    try {
        externalRecords = $app.findRecordsByFilter("external_events", filter, "start_time", 500, 0, filterParams);
    } catch (err) { /* none in window */ }

    // ---- normalize to feed events -------------------------------------------
    function localToFeed(rec) {
        var start = parsePbDate(rec.getString("start_time"));
        if (!start) return null;
        var end = parsePbDate(rec.getString("end_time"));
        var isAllDay = rec.getBool("is_all_day");
        var cat = categoryById[rec.getString("category")] || null;
        var routineName = routineNameById[rec.getString("routine_template")] || "";
        var timeStr = isAllDay ? "" : fmtTime(start);
        var endStr = (!isAllDay && end) ? fmtTime(end) : "";
        return {
            title: rec.getString("title"),
            icon: rec.getString("icon"),
            time: timeStr,
            end_time: endStr,
            time_range: endStr ? timeStr + " – " + endStr : timeStr,
            is_all_day: isAllDay,
            is_task: rec.getBool("is_task"),
            done: rec.getString("completed_at") !== "",
            category: cat ? cat.name : "",
            color: rec.getString("color_override") || (cat && cat.color) || DEFAULT_EVENT_COLOR,
            is_external: false,
            source: "",
            routine: routineName,
            energy: rec.getString("energy_level"),
            first_step: rec.getString("first_step"),
            location: "",
            _start: start,
            _end: end
        };
    }

    function externalToFeed(rec) {
        var start = parsePbDate(rec.getString("start_time"));
        if (!start) return null;
        var end = parsePbDate(rec.getString("end_time"));
        var isAllDay = rec.getBool("is_all_day");
        var sub = subscriptionById[rec.getString("subscription")] || null;
        var timeStr = isAllDay ? "" : fmtTime(start);
        var endStr = (!isAllDay && end) ? fmtTime(end) : "";
        return {
            title: rec.getString("title"),
            icon: "",
            time: timeStr,
            end_time: endStr,
            time_range: endStr ? timeStr + " – " + endStr : timeStr,
            is_all_day: isAllDay,
            is_task: false,
            done: false,
            category: "",
            color: (sub && sub.color) || DEFAULT_EXTERNAL_COLOR,
            is_external: true,
            source: sub ? sub.name : "",
            routine: "",
            energy: "",
            first_step: "",
            location: rec.getString("location"),
            _start: start,
            _end: end
        };
    }

    var all = [];
    for (var li = 0; li < localRecords.length; li++) {
        var fe = localToFeed(localRecords[li]);
        if (fe) all.push(fe);
    }
    for (var xi = 0; xi < externalRecords.length; xi++) {
        var xe = externalToFeed(externalRecords[xi]);
        if (xe) all.push(xe);
    }
    all.sort(function (a, b) { return a._start.getTime() - b._start.getTime(); });

    // ---- bucket by local day --------------------------------------------------
    var dayList = [];
    var dayByKey = {};
    for (var d = 0; d < days; d++) {
        var dayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d);
        var label = d === 0 ? L.today : (d === 1 ? L.tomorrow : L.weekdays[dayDate.getDay()]);
        var bucket = {
            date: dateKey(dayDate),
            label: label,
            weekday: L.weekdays[dayDate.getDay()],
            date_label: L.dateLabel(dayDate),
            is_today: d === 0,
            all_day: [],
            events: [],
            event_count: 0,
            more_count: 0
        };
        dayList.push(bucket);
        dayByKey[bucket.date] = bucket;
    }

    var todayKey = dateKey(now);
    var tasksTotalToday = 0;
    var tasksDoneToday = 0;

    for (var ai = 0; ai < all.length; ai++) {
        var ev = all[ai];
        var key = dateKey(ev._start);
        var day = dayByKey[key];
        if (!day) continue; // starts outside the window (clock skew safety)

        if (key === todayKey && ev.is_task) {
            tasksTotalToday++;
            if (ev.done) tasksDoneToday++;
        }

        day.event_count++;
        var target = ev.is_all_day ? day.all_day : day.events;
        if (day.all_day.length + day.events.length < MAX_EVENTS_PER_DAY) {
            target.push(ev);
        } else {
            day.more_count++;
        }
    }

    // ---- current / next (mirrors the /now screen) ----------------------------
    var currentEvent = null;
    var nextEvent = null;

    for (var ti = 0; ti < all.length; ti++) {
        var t = all[ti];
        if (t.is_all_day) continue;
        var sameDay = dateKey(t._start) === todayKey;
        if (!currentEvent && sameDay && t._start <= now && t._end && now < t._end) {
            var minutesLeft = Math.floor((t._end.getTime() - now.getTime()) / 60000);
            currentEvent = t;
            currentEvent.minutes_left = minutesLeft;
            currentEvent.left_label = fmtRelative(minutesLeft);
        } else if (!nextEvent && t._start > now) {
            var minutesUntil = Math.floor((t._start.getTime() - now.getTime()) / 60000);
            nextEvent = t;
            nextEvent.minutes_until = minutesUntil;
            nextEvent.in_label = fmtRelative(minutesUntil);
            nextEvent.day_label = (dayByKey[dateKey(t._start)] || { label: "" }).label;
        }
    }

    // ---- day progress (waking hours 06:00–22:00, mirrors DayProgress.svelte) --
    var currentMinutes = now.getHours() * 60 + now.getMinutes();
    var dayProgress = 0;
    if (currentMinutes >= 22 * 60) {
        dayProgress = 100;
    } else if (currentMinutes > 6 * 60) {
        dayProgress = Math.round(((currentMinutes - 6 * 60) / (16 * 60)) * 100);
    }

    // Strip internal Date fields before serializing.
    for (var ki = 0; ki < all.length; ki++) {
        delete all[ki]._start;
        delete all[ki]._end;
    }

    return e.json(200, {
        generated_at: dateKey(now) + " " + fmtTime(now),
        today: todayKey,
        today_label: (locale === "sv")
            ? L.weekdays[now.getDay()] + " " + L.dateLabel(now)
            : L.weekdays[now.getDay()] + ", " + L.dateLabel(now),
        now_label: fmtTime(now),
        time_format: timeFormat,
        locale: locale,
        day_progress: dayProgress,
        tasks_total_today: tasksTotalToday,
        tasks_done_today: tasksDoneToday,
        current_event: currentEvent,
        next_event: nextEvent,
        days: dayList
    });
});
