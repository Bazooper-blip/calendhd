/// <reference path="../pb_data/types.d.ts" />

// =============================================================================
// Singleton-account bootstrap
//
// calenDHD is a single-household app. Every browser auto-logs in as
// `home@calendhd.local`. This hook owns the credentials for that account.
//
// Security model: the network perimeter (Cloudflare Access, LAN, reverse proxy
// auth, etc.) is the trust boundary. Anyone who can reach this URL has full
// access to the calendar — that is intentional. Earlier versions of the app
// hardcoded a constant password in the frontend bundle; this hook replaces
// that with a per-deployment random password loaded from the SINGLETON_PASSWORD
// env var (set by the addon init script), so the static bundle no longer
// contains credentials and password rotation = restart.
// =============================================================================

// On app bootstrap: ensure the singleton user exists, with a password matching
// SINGLETON_PASSWORD. If the env-provided password differs from what's stored,
// rotate it — this transparently retires the old hardcoded password.
onBootstrap((e) => {
    e.next();

    // PB JSVM runs callbacks in an isolated goja runtime — declare constants inside.
    const SINGLETON_EMAIL = "home@calendhd.local";
    const SINGLETON_NAME = "Home";
    const DEV_FALLBACK_PASSWORD = "calendhd-dev-only";

    const password = $os.getenv("SINGLETON_PASSWORD") || DEV_FALLBACK_PASSWORD;

    let user;
    try {
        user = $app.findAuthRecordByEmail("users", SINGLETON_EMAIL);
    } catch (err) {
        try {
            const collection = $app.findCollectionByNameOrId("users");
            const record = new Record(collection);
            record.set("email", SINGLETON_EMAIL);
            record.set("name", SINGLETON_NAME);
            record.set("emailVisibility", false);
            record.set("verified", true);
            record.setPassword(password);
            $app.save(record);
            console.log("[singleton] created singleton user");
        } catch (saveErr) {
            console.log("[singleton] failed to create singleton user:", saveErr);
        }
        return;
    }

    if (!user.validatePassword(password)) {
        try {
            user.setPassword(password);
            $app.save(user);
            console.log("[singleton] rotated singleton password");
        } catch (rotErr) {
            console.log("[singleton] failed to rotate password:", rotErr);
        }
    }
});

// GET /api/calendhd/bootstrap — return the singleton credentials.
//
// Same-origin by default (no CORS configured), so a different origin's JS
// cannot read the response. The real protection is the perimeter that fronts
// this addon; this endpoint is just a way to keep the password out of the
// shipped bundle and let it rotate on every deployment.
routerAdd("GET", "/api/calendhd/bootstrap", function(e) {
    // PB JSVM runs callbacks in an isolated goja runtime — declare constants inside.
    const SINGLETON_EMAIL = "home@calendhd.local";
    const DEV_FALLBACK_PASSWORD = "calendhd-dev-only";

    const password = $os.getenv("SINGLETON_PASSWORD") || DEV_FALLBACK_PASSWORD;
    return e.json(200, {
        email: SINGLETON_EMAIL,
        password: password
    });
});
