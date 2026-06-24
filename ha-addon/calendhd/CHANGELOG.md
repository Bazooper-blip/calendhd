# Changelog

## 1.6.5

- Maintenance / dependency-bump release.
- Bump bundled PocketBase 0.39.2 → 0.39.4 (OAuth2 code→token exchange no longer requires `redirectURL`; sort by the first implicit presentable relation field; goja + `golang.org/x/*` refresh). No JSVM/hooks/migrations API changes.
- Bump the HA add-on base image from `ghcr.io/hassio-addons/base:16.3.2` to `21.0.0` (Alpine 3.24). No documented breaking changes.
- Update all frontend dependencies to latest, including the major `@types/node` 25 → 26. Also SvelteKit 2.63 → 2.67, Svelte 5.56.3 → 5.56.4, Vite 8.0 → 8.1, Vitest 4.1.8 → 4.1.9, Biome 2.4 → 2.5, Playwright 1.60 → 1.61, svelte-check 4.6 → 4.7, Tailwind 4.3.1, dexie 4.4.4. Type-check (0 errors), 109 unit tests, and the production build all green.

## 1.6.4

- Reminder notifications now include the event's date. Previously the push body was just `<title> at HH:mm`, so a reminder sent a day or more ahead could be misread as the event happening right then. It now reads `<title> today at HH:mm`, `<title> tomorrow at HH:mm`, or `<title> on Tue, Jun 16 at HH:mm` for events further out. Applies to both internal and external (iCal) event reminders.

## 1.6.3

- Fix recurring subscription (iCal/ICS) events. The feed parser in `050_subscription_sync.pb.js` ignored `RRULE` entirely, so every recurring external event was stored as a single instance on its `DTSTART` and never repeated. A new tested `expandRecurrence()` helper in `pb_helpers.js` expands `RRULE` (DAILY/WEEKLY/MONTHLY/YEARLY with INTERVAL, BYDAY including nth forms like `-1SU`, BYMONTH, BYMONTHDAY, COUNT, UNTIL) into concrete occurrences within the sync window -- for both the manual `POST /sync` endpoint and the 15-minute cron.
- Fix recurring events landing on the wrong weekday. Some feeds emit a `DTSTART` whose weekday disagrees with the rule's `BYDAY` -- a biweekly Friday event arriving with `DTSTART` on Saturday. Calendars honor `BYDAY`, so the parser now snaps a mismatched `DTSTART` onto the `BYDAY` weekday within its own week; occurrences land on the correct day and preserve the intended cadence.
- Each recurrence instance now gets a unique per-occurrence UID (`uid::<stamp>`) so the external-reminder scheduler (keyed by subscription+uid, which deletes prior rows per key on each write) tracks every occurrence independently instead of collapsing the whole series onto a single reminder. Note: any pre-existing reminder override set on a recurring external event (keyed by the old bare UID) becomes inert and should be re-set.
- Also fixes recurring events whose `DTSTART` predates the 1-year-back sync window (e.g. annual birthdays/holidays) being dropped entirely; their in-window occurrences now appear.

## 1.6.2

- Bump bundled PocketBase from 0.38.1 -> 0.39.2 (adds cron panic-recovery so a single failing reminder job no longer terminates the server; SQL console; SQLite 3.53.2). No JSVM/hooks/migrations API changes. Also unified the previously-drifted PB_VERSION across build.yaml, Dockerfile, and build-local.sh.
- Update all frontend dependencies to latest, including the PocketBase JS client 0.26 -> 0.27 (additive only). Svelte, SvelteKit, Vite, Vitest, Tailwind, bits-ui, date-fns, dexie, biome, TypeScript and tooling all refreshed. Type-check, unit tests (109), and production build all green.

## 1.6.0

- Add Agenda day-view layout. Settings â†’ Calendar â†’ Day view style lets users switch from the existing 24-hour timeline to a chronological list with three sections: **Earlier today** (collapsible, dimmed), **Now** (big card with "X min left"), and **Upcoming** (with "Free for ~30 min" gap hints between events; first item gets a "Next Â· in Y min" card). Default stays `timeline` so existing setups are unchanged.
- Dim past events/routine groups to 55% opacity across both layouts so the eye lands on what's ahead, not what's done. Orthogonal to the existing completed-strikethrough.
- Migration 0008 adds `user_settings.day_view_style`.

