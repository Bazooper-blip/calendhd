# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

calenDHD is a calm, ADHD-friendly calendar PWA for neurodivergent minds. It's a client-only SvelteKit app backed by PocketBase, with IndexedDB (Dexie) as the local data store. Each instance serves as a singleton calendar for a single household — there is no multi-user authentication or household sharing; the app auto-logs in a home account (`home@calendhd.local`).

**Security model:** the network perimeter is the trust boundary. Anyone who can reach the URL has full access to the calendar. The singleton-account password is generated per-deployment by the addon init script (`/config/calendhd/.singleton-password`) and exposed to the frontend via `GET /api/calendhd/bootstrap` — there is **no** hardcoded password in the static bundle. Front the addon with Cloudflare Access, an SSL reverse proxy with auth, or LAN-only access for non-public deployments. See `pocketbase/pb_hooks/005_singleton_init.pb.js`.

## Commands

```bash
npm run dev          # Start dev server (http://localhost:5173)
npm run build        # Production build (static adapter → build/)
npm run preview      # Preview production build
npm run check        # Svelte type checking (svelte-kit sync + svelte-check)
npm run check:watch  # Type checking in watch mode
npm run test         # Run Vitest unit tests
npm run test:e2e     # Run Playwright end-to-end tests
npm run lint         # Same as check (svelte-check)
```

PocketBase must be running separately for backend features (requires PocketBase 0.37+):
```bash
cd pocketbase && ./pocketbase serve   # Starts on http://127.0.0.1:8090
```

Environment variables are documented in `.env.example` (PocketBase URL, optional VAPID keys for push).

Home Assistant addon release build (commits go to git for HA to pull):
```bash
./build-for-ha.sh    # Linux/macOS — builds frontend, syncs hooks/migrations/push-service into ha-addon/calendhd/
./build-for-ha.cmd   # Windows equivalent (legacy; also writes ha-deploy/ staging dir)
```
Bump `version:` in `ha-addon/calendhd/config.yaml` before each release so HA detects the update.

## Architecture

### Client-Only PWA (No SSR)

SSR is disabled (`export const ssr = false` in `+layout.ts`). The app is built as a static SPA using `@sveltejs/adapter-static` with `fallback: 'index.html'` for client-side routing. PWA capabilities are provided by a hand-written service worker (`src/service-worker.ts`) using SvelteKit's built-in `$service-worker` module.

### Data Flow

1. All mutations write to **IndexedDB (Dexie)** immediately
2. UI updates optimistically from local data
3. PocketBase realtime subscriptions pull remote changes back to local
4. Server sync is attempted after each local write

### Svelte 5 Runes

All stores use the Svelte 5 rune system (`$state`, `$derived`, `$effect`), not legacy Svelte stores. Store files use the `.svelte.ts` extension.

### Path Aliases

Defined in `svelte.config.js`:
- `$components` → `src/lib/components`
- `$stores` → `src/lib/stores`
- `$db` → `src/lib/db`
- `$api` → `src/lib/api`
- `$utils` → `src/lib/utils`
- `$types` → `src/lib/types`

### Key Modules

| Module | Path | Purpose |
|--------|------|---------|
| Database | `src/lib/db/index.ts` | Dexie schema (events, categories, templates, subscriptions, external_events, settings, routine_templates) |
| Routines DB | `src/lib/db/routines.ts` | Routine template local DB helpers |
| API | `src/lib/api/pocketbase.ts` | PocketBase client, collection helpers, realtime subscriptions, brain-dump CRUD |
| Stores | `src/lib/stores/*.svelte.ts` | Rune-based stores: auth, calendar, categories, templates, settings, routines |
| i18n | `src/lib/i18n/` | English (default, sync-loaded) and Swedish (lazy-loaded) via svelte-i18n; locale files must stay key-balanced (Python structural diff in CI-style sweeps) |
| Date Utils | `src/lib/utils/date.ts` | Timezone-aware date formatting/manipulation via date-fns + date-fns-tz |
| Recurrence | `src/lib/utils/recurrence.ts` | Recurrence rule formatting and presets |
| Notifications | `src/lib/utils/notifications.ts` | Web Push API, VAPID key handling |
| Streak | `src/lib/utils/streak.ts` | `computeRoutineStreak()` — counts consecutive past days a routine was fully completed |
| Sample routines | `src/lib/utils/sampleRoutines.ts` | Hardcoded starter-pack routines used by the empty-state button on `/routines` |
| Types | `src/lib/types/index.ts` | Core types: CalendarEvent/LocalEvent, Category/LocalCategory, Template, RoutineTemplate, BrainDump, DisplayEvent, RecurrenceRule, UserSettings |

