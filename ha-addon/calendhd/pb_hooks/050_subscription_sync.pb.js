/// <reference path="../pb_data/types.d.ts" />

// POST /api/subscriptions/:id/sync - Sync a calendar subscription
routerAdd("POST", "/api/subscriptions/{id}/sync", function(e) {
    var authRecord = e.auth;
    if (!authRecord) {
        return e.json(401, { error: "Authentication required" });
    }

    var userId = authRecord.id;
    var subscriptionId = e.request.pathValue("id");

    if (!subscriptionId) {
        return e.json(400, { error: "Subscription ID is required" });
    }

    // Get the subscription
    var subscription;
    try {
        subscription = $app.findRecordById("calendar_subscriptions", subscriptionId);
    } catch (err) {
        return e.json(404, { error: "Subscription not found" });
    }

    // Verify ownership
    if (subscription.get("user") !== userId) {
        return e.json(403, { error: "Not authorized to sync this subscription" });
    }

    if (!subscription.get("is_active")) {
        return e.json(400, { success: false, message: "Subscription is not active" });
    }

    // Normalize URL (webcal:// to https://)
    var url = subscription.get("url") || "";
    url = url.replace(/^webcal:\/\//i, "https://");

    // Fetch the ICS feed
    var icsText;
    try {
        var res = $http.send({
            url: url,
            method: "GET",
            headers: {
                "User-Agent": "calenDHD/1.0 (Calendar Sync)",
                "Accept": "text/calendar, application/calendar+xml, application/ics, text/plain"
            },
            timeout: 30
        });

        console.log("[Sync] Fetch status: " + res.statusCode + ", content length: " + (res.raw ? res.raw.length : 0));
        console.log("[Sync] ICS preview: " + (res.raw ? res.raw.substring(0, 200) : "(empty)"));

        if (res.statusCode < 200 || res.statusCode >= 300) {
            updateSubscriptionError(subscription, "Failed to fetch: " + res.statusCode);
            return e.json(502, { error: "Failed to fetch calendar feed: " + res.statusCode });
        }

        icsText = res.raw;
    } catch (err) {
        console.log("[Sync] Fetch error: " + err);
        updateSubscriptionError(subscription, "Fetch error: " + err);
        return e.json(502, { error: "Failed to fetch calendar feed: " + err });
    }

    // Parse the ICS feed
    var parsedEvents;
    try {
        parsedEvents = parseICalFeed(icsText);
        console.log("[Sync] Parsed " + parsedEvents.length + " events from ICS feed");
    } catch (err) {
        console.log("[Sync] Parse error: " + err);
        updateSubscriptionError(subscription, "Parse error: " + err);
        return e.json(400, { error: "Failed to parse calendar feed: " + err });
    }

    // Delete existing events for this subscription
    try {
        var existingEvents = $app.findAllRecords("external_events",
            $dbx.hashExp({ "subscription": subscriptionId })
        );
        for (var i = 0; i < existingEvents.length; i++) {
            $app.delete(existingEvents[i]);
        }
    } catch (err) {
        // Ignore delete errors
    }

    // Create new events
    var createdCount = 0;
    var errors = [];
    var collection = $app.findCollectionByNameOrId("external_events");

    for (var i = 0; i < parsedEvents.length; i++) {
        var event = parsedEvents[i];
        try {
            var record = new Record(collection);
            record.set("user", userId);
            record.set("subscription", subscriptionId);
            record.set("uid", event.uid);
            record.set("title", event.title);
            record.set("description", event.description || "");
            record.set("start_time", event.start_time);
            record.set("end_time", event.end_time || "");
            record.set("is_all_day", event.is_all_day);
            record.set("location", event.location || "");
            $app.save(record);
            createdCount++;
        } catch (err) {
            console.log("[Sync] Error creating event '" + event.title + "': " + err);
            errors.push("Failed to create event '" + event.title + "': " + err);
        }
    }

    // Update subscription with success
    try {
        subscription.set("last_refreshed", new Date().toISOString());
        subscription.set("error_message", errors.length > 0 ? errors.join("; ") : "");
        $app.save(subscription);
    } catch (err) {
        // Ignore update errors
    }

    console.log("[Sync] Complete: created " + createdCount + "/" + parsedEvents.length + " events, errors: " + errors.length);

    return e.json(200, {
        success: true,
        message: "Synced " + createdCount + " events",
        totalParsed: parsedEvents.length,
        created: createdCount,
        errors: errors.length > 0 ? errors : undefined
    });

    // Helper functions

    function updateSubscriptionError(sub, errorMsg) {
        try {
            sub.set("error_message", errorMsg);
            $app.save(sub);
        } catch (err) {
            // Ignore
        }
    }

    function parseICalFeed(icsText) {
        var events = [];

        // Split into VEVENT blocks
        var veventRegex = /BEGIN:VEVENT[\s\S]*?END:VEVENT/g;
        var matches = icsText.match(veventRegex);

        if (!matches) {
            return events;
        }

        // Date range for filtering: 1 year back to 2 years forward
        var now = new Date();
        var rangeStart = new Date(now.getFullYear() - 1, 0, 1);
        var rangeEnd = new Date(now.getFullYear() + 2, 11, 31);

        for (var i = 0; i < matches.length; i++) {
            var vevent = matches[i];

            // Extract properties
            var uid = extractProperty(vevent, "UID") || ("event_" + i);
            var summary = extractProperty(vevent, "SUMMARY") || "Untitled Event";
            var description = extractProperty(vevent, "DESCRIPTION");
            var location = extractProperty(vevent, "LOCATION");
            var dtstartInfo = extractPropertyWithParams(vevent, "DTSTART");
            var dtstart = dtstartInfo ? dtstartInfo.value : null;
            var dtend = extractProperty(vevent, "DTEND");

            if (!dtstart) continue;

            // Parse dates
            var startDate = parseICalDate(dtstart);
            var endDate = dtend ? parseICalDate(dtend) : null;
            // Check VALUE=DATE in the parameter portion, not the value
            var isAllDay = (dtstartInfo && dtstartInfo.params.indexOf("VALUE=DATE") !== -1) ||
                          (dtstart.length === 8 || /^\d{8}$/.test(dtstart));

            if (!startDate) continue;

            // Filter by date range
            if (startDate < rangeStart || startDate > rangeEnd) {
                continue;
            }

            events.push({
                uid: uid,
                title: unescapeICalText(summary),
                description: description ? unescapeICalText(description) : null,
                start_time: startDate.toISOString(),
                end_time: endDate ? endDate.toISOString() : null,
                is_all_day: isAllDay,
                location: location ? unescapeICalText(location) : null
            });
        }

        return events;
    }

    function extractProperty(vevent, propName) {
        // Handle folded lines (lines starting with space are continuations)
        var unfolded = vevent.replace(/\r?\n[ \t]/g, "");

        // Match property line, capturing everything after the property name
        var regex = new RegExp("^(" + propName + "(?:;[^\\r\\n]*)?):(.*?)\\s*$", "mi");
        var match = unfolded.match(regex);

        if (match) {
            return match[2].trim();
        }
        return null;
    }

    function extractPropertyWithParams(vevent, propName) {
        // Like extractProperty but returns {params, value} for checking parameters like VALUE=DATE
        var unfolded = vevent.replace(/\r?\n[ \t]/g, "");

        var regex = new RegExp("^(" + propName + "(?:;[^\\r\\n]*)?):(.*?)\\s*$", "mi");
        var match = unfolded.match(regex);

        if (match) {
            return { params: match[1], value: match[2].trim() };
        }
        return null;
    }

    function parseICalDate(dateStr) {
        if (!dateStr) return null;

        // Remove any parameters prefix (already handled by extractProperty returning just the value)
        // Handle formats:
        // - 20240315 (date only)
        // - 20240315T120000 (local datetime)
        // - 20240315T120000Z (UTC datetime)
        // - 20240315T120000+0100 (datetime with timezone offset)

        try {
            // Clean the string
            dateStr = dateStr.trim();

            // Date only (all-day events): YYYYMMDD
            if (/^\d{8}$/.test(dateStr)) {
                var year = parseInt(dateStr.substring(0, 4), 10);
                var month = parseInt(dateStr.substring(4, 6), 10) - 1;
                var day = parseInt(dateStr.substring(6, 8), 10);
                return new Date(year, month, day);
            }

            // DateTime with potential timezone: YYYYMMDDTHHMMSS[Z]
            var dtMatch = dateStr.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
            if (dtMatch) {
                var year = parseInt(dtMatch[1], 10);
                var month = parseInt(dtMatch[2], 10) - 1;
                var day = parseInt(dtMatch[3], 10);
                var hour = parseInt(dtMatch[4], 10);
                var minute = parseInt(dtMatch[5], 10);
                var second = parseInt(dtMatch[6], 10);
                var isUTC = dtMatch[7] === "Z";

                if (isUTC) {
                    return new Date(Date.UTC(year, month, day, hour, minute, second));
                } else {
                    return new Date(year, month, day, hour, minute, second);
                }
            }

            // Fallback: try native Date parsing
            return new Date(dateStr);
        } catch (err) {
            return null;
        }
    }

    function unescapeICalText(text) {
        if (!text) return text;
        return text
            .replace(/\\n/g, "\n")
            .replace(/\\,/g, ",")
            .replace(/\\;/g, ";")
            .replace(/\\\\/g, "\\");
    }
}, $apis.requireAuth());

// Cron job: auto-sync subscriptions based on refresh interval
cronAdd("subscription_sync", "*/15 * * * *", function() {
    var now = new Date();

    // Find subscriptions that are due for refresh
    var subscriptions;
    try {
        subscriptions = $app.findAllRecords("calendar_subscriptions",
            $dbx.hashExp({ "is_active": true })
        );
    } catch (err) {
        return;
    }

    for (var i = 0; i < subscriptions.length; i++) {
        var sub = subscriptions[i];
        var lastRefreshed = sub.get("last_refreshed");
        var refreshInterval = sub.get("refresh_interval_minutes") || 60;

        // Check if it's time to refresh
        var shouldRefresh = false;
        if (!lastRefreshed) {
            shouldRefresh = true;
        } else {
            var lastRefreshTime = new Date(lastRefreshed);
            var nextRefreshTime = new Date(lastRefreshTime.getTime() + refreshInterval * 60 * 1000);
            shouldRefresh = now >= nextRefreshTime;
        }

        if (shouldRefresh) {
            console.log("Auto-syncing subscription: " + sub.get("name"));
            syncSubscription(sub);
        }
    }

    function syncSubscription(subscription) {
        var userId = subscription.get("user");
        var subscriptionId = subscription.id;

        // Normalize URL
        var url = subscription.get("url") || "";
        url = url.replace(/^webcal:\/\//i, "https://");

        // Fetch the ICS feed
        var icsText;
        try {
            var res = $http.send({
                url: url,
                method: "GET",
                headers: {
                    "User-Agent": "calenDHD/1.0 (Calendar Sync)",
                    "Accept": "text/calendar, application/calendar+xml, application/ics, text/plain"
                },
                timeout: 30
            });

            if (res.statusCode < 200 || res.statusCode >= 300) {
                updateError(subscription, "Failed to fetch: " + res.statusCode);
                return;
            }

            icsText = res.raw;
        } catch (err) {
            updateError(subscription, "Fetch error: " + err);
            return;
        }

        // Parse the ICS feed
        var parsedEvents;
        try {
            parsedEvents = parseICalFeedSimple(icsText);
        } catch (err) {
            updateError(subscription, "Parse error: " + err);
            return;
        }

        // Delete existing events for this subscription
        try {
            var existingEvents = $app.findAllRecords("external_events",
                $dbx.hashExp({ "subscription": subscriptionId })
            );
            for (var j = 0; j < existingEvents.length; j++) {
                $app.delete(existingEvents[j]);
            }
        } catch (err) {
            // Ignore
        }

        // Create new events
        var collection = $app.findCollectionByNameOrId("external_events");
        var createdCount = 0;

        for (var j = 0; j < parsedEvents.length; j++) {
            var event = parsedEvents[j];
            try {
                var record = new Record(collection);
                record.set("user", userId);
                record.set("subscription", subscriptionId);
                record.set("uid", event.uid);
                record.set("title", event.title);
                record.set("description", event.description || "");
                record.set("start_time", event.start_time);
                record.set("end_time", event.end_time || "");
                record.set("is_all_day", event.is_all_day);
                record.set("location", event.location || "");
                $app.save(record);
                createdCount++;
            } catch (err) {
                // Ignore individual event errors
            }
        }

        // Update subscription
        try {
            subscription.set("last_refreshed", new Date().toISOString());
            subscription.set("error_message", "");
            $app.save(subscription);
        } catch (err) {
            // Ignore
        }

        console.log("Synced " + createdCount + " events for subscription: " + subscription.get("name"));
    }

    function updateError(sub, errorMsg) {
        try {
            sub.set("error_message", errorMsg);
            $app.save(sub);
        } catch (err) {
            // Ignore
        }
    }

    function parseICalFeedSimple(icsText) {
        var events = [];
        var veventRegex = /BEGIN:VEVENT[\s\S]*?END:VEVENT/g;
        var matches = icsText.match(veventRegex);

        if (!matches) return events;

        var now = new Date();
        var rangeStart = new Date(now.getFullYear() - 1, 0, 1);
        var rangeEnd = new Date(now.getFullYear() + 2, 11, 31);

        for (var i = 0; i < matches.length; i++) {
            var vevent = matches[i];
            var unfolded = vevent.replace(/\r?\n[ \t]/g, "");

            var uid = extractProp(unfolded, "UID") || ("event_" + i);
            var summary = extractProp(unfolded, "SUMMARY") || "Untitled Event";
            var description = extractProp(unfolded, "DESCRIPTION");
            var location = extractProp(unfolded, "LOCATION");
            var dtstartInfo = extractPropWithParams(unfolded, "DTSTART");
            var dtstart = dtstartInfo ? dtstartInfo.value : null;
            var dtend = extractProp(unfolded, "DTEND");

            if (!dtstart) continue;

            var startDate = parseDate(dtstart);
            var endDate = dtend ? parseDate(dtend) : null;
            var isAllDay = (dtstartInfo && dtstartInfo.params.indexOf("VALUE=DATE") !== -1) ||
                          (dtstart.length <= 8 || /^\d{8}$/.test(dtstart));

            if (!startDate || startDate < rangeStart || startDate > rangeEnd) continue;

            events.push({
                uid: uid,
                title: unescape(summary),
                description: description ? unescape(description) : null,
                start_time: startDate.toISOString(),
                end_time: endDate ? endDate.toISOString() : null,
                is_all_day: isAllDay,
                location: location ? unescape(location) : null
            });
        }

        return events;
    }

    function extractProp(text, prop) {
        var regex = new RegExp("^(" + prop + "(?:;[^\\r\\n]*)?):(.*?)\\s*$", "mi");
        var match = text.match(regex);
        return match ? match[2].trim() : null;
    }

    function extractPropWithParams(text, prop) {
        var regex = new RegExp("^(" + prop + "(?:;[^\\r\\n]*)?):(.*?)\\s*$", "mi");
        var match = text.match(regex);
        if (match) {
            return { params: match[1], value: match[2].trim() };
        }
        return null;
    }

    function parseDate(str) {
        if (!str) return null;
        str = str.trim();

        if (/^\d{8}$/.test(str)) {
            return new Date(
                parseInt(str.substring(0, 4), 10),
                parseInt(str.substring(4, 6), 10) - 1,
                parseInt(str.substring(6, 8), 10)
            );
        }

        var m = str.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
        if (m) {
            if (m[7] === "Z") {
                return new Date(Date.UTC(
                    parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10),
                    parseInt(m[4], 10), parseInt(m[5], 10), parseInt(m[6], 10)
                ));
            }
            return new Date(
                parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10),
                parseInt(m[4], 10), parseInt(m[5], 10), parseInt(m[6], 10)
            );
        }

        return new Date(str);
    }

    function unescape(text) {
        if (!text) return text;
        return text.replace(/\\n/g, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
    }
});
