# Changelog

## [1.3.0] - 2026-04-27

### Added — time-blindness UX

- **"Happening now" highlight**: events and routine blocks whose time range contains the current minute get a sage-green ring and a small pulsing "Now" badge in the title row. Visually answers "what should I be doing right now" at a glance.
- **"Next: …" pill** in the day-view header: shows the upcoming event's icon, truncated title, and time-until ("in 23 min", "in 1h 15m", "tomorrow") when viewing today. Updates as `now` ticks each minute.

The horizontal "now" line on the timeline and auto-scroll-to-current-time on mount were already present; this release builds on those primitives by extending the same `now` rune into the EventBlock / RoutineBlock children.

## [1.2.0] - 2026-04-27

### Security

- Removed the hardcoded singleton-account password from the frontend bundle. The addon init script now generates a per-deployment random password at `/config/calendhd/.singleton-password` (mode 600) and exposes it via the `SINGLETON_PASSWORD` env var. A new `005_singleton_init.pb.js` hook creates the singleton user on bootstrap and rotates its stored password to match. The frontend fetches credentials from a same-origin `GET /api/calendhd/bootstrap` endpoint at login. Documented the perimeter-trust security model in `DOCS.md` and `CLAUDE.md`.

### Fixed

- `event.reminders` (json field) was not being decoded properly in `010_reminder_scheduler.pb.js`, mirroring the push-subscription bug fixed in 1.1.2. Reminders may have been silently dropped when scheduling. Both create and update paths now route through the shared `parseJsonField()` helper.

### Changed

- Renamed `routine_helpers.js` → `pb_helpers.js` and exported `parseJsonField` for use across all hooks. The helper handles all three forms PB JSVM may return for json fields (string, plain object, byte array).

### Tooling

- Added Biome 2.4 for formatting and linting `src/**/*.{ts,js}`. New scripts: `npm run format`, `npm run format:check`, and `npm run lint` now runs Biome + svelte-check. `.svelte` files are not formatted by Biome (partial Svelte 5 support upstream); svelte-check still owns Svelte type/style validation.

## [1.1.3] - 2026-04-27

### Documentation

- Removed stale references to "Household sharing", HA sidebar/ingress, and an in-app sign-up flow — none of which exist. The app is intentionally a single-household calendar with auto-login as `home@calendhd.local`.
- Added Cloudflare Tunnel / NGINX SSL Proxy guidance for HTTPS / remote access (the addon serves plain HTTP on port 8090).
- Clarified that the frontend is baked into the Docker image and copied to `/config/calendhd/pb_public/` on first run; manual file copy is only needed for hot-swapping a newer build.
- Removed the Apple Sign-in / OAuth provider sections from user docs and the corresponding `APPLE_*` env vars from `.env.example` — the app's auto-login flow never exercised any external provider.
- Added a note that contributors building the addon manually must run `./build-for-ha.sh` first to populate the pre-built frontend the Dockerfile expects.

## [1.1.2] - 2026-04-26

### Fixed

- Push notifications now actually deliver. The reminder cron and `/api/calendhd/test-notification` route both read `user_settings.push_subscription` directly from `record.get(...)`, but PB JSVM returns `json` fields as byte arrays, not parsed objects — so `subscription.endpoint` was always `undefined` and the server returned `400 Invalid push subscription`. Both hooks now decode via the shared `parseJsonField()` helper in `routine_helpers.js`.

## [1.1.1] - 2026-04-26

### Fixed

- Push-service is now actually started by s6-overlay. Previously the Dockerfile installed `node /opt/push-service/index.js` but no service definition existed, so PocketBase hooks calling `http://localhost:3001` got `connection refused`. Added `rootfs/etc/services.d/push-service/{run,finish}` and finish-script lets the addon keep running if push-service crashes (PocketBase must stay up).

## [1.1.0] - 2026-04-26

### Changed

- Upgraded bundled PocketBase to 0.37.3 (new admin UI, SQLite 3.53.0)
- Disabled HA ingress / sidebar panel — the SPA's absolute-path routing escaped the dynamic ingress token prefix; expose the addon on port 8090 via Cloudflare Tunnel or a reverse proxy instead

### Fixed

- s6 service scripts (`run`, `finish`, `cont-init.d/calendhd-init.sh`, `run.sh`) marked executable; init no longer fails with `Permission denied`
- `PUSH_SERVICE_URL is not defined` ReferenceError in reminder cron and notification-test routes (moved env-var lookup inside callbacks; PocketBase JSVM isolates callback scope)
- Frontend assets are no longer silently gitignored when building the addon

### Added

- Repo-root `repository.yaml` so the GitHub repo is recognised as an HA add-on store directly
- `build-for-ha.sh` script for Linux/macOS builds

## [1.0.0] - 2025-01-26

### Added

- Initial release of calenDHD for Home Assistant
- PocketBase backend with SQLite database
- Day, Week, Month calendar views
- Event creation with templates
- Categories with color coding
- Household sharing
- Recurring events (daily, weekly, monthly, yearly)
- Reminder system
- iCal/ICS subscription support with recurring event expansion
- Offline-first PWA support
- ADHD-friendly calm design
- Accessibility options (reduce animations, high contrast)
- Multi-language support (English, Swedish)
- Timezone support
- Email/password authentication
