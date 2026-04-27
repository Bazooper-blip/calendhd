# Changelog

## [1.4.3] - 2026-04-27

Frontend rebuild release — bundles all 1.3.x and 1.4.x source changes into the addon image. Earlier 1.4.x version bumps shipped without re-running `build-for-ha.sh`, so the addon was running a stale `_app/` bundle.

## [1.4.2] - 2026-04-27

### Fixed

- **Brain-dump page 400 on load**: the JS SDK call `getFullList({ sort: '-created' })` produced `perPage=1000&sort=-created` — both legs of which can fail in PB 0.37 (perPage exceeds MaxPerPage=500 in some SDK paths; `sort=-created` is rejected when the brain_dump collection's auto-managed system fields aren't exposed at the API schema layer). Replaced with `getFullList({ batch: 200 })` and a client-side `localeCompare`-on-`created` sort. Volume is small for a single-household app, so post-fetch sort is fine.

## [1.4.1] - 2026-04-27

### Fixed

- **`SINGLETON_EMAIL is not defined` on bootstrap**: `005_singleton_init.pb.js` declared its constants at module scope, but PB JSVM runs `onBootstrap` and `routerAdd` callbacks in an isolated goja runtime where module-level `const`s aren't visible. Same gotcha that bit `PUSH_SERVICE_URL` in 1.1.2. Constants moved inside each callback. Singleton-account creation no longer fails on first start.
- **Migration 0004 SQL error: `no such column: created`**: dropped the secondary `idx_brain_dump_user_created` index. PocketBase's auto-managed `created` system field isn't available as a SQL column at index-creation time. The remaining `idx_brain_dump_user` index is sufficient — list-by-created is JS-sorted in `getBrainDumps()` and brain-dump volume is small for a single household.

PocketBase rolls failed migrations back in their entirety, so deployments stuck on 1.4.0 will retry the fixed 0004 cleanly on next start. No data loss.

## [1.4.0] - 2026-04-27

Eight new ADHD-focused capabilities, organised into eight commits in the repo for individual reviewability.

### Added — schema (migration `0004_adhd_features.js`)

- `events.first_step` (text, optional) — captures the smallest concrete next action for a task.
- `user_settings.buffer_minutes` (number, default 10) — tight-transition threshold.
- `user_settings.density` (compact / comfortable / spacious, default comfortable).
- `user_settings.daily_wins_enabled` (bool, default true).
- `user_settings.streak_celebration_enabled` (bool, default true).
- New `brain_dump` collection (id, user, title, notes, created, updated) for quick thought capture.

### Added — UX

- **First-step extraction** — when an event is marked as a task, EventForm prompts for "what's the first physical action". Reminder push notifications now use the first-step text as the body, so reminders show the concrete action ("Open the laptop") instead of the abstract title ("Write report").
- **Buffer-time pill** — DayView shows an amber "X min transition" pill in any gap shorter than `buffer_minutes` between two consecutive events. Visual-only; nothing is auto-rescheduled.
- **/now route** — full-screen focus view with three states: "happening now" (current event, time-left pill, mark-done quick action), "up next" (time-until pill on the next event), and "nothing scheduled" idle state. Auto-refreshes every 30 s.
- **Daily wins banner** — gentle end-of-day affirmation at the top of the day view after 21:00, summarising completions, focus time, and fully-completed routines. Per-day localStorage dismissal.
- **Brain dump screen** at `/brain-dump` — single-input quick capture into a dedicated collection. Per-item "Schedule" (pre-fills `/event/new` via query string) and "Delete". For ideas you don't want to lose but don't want to schedule yet.
- **Sample-routine starter pack** — empty `/routines` page now offers an "Add starter routines" button that creates three calm starting points (morning, evening wind-down, weekly admin) with sensible energy levels and timing modes.
- **Density toggle** in Settings → Appearance (compact / comfortable / spacious). Currently propagates as `compact={true}` to event/routine blocks; spacious is a future polish.
- **Routine streak counter + completion celebration** — small "🔥 N" pill on routine blocks when there's a current streak (consecutive past days where every step of that routine was completed). One-shot ✨ toast when toggling a step completes today's last open step in a routine. Both gated by `streak_celebration_enabled`.

### Other settings

- Settings page now exposes the new `density`, `buffer_minutes`, `daily_wins_enabled`, and `streak_celebration_enabled` controls.

### i18n

- 49 new keys added across the eight phases. en.json / sv.json verified balanced at 314 keys each, full Swedish coverage (no `||` fallbacks).

## [1.3.2] - 2026-04-27

### Fixed — dark-mode coverage

Dark mode previously rendered correctly only in Settings, Subscriptions, and Routines. The remaining views shipped with light-only Tailwind classes and looked broken on a dark theme. Audit + fix:

- **Day / Week / Month views**: all hour gridlines, day headers, hour labels, weekday headers, "non-current-month" cells, and "+N more" indicators now have `dark:` variants. Current-time indicator (red) intentionally left unchanged — it's a signal color that reads on both themes.
- **Event form** (`/event/new`, `/event/[id]`) — was completely white. All field labels, hints, reminder rows, and the description textarea now have dark variants.
- **Categories and Templates** pages: list cards, empty states, modal labels and helpers — all dark-aware now.
- **QuickAdd modal**: date/time/duration labels, duration-segmented control, task toggle, and tip text. The FAB and primary action buttons keep their bright `bg-primary-500` (legible on either theme).
- **ColorPicker primitive**: the selected-state ring used `ring-neutral-800` which was invisible against the dark surface; now flips to `ring-neutral-100` in dark mode with a matching offset so the checkmark stays readable.

Convention used (extracted from existing dark-aware files): `bg-white → dark:bg-neutral-800`, `text-neutral-{700,800,900} → dark:text-neutral-{200,100,50}`, `border-neutral-{100,200} → dark:border-neutral-{800,700}`, color-tinted backgrounds use `dark:bg-{color}-900/{20-30}` for subtle washes. The UI primitives (`<Input>`, `<Select>`, `<Modal>`, `<Toggle>`) were already dark-aware — verified, no changes needed.

## [1.3.1] - 2026-04-27

### Fixed — Swedish translation coverage

Audited every `.svelte` file under `src/lib/components/` and `src/routes/` for hardcoded English strings that bypassed i18n. Locale files were already key-balanced (each ~265 entries), so the gaps were components, not translations:

- **Quick-add modal** (FAB + form): modal title, input placeholder, day/time/duration labels, task-toggle button, footer buttons, "press N anywhere" tip, FAB aria-label, success/failure toasts.
- **Event block "Now" badge**: routed through new `event.now` key.
- **Event block "All day" label**: routed through existing `time.allDay` key.
- **Event block checkbox aria-label**: new `event.markComplete` / `event.markIncomplete` keys.
- **Day-progress label**: routed through existing `progress.dayProgress` key.
- **Offline indicator**: "Back online", "You're offline", "Changes will sync when connected", "Dismiss" — all routed through existing `status.*` keys.
- **Icon picker**: "No emojis found", "Loading icons…", "No icons found" — new `iconPicker.*` keys.
- **Settings page**: removed five `$_('key') || 'English fallback'` patterns that masked perfectly-good Swedish translations; added proper failure-message keys for catch-block toasts (was reusing success-message keys).

13 new keys added to both `en.json` and `sv.json`; both files now sit at 270 keys with zero key drift verified.

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