## 1.5.7

- Fix external-event reminders silently never firing for same-day events. After a subscription sync, the `calendar_subscriptions` update hook calls `rescheduleExternalRemindersForSubscription`, which deletes every unsent reminder for the subscription and then re-queries `external_events WHERE start_time >= {:now}` to recreate them. The `:now` parameter came from `new Date().toISOString()` (T separator) but PocketBase stores `start_time` with a space separator â€” same lexical-compare class of bug as 1.5.5, in a different code path. Position 10 has `' '` (0x20) < `'T'` (0x54), so any same-day event's `start_time` always compared LESS than `:now` and got filtered out. The freshly-created reminder rows were therefore deleted by step 1 and never recreated by step 2; the cron had nothing to fire. (Future-day events were unaffected because their date prefix differs.) Symmetric audit of `pb_helpers.js`: two routine-generator queries (`deleteRoutineEventsForDate`, `generateEventsForRoutine`'s existence check) had the same bug and would have caused routine-event duplication; both fixed in the same pass.
- Add `pbDateFilter()` helper in `pb_helpers.js` so future code that compares datetime parameters against PB columns can't reintroduce this mismatch. `record.set()` writes are unaffected â€” PB normalizes T â†’ space on save.

## 1.5.6

- Fix internal-event reminders re-firing every minute and never visibly notifying. The `scheduled_reminders.delivery_method` select field (defined in migration 0001) accepted only `["ha_companion","ntfy","browser"]`, but the cron writes `"web_push"`. Saves were rejected, `sent_at` never got written, the row stayed due, and the cron re-fired it on every tick. Browsers dedupe Web Push by `tag`, so the repeated same-tag pushes silently replaced each other instead of re-alerting â€” net effect was zero visible notifications for events created via the calendar (subscription/external reminders were unaffected because migration 0005 already added `"web_push"` to its parallel collection). Migration 0006 brings `scheduled_reminders` into line.
- Harden `020_reminder_cron.pb.js`: a thrown error from the internal `findAllRecords` query no longer early-returns from the whole cron callback, which was silently skipping the external reminder block. Both `findAllRecords` failures now log instead of being swallowed.

## 1.5.5

- Fix reminders all firing at once at midnight UTC (â‰ˆ 02:00 local) instead of at their scheduled times. The reminder cron compared `scheduled_for` against `Date.toISOString()` (which uses a `T` separator) but PocketBase stores datetimes with a space separator. SQL `<=` is a lexical compare and `' '` (32) < `'T'` (84), so every "today" row became lexically due the moment UTC ticked over to the new day. Now the cron passes the comparison value in PB's storage format.

## 1.5.4

- Fix push notifications never firing in real usage. Two PB 0.37 API mismatches were silently breaking the reminder pipeline:
  - All `onRecordAfter*` hooks were registered with `(collectionName, handler)` instead of the required `(handler, ...tags)` â€” none of the per-record event hooks were actually firing, so `scheduled_reminders` rows were never written on event create/update.
  - `$dbx.newExp` was renamed to `$dbx.exp` in PB 0.37; the reminder cron silently swallowed the resulting `TypeError`, so even pre-existing scheduled rows would never be sent.
- Bump bundled PocketBase from 0.37.3 â†’ 0.37.5.

## 1.5.1

- Fix week view grid misalignment on phone/tablet â€” day headers now align with the time grid columns instead of stretching across the time-label gutter.

## 1.5.0

- Add reminders for external (subscription) events: per-subscription default lead-time, per-event override (custom minutes / off), survives re-sync.

## [1.4.5] - 2026-04-29

### Added

- **External-event detail modal**: subscription-fed events (iCal feeds) are now clickable across day, week, and month views and open a read-only modal showing source calendar, date/time, location, and description. Previously they were rendered but silently inert. Editing remains disabled â€” the source calendar is still the only writer.

## [1.4.4] - 2026-04-27

### Added â€” branding / icons

Replaces the broken text-as-PNG `favicon.png` and the `icon.png.txt` / `logo.png.txt` placeholder files with the real "Today's Focus" calenDHD artwork.