### Stores

All stores are singletons using Svelte 5 runes in `.svelte.ts` files:

| Store | Key State | Purpose |
|-------|-----------|---------|
| `auth.svelte.ts` | user, isAuthenticated | Auto-login singleton account; fetches credentials from `/api/calendhd/bootstrap` (no hardcoded password) |
| `calendar.svelte.ts` | currentDate, viewType, events, displayEvents | Calendar state, event CRUD, flexible timing cascade for routine steps; fires routine-completion celebration toast |
| `settings.svelte.ts` | settings (15+ keys) | User preferences. Includes ADHD knobs: `buffer_minutes`, `density`, `daily_wins_enabled`, `streak_celebration_enabled` |
| `categories.svelte.ts` | categories | Category CRUD with 8 default colors, reorderable |
| `templates.svelte.ts` | templates | Event template CRUD with local sync |
| `routines.svelte.ts` | routines | Routine template CRUD with active/inactive toggling |

### Components

```
src/lib/components/
├── layout/     Header, Sidebar
├── calendar/   DayView, WeekView, MonthView, EventBlock, RoutineBlock,
│               DayProgress, DailyWinsBanner
├── event/      EventForm, QuickAdd
├── ui/         Button, Input, Modal, Select, Toggle, ColorPicker, IconPicker,
│               EventIcon, OfflineIndicator
└── index.ts    Barrel re-export of all subcomponents
```

**Time-blindness UX in DayView** (intentional design — keep these affordances coherent when editing):
- DayProgress bar (waking-hours percent)
- Horizontal red "now" line at the current minute, with auto-scroll-to-now on mount
- "Happening now" sage ring + pulsing badge on the active event/routine
- "Next: …" pill in the day header showing the next event's icon, title, and time-until
- DailyWinsBanner at top of today's view after 21:00 when there are completions

### Routes

- `/` — Redirects to user's default calendar view
- `/now` — Right-now focus screen (current event / next-up / idle); auto-refreshes every 30s
- `/calendar/day/[[date]]`, `/calendar/week/[[date]]`, `/calendar/month/[[date]]` — Calendar views (optional date param)
- `/event/new`, `/event/[id]` — Event creation/editing; `/event/new` reads `?title=&notes=` query params for brain-dump pre-fill
- `/routines`, `/routines/new`, `/routines/[id]` — Routine template management; empty-state offers "Add starter routines"
- `/brain-dump` — Quick thought capture (no date/category required); per-item "Schedule" / "Delete"
- `/categories`, `/templates`, `/subscriptions`, `/settings` — Management pages

### Dexie Database Schema

8 tables with offline-first sync support (`sync_status: 'synced' | 'pending' | 'conflict' | 'deleted'`):

| Table | Key | Purpose |
|-------|-----|---------|
| events | local_id | Calendar events with recurrence, reminders, routine refs |
| categories | local_id | Color-coded categories with sort_order |
| templates | local_id | Reusable event templates |
| routine_templates | local_id | Routine definitions with steps, schedule, energy levels |
| subscriptions | id | External iCal feed subscriptions |
| external_events | id | Read-only events from subscriptions |
| external_event_reminders | id | Per-external-event reminder override (keyed by subscription+ical_uid). Mirrored from PB; pure local cache for the modal. |
| settings | id | User preferences |

### PocketBase

