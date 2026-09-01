/// <reference path="../pb_data/types.d.ts" />

// =============================================================================
// TRMNL feed endpoint
//
// GET /api/calendhd/trmnl?days=5[&limit=10][&icons=none][&token=...]
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
//   - events are bucketed by their start's local day (the app's
//     getEventsForDay does the same); local recurrence_rule is expanded into
//     in-window occurrences via helpers.expandLocalRecurrence (mirroring the
//     app's displayEvents), while external iCal recurrences are already
//     materialized into concrete rows by 050_subscription_sync
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
    var DEFAULT_EVENTS_PER_DAY = 10;        // keep the polled payload lean (?limit= overrides)
    var MAX_EVENTS_PER_DAY_CAP = 50;        // hard ceiling for ?limit=

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

    // Per-day event cap. The default suits the original 800×480 TRMNL; the
    // TRMNL X fits more, so the plugin can ask for more via ?limit=.
    var perDayLimit = parseInt(e.request.url.query().get("limit"), 10);
    if (isNaN(perDayLimit) || perDayLimit < 1) perDayLimit = DEFAULT_EVENTS_PER_DAY;
    if (perDayLimit > MAX_EVENTS_PER_DAY_CAP) perDayLimit = MAX_EVENTS_PER_DAY_CAP;

    // Icon handling. Event icons are either an emoji (renders fine on TRMNL —
    // the renderer screenshots real HTML) or a "lucide:<name>" ref only the
    // web app can draw; helpers.textIcon maps those to an emoji equivalent so
    // the device never shows literal "lucide:pill" text. ?icons=none strips
    // icons entirely for renderers without an emoji font.
    var stripIcons = e.request.url.query().get("icons") === "none";
    function feedIcon(raw) {
        return stripIcons ? "" : helpers.textIcon(raw);
    }

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
    var weekStartsOn = 1; // app default (see getDefaultSettings in src/lib/api/pocketbase.ts)
    try {
        var settingsRows = $app.findRecordsByFilter("user_settings", "user = {:uid}", "", 1, 0, { uid: userId });
        if (settingsRows && settingsRows.length > 0) {
            timeFormat = settingsRows[0].getString("time_format") || "24h";
            var loc = settingsRows[0].getString("locale") || "en";
            locale = loc.indexOf("sv") === 0 ? "sv" : "en";
            var wsRaw = parseInt(settingsRows[0].getString("week_starts_on"), 10);
            if (wsRaw === 0 || wsRaw === 1 || wsRaw === 6) weekStartsOn = wsRaw;
        }
    } catch (err) {
        // No settings yet — defaults are fine.
    }

    // ---- locale tables -------------------------------------------------------
    var L = locale === "sv" ? {
        weekdays: ["Söndag", "Måndag", "Tisdag", "Onsdag", "Torsdag", "Fredag", "Lördag"],
        months: ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"],
        today: "Idag", tomorrow: "Imorgon",
        dateLabel: function (d) { return d.getDate() + " " + this.months[d.getMonth()]; },
        // Static template chrome — mirrors src/lib/i18n/locales/sv.json where a
        // matching key exists (time.allDay, calendar.moreEvents).
        strings: {
            now: "NU", next: "NÄSTA",
            all_day: "Heldag",
            no_events: "Inga händelser idag",
            nothing_scheduled: "Inget planerat",
            enjoy_calm: "Njut av lugnet.",
            of: "av", done_today: "klara idag",
            start_with: "Börja med:",
            more: "till",
            today_lower: "idag",
            earlier_today: "Tidigare idag"
        }
    } : {
        weekdays: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
        months: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
        today: "Today", tomorrow: "Tomorrow",
        dateLabel: function (d) { return this.months[d.getMonth()] + " " + d.getDate(); },
        strings: {
            now: "NOW", next: "NEXT",
            all_day: "All day",
            no_events: "No events today",
            nothing_scheduled: "Nothing scheduled",
            enjoy_calm: "Enjoy the calm.",
            of: "of", done_today: "done today",
            start_with: "Start with:",
            more: "more",
            today_lower: "today",
            earlier_today: "Earlier today"
        }
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

    // PB stores 'YYYY-MM-DD HH:MM:SS.fffZ'; goja Date needs the T separator.
    function parsePbDate(str) {
        if (!str) return null;
        var d = new Date(String(str).replace(" ", "T"));
        return isNaN(d.getTime()) ? null : d;
    }

    // "Already over" flag so templates can split today's list into upcoming
    // vs. earlier-today. Mirrors AgendaView.svelte: past means ended (end <=
    // now); events with no end count as ended one minute after start. All-day
    // events are never past on their own day.
    function isPastEvent(start, end, isAllDay) {
        if (isAllDay) return false;
        var endMs = end ? end.getTime() : start.getTime() + 60000;
        return endMs <= now.getTime();
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

    // Paused external events/series, keyed "subscription|base uid" — pause
    // rows store the base uid, so one entry hides a whole recurring series.
    var externalPauseKeys = {};
    try {
        var pauseRows = $app.findRecordsByFilter("external_event_pauses", "user = {:uid}", "", 500, 0, { uid: userId });
        for (var pi = 0; pi < pauseRows.length; pi++) {
            externalPauseKeys[pauseRows[pi].getString("subscription") + "|" + pauseRows[pi].getString("ical_uid")] = true;
        }
    } catch (err) { /* none paused */ }

    // ---- load events in window ---------------------------------------------
    var filter = "user = {:uid} && start_time >= {:start} && start_time <= {:end}";
    // Local recurring events are stored as a single seed row that may start
    // before the window but still produce occurrences inside it (occurrences
    // never precede the seed, so the upper bound stays). Mirrors getEvents()
    // in src/lib/api/pocketbase.ts.
    var localFilter = "user = {:uid} && (start_time >= {:start} || recurrence_rule != null) && start_time <= {:end}";
    var filterParams = {
        uid: userId,
        start: helpers.pbDateFilter(windowStart),
        end: helpers.pbDateFilter(windowEnd)
    };

    var localRecords = [];
    var externalRecords = [];
    try {
        localRecords = $app.findRecordsByFilter("events", localFilter, "start_time", 500, 0, filterParams);
    } catch (err) { /* none in window */ }
    try {
        externalRecords = $app.findRecordsByFilter("external_events", filter, "start_time", 500, 0, filterParams);
    } catch (err) { /* none in window */ }

    // ---- normalize to feed events -------------------------------------------
    // For recurring events the loop below passes per-occurrence overrides
    // (start/end/done); without them the record's own fields are used.
    function localToFeed(rec, occStart, occEnd, occDone) {
        // Mirror the app: paused events are hidden from every view.
        if (rec.getBool("is_paused")) return null;
        var isOccurrence = !!occStart;
        var start = isOccurrence ? occStart : parsePbDate(rec.getString("start_time"));
        if (!start) return null;
        var end = isOccurrence ? occEnd : parsePbDate(rec.getString("end_time"));
        var isAllDay = rec.getBool("is_all_day");
        var cat = categoryById[rec.getString("category")] || null;
        var routineName = routineNameById[rec.getString("routine_template")] || "";
        var timeStr = isAllDay ? "" : fmtTime(start);
        var endStr = (!isAllDay && end) ? fmtTime(end) : "";
        return {
            title: rec.getString("title"),
            icon: feedIcon(rec.getString("icon")),
            time: timeStr,
            end_time: endStr,
            time_range: endStr ? timeStr + " – " + endStr : timeStr,
            is_all_day: isAllDay,
            is_past: isPastEvent(start, end, isAllDay),
            is_task: rec.getBool("is_task"),
            done: isOccurrence ? !!occDone : rec.getString("completed_at") !== "",
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
        // Mirror the app: paused external events/series are hidden everywhere.
        if (externalPauseKeys[rec.getString("subscription") + "|" + helpers.baseIcalUid(rec.getString("uid"))]) {
            return null;
        }
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
            is_past: isPastEvent(start, end, isAllDay),
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
        var rec = localRecords[li];
        var rule = helpers.parseJsonField(rec.get("recurrence_rule"));
        if (rule && rule.frequency) {
            // Expand the seed row into concrete in-window occurrences
            // (mirrors displayEvents in src/lib/stores/calendar.svelte.ts).
            if (rec.getBool("is_paused")) continue;
            var seedStart = parsePbDate(rec.getString("start_time"));
            if (!seedStart) continue;
            var seedEnd = parsePbDate(rec.getString("end_time"));
            // Guard corrupted rows where end precedes start.
            var durMs = seedEnd ? Math.max(0, seedEnd.getTime() - seedStart.getTime()) : 0;
            var completedAt = parsePbDate(rec.getString("completed_at"));
            var occs = helpers.expandLocalRecurrence(rule, seedStart, windowStart, windowEnd);
            for (var oi = 0; oi < occs.length; oi++) {
                var occStart = occs[oi];
                var isSeedOcc = occStart.getTime() === seedStart.getTime();
                var occEnd = isSeedOcc
                    ? seedEnd
                    : (seedEnd && durMs > 0 ? new Date(occStart.getTime() + durMs) : null);
                // Completion is per-day for recurring tasks ("did I do it
                // today?") since one row backs the whole series.
                var occDone = !!completedAt && dateKey(completedAt) === dateKey(occStart);
                var ofe = localToFeed(rec, occStart, occEnd, occDone);
                if (ofe) all.push(ofe);
            }
        } else {
            var fe = localToFeed(rec);
            if (fe) all.push(fe);
        }
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
            more_count: 0,
            // Finished timed events among the listed ones (only ever nonzero
            // for today) so templates know to render the earlier-today divider.
            past_count: 0
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
        if (day.all_day.length + day.events.length < perDayLimit) {
            target.push(ev);
            if (ev.is_past) day.past_count++;
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
            currentEvent = t;
        } else if (!nextEvent && t._start > now) {
            nextEvent = t;
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

    // Week number of the current week (mirrors the app week view header).
    var weekNumber = helpers.weekNumber(now, weekStartsOn);

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
        week_number: weekNumber,
        week_label: (locale === "sv" ? "v." : "W") + weekNumber,
        time_format: timeFormat,
        locale: locale,
        strings: L.strings,
        day_progress: dayProgress,
        tasks_total_today: tasksTotalToday,
        tasks_done_today: tasksDoneToday,
        current_event: currentEvent,
        next_event: nextEvent,
        days: dayList
    });
});