- **`static/favicon.svg`**: vector source. Used as the primary browser favicon (modern browsers prefer SVG, scales to any size).
- **`static/favicon.ico`**: legacy fallback (16Ã—16 + 32Ã—32 multi-resolution).
- **`static/favicon.png`**: 32Ã—32 PNG fallback for the few clients that don't support SVG/ICO.
- **`static/icons/icon-{72,96,128,144,152,180,192,384,512}.png`**: PWA icon set, all rendered from the SVG via rsvg-convert.
- **`static/icons/apple-touch-icon.png`** (180Ã—180): iOS home-screen icon; sized correctly so iOS doesn't rescale.
- **`static/icons/maskable-512.png`**: Android adaptive-icon variant. The artwork sits inside the 80% safe zone, so OS-applied circle/squircle masks won't crop the brand mark.
- **`static/icons/shortcut-add.png`**, **`shortcut-today.png`**: PWA app-shortcut icons (referenced by manifest's "shortcuts" array).
- **`ha-addon/calendhd/icon.png`** and **`logo.png`** (256Ã—256): used by Home Assistant's add-on store list and detail page. Replaces the `*.txt` placeholders.

### Changed

- `src/app.html`: now declares the SVG favicon as primary (`<link rel="icon" type="image/svg+xml">`) with PNG and ICO marked `rel="alternate icon"`. Apple touch icon link now carries the `sizes="180x180"` attribute iOS expects.
- `static/manifest.json`: SVG icon entry added at the top of the `icons` array with `"sizes": "any"` so PWA installers prefer it where supported.

## [1.4.3] - 2026-04-27

Frontend rebuild release â€” bundles all 1.3.x and 1.4.x source changes into the addon image. Earlier 1.4.x version bumps shipped without re-running `build-for-ha.sh`, so the addon was running a stale `_app/` bundle.

## [1.4.2] - 2026-04-27

### Fixed

- **Brain-dump page 400 on load**: the JS SDK call `getFullList({ sort: '-created' })` produced `perPage=1000&sort=-created` â€” both legs of which can fail in PB 0.37 (perPage exceeds MaxPerPage=500 in some SDK paths; `sort=-created` is rejected when the brain_dump collection's auto-managed system fields aren't exposed at the API schema layer). Replaced with `getFullList({ batch: 200 })` and a client-side `localeCompare`-on-`created` sort. Volume is small for a single-household app, so post-fetch sort is fine.

## [1.4.1] - 2026-04-27

### Fixed

- **`SINGLETON_EMAIL is not defined` on bootstrap**: `005_singleton_init.pb.js` declared its constants at module scope, but PB JSVM runs `onBootstrap` and `routerAdd` callbacks in an isolated goja runtime where module-level `const`s aren't visible. Same gotcha that bit `PUSH_SERVICE_URL` in 1.1.2. Constants moved inside each callback. Singleton-account creation no longer fails on first start.
- **Migration 0004 SQL error: `no such column: created`**: dropped the secondary `idx_brain_dump_user_created` index. PocketBase's auto-managed `created` system field isn't available as a SQL column at index-creation time. The remaining `idx_brain_dump_user` index is sufficient â€” list-by-created is JS-sorted in `getBrainDumps()` and brain-dump volume is small for a single household.

PocketBase rolls failed migrations back in their entirety, so deployments stuck on 1.4.0 will retry the fixed 0004 cleanly on next start. No data loss.

## [1.4.0] - 2026-04-27

Eight new ADHD-focused capabilities, organised into eight commits in the repo for individual reviewability.

### Added â€” schema (migration `0004_adhd_features.js`)

- `events.first_step` (text, optional) â€” captures the smallest concrete next action for a task.
- `user_settings.buffer_minutes` (number, default 10) â€” tight-transition threshold.
- `user_settings.density` (compact / comfortable / spacious, default comfortable).
- `user_settings.daily_wins_enabled` (bool, default true).
- `user_settings.streak_celebration_enabled` (bool, default true).
- New `brain_dump` collection (id, user, title, notes, created, updated) for quick thought capture.

### Added â€” UX

- **First-step extraction** â€” when an event is marked as a task, EventForm prompts for "what's the first physical action". Reminder push notifications now use the first-step text as the body, so reminders show the concrete action ("Open the laptop") instead of the abstract title ("Write report").
- **Buffer-time pill** â€” DayView shows an amber "X min transition" pill in any gap shorter than `buffer_minutes` between two consecutive events. Visual-only; nothing is auto-rescheduled.
- **/now route** â€” full-screen focus view with three states: "happening now" (current event, time-left pill, mark-done quick action), "up next" (time-until pill on the next event), and "nothing scheduled" idle state. Auto-refreshes every 30 s.
- **Daily wins banner** â€” gentle end-of-day affirmation at the top of the day view after 21:00, summarising completions, focus time, and fully-completed routines. Per-day localStorage dismissal.
- **Brain dump screen** at `/brain-dump` â€” single-input quick capture into a dedicated collection. Per-item "Schedule" (pre-fills `/event/new` via query string) and "Delete". For ideas you don't want to lose but don't want to schedule yet.
- **Sample-routine starter pack** â€” empty `/routines` page now offers an "Add starter routines" button that creates three calm starting points (morning, evening wind-down, weekly admin) with sensible energy levels and timing modes.
- **Density toggle** in Settings â†’ Appearance (compact / comfortable / spacious). Currently propagates as `compact={true}` to event/routine blocks; spacious is a future polish.
- **Routine streak counter + completion celebration** â€” small "ðŸ”¥ N" pill on routine blocks when there's a current streak (consecutive past days where every step of that routine was completed). One-shot âœ¨ toast when toggling a step completes today's last open step in a routine. Both gated by `streak_celebration_enabled`.

### Other settings

- Settings page now exposes the new `density`, `buffer_minutes`, `daily_wins_enabled`, and `streak_celebration_enabled` controls.

### i18n

- 49 new keys added across the eight phases. en.json / sv.json verified balanced at 314 keys each, full Swedish coverage (no `||` fallbacks).

## [1.3.2] - 2026-04-27

### Fixed â€” dark-mode coverage

Dark mode previously rendered correctly only in Settings, Subscriptions, and Routines. The remaining views shipped with light-only Tailwind classes and looked broken on a dark theme. Audit + fix:

- **Day / Week / Month views**: all hour gridlines, day headers, hour labels, weekday headers, "non-current-month" cells, and "+N more" indicators now have `dark:` variants. Current-time indicator (red) intentionally left unchanged â€” it's a signal color that reads on both themes.
- **Event form** (`/event/new`, `/event/[id]`) â€” was completely white. All field labels, hints, reminder rows, and the description textarea now have dark variants.
- **Categories and Templates** pages: list cards, empty states, modal labels and helpers â€” all dark-aware now.
- **QuickAdd modal**: date/time/duration labels, duration-segmented control, task toggle, and tip text. The FAB and primary action buttons keep their bright `bg-primary-500` (legible on either theme).
- **ColorPicker primitive**: the selected-state ring used `ring-neutral-800` which was invisible against the dark surface; now flips to `ring-neutral-100` in dark mode with a matching offset so the checkmark stays readable.

Convention used (extracted from existing dark-aware files): `bg-white â†’ dark:bg-neutral-800`, `text-neutral-{700,800,900} â†’ dark:text-neutral-{200,100,50}`, `border-neutral-{100,200} â†’ dark:border-neutral-{800,700}`, color-tinted backgrounds use `dark:bg-{color}-900/{20-30}` for subtle washes. The UI primitives (`<Input>`, `<Select>`, `<Modal>`, `<Toggle>`) were already dark-aware â€” verified, no changes needed.

## [1.3.1] - 2026-04-27

### Fixed â€” Swedish translation coverage

Audited every `.svelte` file under `src/lib/components/` and `src/routes/` for hardcoded English strings that bypassed i18n. Locale files were already key-balanced (each ~265 entries), so the gaps were components, not translations:

- **Quick-add modal** (FAB + form): modal title, input placeholder, day/time/duration labels, task-toggle button, footer buttons, "press N anywhere" tip, FAB aria-label, success/failure toasts.
- **Event block "Now" badge**: routed through new `event.now` key.
- **Event block "All day" label**: routed through existing `time.allDay` key.
- **Event block checkbox aria-label**: new `event.markComplete` / `event.markIncomplete` keys.
- **Day-progress label**: routed through existing `progress.dayProgress` key.
- **Offline indicator**: "Back online", "You're offline", "Changes will sync when connected", "Dismiss" â€” all routed through existing `status.*` keys.
- **Icon picker**: "No emojis found", "Loading iconsâ€¦", "No icons found" â€” new `iconPicker.*` keys.
- **Settings page**: removed five `$_('key') || 'English fallback'` patterns that masked perfectly-good Swedish translations; added proper failure-message keys for catch-block toasts (was reusing success-message keys).

13 new keys added to both `en.json` and `sv.json`; both files now sit at 270 keys with zero key drift verified.

## [1.3.0] - 2026-04-27

### Added â€” time-blindness UX

- **"Happening now" highlight**: events and routine blocks whose time range contains the current minute get a sage-green ring and a small pulsing "Now" badge in the title row. Visually answers "what should I be doing right now" at a glance.
- **"Next: â€¦" pill** in the day-view header: shows the upcoming event's icon, truncated title, and time-until ("in 23 min", "in 1h 15m", "tomorrow") when viewing today. Updates as `now` ticks each minute.

The horizontal "now" line on the timeline and auto-scroll-to-current-time on mount were already present; this release builds on those primitives by extending the same `now` rune into the EventBlock / RoutineBlock children.

## [1.2.0] - 2026-04-27

### Security

- Removed the hardcoded singleton-account password from the frontend bundle. The addon init script now generates a per-deployment random password at `/config/calendhd/.singleton-password` (mode 600) and exposes it via the `SINGLETON_PASSWORD` env var. A new `005_singleton_init.pb.js` hook creates the singleton user on bootstrap and rotates its stored password to match. The frontend fetches credentials from a same-origin `GET /api/calendhd/bootstrap` endpoint at login. Documented the perimeter-trust security model in `DOCS.md` and `CLAUDE.md`.

### Fixed

- `event.reminders` (json field) was not being decoded properly in `010_reminder_scheduler.pb.js`, mirroring the push-subscription bug fixed in 1.1.2. Reminders may have been silently dropped when scheduling. Both create and update paths now route through the shared `parseJsonField()` helper.

### Changed

- Renamed `routine_helpers.js` â†’ `pb_helpers.js` and exported `parseJsonField` for use across all hooks. The helper handles all three forms PB JSVM may return for json fields (string, plain object, byte array).

### Tooling

- Added Biome 2.4 for formatting and linting `src/**/*.{ts,js}`. New scripts: `npm run format`, `npm run format:check`, and `npm run lint` now runs Biome + svelte-check. `.svelte` files are not formatted by Biome (partial Svelte 5 support upstream); svelte-check still owns Svelte type/style validation.

## [1.1.3] - 2026-04-27

### Documentation

- Removed stale references to "Household sharing", HA sidebar/ingress, and an in-app sign-up flow â€” none of which exist. The app is intentionally a single-household calendar with auto-login as `home@calendhd.local`.
- Added Cloudflare Tunnel / NGINX SSL Proxy guidance for HTTPS / remote access (the addon serves plain HTTP on port 8090).
- Clarified that the frontend is baked into the Docker image and copied to `/config/calendhd/pb_public/` on first run; manual file copy is only needed for hot-swapping a newer build.
- Removed the Apple Sign-in / OAuth provider sections from user docs and the corresponding `APPLE_*` env vars from `.env.example` â€” the app's auto-login flow never exercised any external provider.
- Added a note that contributors building the addon manually must run `./build-for-ha.sh` first to populate the pre-built frontend the Dockerfile expects.

## [1.1.2] - 2026-04-26

### Fixed

- Push notifications now actually deliver. The reminder cron and `/api/calendhd/test-notification` route both read `user_settings.push_subscription` directly from `record.get(...)`, but PB JSVM returns `json` fields as byte arrays, not parsed objects â€” so `subscription.endpoint` was always `undefined` and the server returned `400 Invalid push subscription`. Both hooks now decode via the shared `parseJsonField()` helper in `routine_helpers.js`.

## [1.1.1] - 2026-04-26

### Fixed

- Push-service is now actually started by s6-overlay. Previously the Dockerfile installed `node /opt/push-service/index.js` but no service definition existed, so PocketBase hooks calling `http://localhost:3001` got `connection refused`. Added `rootfs/etc/services.d/push-service/{run,finish}` and finish-script lets the addon keep running if push-service crashes (PocketBase must stay up).

## [1.1.0] - 2026-04-26

### Changed

- Upgraded bundled PocketBase to 0.37.3 (new admin UI, SQLite 3.53.0)
- Disabled HA ingress / sidebar panel â€” the SPA's absolute-path routing escaped the dynamic ingress token prefix; expose the addon on port 8090 via Cloudflare Tunnel or a reverse proxy instead

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