**Migrations** (`pocketbase/pb_migrations/`):
1. `0001_initial_schema.js` — Core collections: categories, events, templates, calendar_subscriptions, external_events, user_settings, scheduled_reminders
2. `0002_routine_templates.js` — Routine templates collection + routine fields on events
3. `0003_routine_target_end.js` — target_end_time field on routine_templates
4. `0004_adhd_features.js` — `events.first_step` (text); `user_settings.{buffer_minutes, density, daily_wins_enabled, streak_celebration_enabled}`; new `brain_dump` collection
5. `0005_external_event_reminders.js` — `calendar_subscriptions.{reminders_enabled, default_reminder_minutes}`; new `external_event_reminders` collection (per-event overrides keyed by subscription+ical_uid); new `external_scheduled_reminders` collection (parallel to `scheduled_reminders` for the external-event reminder pipeline)

**Hooks** (`pocketbase/pb_hooks/`):
- `005_singleton_init.pb.js` — Creates/rotates the singleton `home@calendhd.local` user on bootstrap; serves credentials at `GET /api/calendhd/bootstrap` (same-origin)
- `010_reminder_scheduler.pb.js` — Schedules reminders on event create/update
- `015_external_reminder_scheduler.pb.js` — Thin shell that delegates to pb_helpers; on `external_events` create/update writes a row to `external_scheduled_reminders` applying per-event override + subscription default; reschedules when overrides or subscription settings change
- `020_reminder_cron.pb.js` — Cron job to send scheduled reminders; uses `event.first_step` as push body when set
- `030_reminder_cleanup.pb.js` — Cleanup old sent reminders
- `040_notification_test.pb.js` — Test notification endpoint
- `050_subscription_sync.pb.js` — Sync external iCal feeds
- `060_routine_generator.pb.js` — Daily cron generates events from active routines; regenerates on routine create/update; cascades delete
- `pb_helpers.js` — Shared `require()`'d module; exports `parseJsonField()` (handles all three forms PB JSVM may return for json fields) + routine helpers. Must be copied to addon alongside hooks.

**Custom routes** (registered via `routerAdd` in hooks):
- `GET /api/calendhd/bootstrap` — singleton credentials (auth bootstrap)
- `GET /api/calendhd/vapid-public-key` — VAPID public key for push subscriptions
- `POST /api/calendhd/test-notification` — server-side push test (requires auth)

### PocketBase JSVM gotchas (read before touching any `pb_hooks/*.pb.js`)

These have caused multiple production-breaking bugs. They're not optional knowledge:

1. **Callback scope isolation.** `cronAdd`, `routerAdd`, `onBootstrap`, and `onRecord*` callbacks run in their own goja runtimes. Module-level `var`/`const` declarations are **not** visible inside callbacks. Constants and `$os.getenv()` calls must be **inside** each callback body. Compile-time JS semantics suggest closure capture; PB JSVM does not honor that.
2. **JSON fields return byte arrays.** `record.get('<json_field>')` returns a Goja byte array, not a parsed object. Always route through `helpers.parseJsonField(record.get(...))`. The "field is `null`/`undefined`" error message is misleading — the bytes are right there but `.endpoint` etc. is undefined on a byte array.
3. **System fields aren't queryable on JS-defined collections.** PB 0.37 auto-adds `id`/`created`/`updated` SQL columns but does not expose them at the API schema layer for collections defined by JS migrations. You can't `CREATE INDEX ... ON foo (created)` and you can't `?sort=-created` from the JS SDK. Sort by user-defined fields server-side, or sort client-side after `getFullList()`.
4. **`getFullList()` perPage cap.** The JS SDK may default to `perPage=1000` in some flows but PB 0.37 enforces `MaxPerPage=500`. Pass `{ batch: 200 }` (or similar < 500) explicitly when calling `getFullList`.

### Service Worker

`src/service-worker.ts` implements:
- **Cache-first** for precached static assets
- **Network-first** for API calls (`/api/`, `/_/`) and navigation
- **Network-only** for POST requests
- Push notification handling with View/Dismiss actions
- Background sync support (`calendhd-sync` tag)
- `SKIP_WAITING` message listener for update prompts

### Dev Proxy

