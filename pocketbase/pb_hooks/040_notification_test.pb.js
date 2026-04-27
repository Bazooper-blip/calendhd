/// <reference path="../pb_data/types.d.ts" />

// GET /api/calendhd/vapid-public-key - Get VAPID public key for Web Push subscription
routerAdd("GET", "/api/calendhd/vapid-public-key", function(e) {
    // PB JSVM runs callbacks in an isolated goja runtime — read env vars inside.
    var PUSH_SERVICE_URL = $os.getenv("PUSH_SERVICE_URL") || "http://localhost:3001";

    try {
        var res = $http.send({
            url: PUSH_SERVICE_URL + "/vapid-public-key",
            method: "GET",
            timeout: 5
        });

        if (res.statusCode === 200) {
            var data = res.json;
            return e.json(200, { publicKey: data.publicKey });
        } else {
            return e.json(500, { error: "Failed to get VAPID key from push service" });
        }
    } catch (err) {
        console.log("Failed to connect to push service:", err);
        return e.json(500, { error: "Push service not available" });
    }
});

// POST /api/calendhd/test-notification - Send a test push notification
routerAdd("POST", "/api/calendhd/test-notification", function(e) {
    // PB JSVM runs callbacks in an isolated goja runtime — read env vars inside.
    var PUSH_SERVICE_URL = $os.getenv("PUSH_SERVICE_URL") || "http://localhost:3001";

    var authRecord = e.auth;
    if (!authRecord) {
        return e.json(401, { error: "Authentication required" });
    }

    var userId = authRecord.id;

    // Load user settings
    var userSettings;
    try {
        var settingsRecords = $app.findAllRecords("user_settings", $dbx.hashExp({ "user": userId }));
        userSettings = settingsRecords.length > 0 ? settingsRecords[0] : null;
    } catch (err) {
        return e.json(400, { error: "Could not load user settings" });
    }

    if (!userSettings) {
        return e.json(400, { error: "No user settings found. Please save your settings first." });
    }

    // PB JSVM returns json fields as byte arrays — use the shared decoder.
    var helpers = require(`${__hooks}/routine_helpers.js`);
    var pushSubscription = helpers.parseJsonField(userSettings.get("push_subscription"));

    if (!pushSubscription) {
        return e.json(400, { error: "No push subscription found. Please enable push notifications first." });
    }
    if (!pushSubscription.endpoint || !pushSubscription.keys) {
        return e.json(400, { error: "Invalid push subscription - missing endpoint or keys" });
    }

    // Send test notification via push service
    try {
        var res = $http.send({
            url: PUSH_SERVICE_URL + "/send",
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                subscription: pushSubscription,
                payload: {
                    title: "calenDHD Test",
                    body: "Push notifications are working!",
                    tag: "calendhd-test",
                    data: {}
                }
            }),
            timeout: 10
        });

        if (res.statusCode === 200) {
            return e.json(200, { success: true });
        } else {
            var errorData = res.json || {};
            return e.json(200, {
                success: false,
                error: errorData.error || "Failed to send push notification"
            });
        }
    } catch (err) {
        console.log("Failed to send test notification:", err);
        return e.json(200, {
            success: false,
            error: "Push service error: " + err
        });
    }
}, $apis.requireAuth());
