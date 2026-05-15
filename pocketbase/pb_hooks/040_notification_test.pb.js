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

// POST /api/calendhd/test-notification - Send a test push notification to
// every device the user has subscribed.
routerAdd("POST", "/api/calendhd/test-notification", function(e) {
    var authRecord = e.auth;
    if (!authRecord) {
        return e.json(401, { error: "Authentication required" });
    }

    var userId = authRecord.id;

    var helpers = require(`${__hooks}/pb_helpers.js`);
    var result = helpers.sendPushToAllDevices(
        userId,
        "calenDHD Test",
        "Push notifications are working!",
        "test"
    );

    if (result.sent === 0 && result.failed === 0) {
        return e.json(400, { error: "No devices subscribed. Please enable push notifications first." });
    }

    if (result.sent > 0 && result.failed === 0) {
        return e.json(200, { success: true, sent: result.sent });
    }

    if (result.sent > 0) {
        // Mixed: some succeeded, some failed (probably stale subs we just pruned).
        return e.json(200, { success: true, sent: result.sent, failed: result.failed });
    }

    return e.json(200, {
        success: false,
        error: "All " + result.failed + " device(s) failed",
        failed: result.failed
    });
}, $apis.requireAuth());