`vite.config.ts` proxies `/api` and `/_` to `http://127.0.0.1:8090` (PocketBase) during development.

### Deployment Targets

- **Docker**: `docker/` — docker-compose with PocketBase + frontend + push-service + optional nginx reverse proxy
- **Home Assistant Add-on**: `ha-addon/` — Full HA add-on (see details below)
- **Push Service**: `push-service/` — Standalone Node.js web-push notification service

### Home Assistant Add-on

The HA add-on lives in `ha-addon/calendhd/` and bundles PocketBase + frontend + push-service into a single container.

**Structure:**
```
ha-addon/calendhd/
├── config.yaml              # HA addon config (port 8090 exposed; ingress disabled — SPA absolute paths conflict with ingress token prefix)
├── build.yaml               # Docker build args (PB_VERSION, base image per arch)
├── Dockerfile               # Multi-arch build: base image + PocketBase + frontend + push-service
├── pb_hooks/                # Copied from pocketbase/pb_hooks/ (must stay in sync)
├── pb_migrations/           # Copied from pocketbase/pb_migrations/ (must stay in sync)
├── pb_schema_import.json    # Full schema export for manual import
├── translations/en.yaml     # HA config UI translations
├── rootfs/
│   ├── run.sh               # Startup: launches PocketBase on 0.0.0.0:8090
│   ├── etc/cont-init.d/calendhd-init.sh   # Init: copies files to /config/calendhd/, sets env vars
│   ├── etc/services.d/pocketbase/          # s6-overlay service definition
│   └── opt/calendhd/public/index.html      # Pre-built frontend placeholder
├── DOCS.md, CHANGELOG.md
└── push-service/            # Copied from push-service/ by build script (not checked in)
```

**Key details:**
- **PocketBase version**: Defined in `build.yaml` (`PB_VERSION` arg), must match `Dockerfile` default
- **Architectures**: aarch64, amd64, armv7
- **Networking**: Port 8090 exposed directly; HA ingress is disabled because the SvelteKit app uses absolute paths (`goto('/calendar/...')`) that escape the dynamic ingress token prefix. Front the addon with a reverse proxy (Cloudflare Tunnel, NGINX SSL Proxy) for HTTPS.
- **Persistence**: All data stored at `/config/calendhd/` (HA config volume)
- **Options**: `log_level`, `vapid_public_key`, `vapid_private_key`, `vapid_email`
- **Init script** copies hooks, migrations, and frontend to the config volume on each start

**Keeping the addon in sync:**
- `build-for-ha.sh` (Linux/macOS) — builds frontend, copies hooks/migrations/push-service into `ha-addon/calendhd/` for committing.
- `build-for-ha.cmd` (Windows, legacy) — same job plus a `ha-deploy/` staging dir for manual Samba copy.
- `ha-addon/build-local.sh` — builds the addon Docker image locally for testing (does not sync hooks/migrations).

**Release flow:** the Dockerfile (`ha-addon/calendhd/Dockerfile`) does not run `npm run build` itself — its build context is limited to `ha-addon/calendhd/`, so the frontend at `rootfs/opt/calendhd/public/` must be pre-built and committed. `.gitignore` only excludes the top-level `build/`, so the addon's `rootfs/opt/calendhd/public/` is tracked normally.

> **Critical:** any commit that changes `src/**` MUST be paired with `./build-for-ha.sh` so the rebuilt `_app/*` chunks land in `ha-addon/calendhd/rootfs/opt/calendhd/public/`. Bumping `version:` in `config.yaml` triggers HA to "update" but the image rebuild produces an identical artifact if the rootfs hasn't been refreshed. Has bitten us at least once (1.4.0 → 1.4.3). The init script (`calendhd-init.sh`) rsync's `/opt/calendhd/public/* → /config/calendhd/pb_public/` on every start — overwriting any hot-swapped assets — so the in-image bundle is the source of truth.

**Singleton-account password rotation.** On every addon start, `cont-init.d/calendhd-init.sh` ensures `/config/calendhd/.singleton-password` exists (generates 32-byte hex via openssl/urandom on first run), exposes it as `SINGLETON_PASSWORD` in the s6 container_environment, and the `005_singleton_init.pb.js` hook then `setPassword`s the singleton user to match. To force-rotate the password: stop addon → `rm /config/calendhd/.singleton-password` → start addon. Existing sessions are invalidated on next `authRefresh`.

**Repo metadata:** [`repository.yaml`](repository.yaml) at the repo root marks this as an HA add-on repository. Users add `https://github.com/Bazooper-blip/calendhd` in HA → Add-on Store → Repositories.

**When adding new hooks or migrations**, always run the build script or manually copy files to `ha-addon/calendhd/` to keep the addon in sync.

## Testing

- **Unit tests**: Vitest in `node` environment (not jsdom) with `fake-indexeddb` polyfill (setup in `src/tests/setup.ts`)
- **Test files**: `src/lib/db/index.test.ts`, `src/lib/db/routines.test.ts`, `src/lib/utils/date.test.ts`, `src/lib/utils/recurrence.test.ts`, `src/lib/utils/index.test.ts`
- **E2E tests**: Playwright (via `npm run test:e2e`)
- **Code style**: Biome (`biome.json` at repo root) for `src/**/*.{ts,js}` — `npm run format` writes, `npm run format:check` verifies. `npm run lint` runs Biome + svelte-check. `.svelte` files aren't formatted by Biome yet (Svelte 5 support is partial); rely on svelte-check for those.

## Conventions

- **Tailwind CSS 4** via `@tailwindcss/vite` plugin (no PostCSS config, no `tailwind.config` file)
- **Calm color palette**: Primary sage green (`#7C9885`), secondary lavender (`#9A88B5`), accent peach (`#E8A383`); 8 soft category colors; UI avoids harsh contrasts
- **Dark mode**: CSS class strategy with theme toggle in settings. Convention: `bg-white → dark:bg-neutral-800`, `bg-neutral-50 → dark:bg-neutral-900`, `text-neutral-{700,800,900} → dark:text-neutral-{200,100,50}`, `border-neutral-{100,200} → dark:border-neutral-{800,700}`, color-tinted bgs use `dark:bg-{color}-900/{20-30}`. Bright accent buttons (`bg-primary-500`) need NO dark variant.
- **Dual type system**: Server types (e.g. `CalendarEvent`) extend `BaseRecord`; local types (e.g. `LocalEvent`) add `local_id` and `sync_status`
- **Barrel exports**: Each `src/lib/` subdirectory has an `index.ts` re-exporting its contents
- **i18n**: All user-facing text uses `$t('key')` / `$_('key')` from svelte-i18n; keys organized hierarchically in `src/lib/i18n/locales/{en,sv}.json`. Both files MUST stay key-balanced — verify with the Python structural diff snippet:
  ```bash
  python3 -c "import json; e=json.load(open('src/lib/i18n/locales/en.json')); s=json.load(open('src/lib/i18n/locales/sv.json'));
  def k(d,p=''): out=set();
   [out.update(k(v,(f'{p}.{x}' if p else x))) if isinstance(v,dict) else out.add(f'{p}.{x}' if p else x) for x,v in d.items()];
   return out
  print(sorted(k(e)-k(s)), sorted(k(s)-k(e)))"
  ```
  Avoid the `$_('key') || 'English fallback'` pattern — it masks missing translations.
- **Accessibility**: Support for reduced animations, high contrast mode, configurable time format (12h/24h), and week start day
- **Icons**: `lucide-svelte` for UI icons; `EventIcon` component for emoji/icon display on events. App branding lives at `static/favicon.svg` (vector source); `static/icons/icon-{72…512}.png` and `apple-touch-icon.png` are rsvg-convert outputs from the SVG; `ha-addon/calendhd/{icon,logo}.png` (256×256) likewise.
- **Toasts**: `svelte-sonner` for toast notifications
- **UI primitives**: `bits-ui` for accessible component primitives
- **No backwards-compat layer for the singleton user.** The old hardcoded `calendhd-home-2024` password is **gone**. The bootstrap endpoint is the only way the frontend learns credentials.
