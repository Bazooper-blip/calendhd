# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

calenDHD is a calm, ADHD-friendly calendar PWA for neurodivergent minds. It's a client-only SvelteKit app backed by PocketBase, with IndexedDB (Dexie) as the local data store. Each instance serves as a singleton calendar for a single household — there is no multi-user authentication or household sharing; the app auto-logs in a home account (`home@calendhd.local`).

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

PocketBase must be running separately for backend features:
```bash
cd pocketbase && ./pocketbase serve   # Starts on http://127.0.0.1:8090
```

Home Assistant deployment build:
```bash
./build-for-ha.cmd   # Builds frontend + copies to ha-deploy/
```

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
| API | `src/lib/api/pocketbase.ts` | PocketBase client, collection helpers, realtime subscriptions |
| Stores | `src/lib/stores/*.svelte.ts` | Rune-based stores: auth, calendar, categories, templates, settings, routines |
| i18n | `src/lib/i18n/` | English (default, sync-loaded) and Swedish (lazy-loaded) via svelte-i18n |
| Date Utils | `src/lib/utils/date.ts` | Timezone-aware date formatting/manipulation via date-fns + date-fns-tz |
| Recurrence | `src/lib/utils/recurrence.ts` | Recurrence rule formatting and presets |
| Notifications | `src/lib/utils/notifications.ts` | Web Push API, VAPID key handling |
| Types | `src/lib/types/index.ts` | Core types: CalendarEvent/LocalEvent, Category/LocalCategory, Template, RoutineTemplate, DisplayEvent, RecurrenceRule, UserSettings |

### Stores

All stores are singletons using Svelte 5 runes in `.svelte.ts` files:

| Store | Key State | Purpose |
|-------|-----------|---------|
| `auth.svelte.ts` | user, isAuthenticated | Auto-login singleton account with token refresh |
| `calendar.svelte.ts` | currentDate, viewType, events, displayEvents | Calendar state, event CRUD, flexible timing cascade for routine steps |
| `settings.svelte.ts` | settings (11+ keys) | User preferences (theme, locale, timezone, etc.), syncs to server |
| `categories.svelte.ts` | categories | Category CRUD with 8 default colors, reorderable |
| `templates.svelte.ts` | templates | Event template CRUD with local sync |
| `routines.svelte.ts` | routines | Routine template CRUD with active/inactive toggling |

### Components

```
src/lib/components/
├── layout/     Header, Sidebar
├── calendar/   DayView, WeekView, MonthView, EventBlock, RoutineBlock, DayProgress
├── event/      EventForm, QuickAdd
├── ui/         Button, Input, Modal, Select, Toggle, ColorPicker, IconPicker,
│               EventIcon, OfflineIndicator
└── index.ts    Barrel re-export of all subcomponents
```

### Routes

- `/` — Redirects to user's default calendar view
- `/calendar/day/[[date]]`, `/calendar/week/[[date]]`, `/calendar/month/[[date]]` — Calendar views (optional date param)
- `/event/new`, `/event/[id]` — Event creation/editing
- `/routines`, `/routines/new`, `/routines/[id]` — Routine template management
- `/categories`, `/templates`, `/subscriptions`, `/settings` — Management pages

### Dexie Database Schema

7 tables with offline-first sync support (`sync_status: 'synced' | 'pending' | 'conflict' | 'deleted'`):

| Table | Key | Purpose |
|-------|-----|---------|
| events | local_id | Calendar events with recurrence, reminders, routine refs |
| categories | local_id | Color-coded categories with sort_order |
| templates | local_id | Reusable event templates |
| routine_templates | local_id | Routine definitions with steps, schedule, energy levels |
| subscriptions | id | External iCal feed subscriptions |
| external_events | id | Read-only events from subscriptions |
| settings | id | User preferences |

### PocketBase

**Migrations** (`pocketbase/pb_migrations/`):
1. `0001_initial_schema.js` — Core collections: categories, events, templates, calendar_subscriptions, external_events, user_settings, scheduled_reminders
2. `0002_routine_templates.js` — Routine templates collection + routine fields on events
3. `0003_routine_target_end.js` — target_end_time field on routine_templates

**Hooks** (`pocketbase/pb_hooks/`):
- `010_reminder_scheduler.pb.js` — Schedules reminders on event create/update
- `020_reminder_cron.pb.js` — Cron job to send scheduled reminders
- `030_reminder_cleanup.pb.js` — Cleanup old sent reminders
- `040_notification_test.pb.js` — Test notification endpoint
- `050_subscription_sync.pb.js` — Sync external iCal feeds
- `060_routine_generator.pb.js` — Daily cron generates events from active routines; regenerates on routine create/update; cascades delete

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
├── config.yaml              # HA addon config (ingress on 8090, panel_icon: mdi:calendar-heart)
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
- **Ingress**: Port 8090, PocketBase serves both API and static frontend
- **Persistence**: All data stored at `/config/calendhd/` (HA config volume)
- **Options**: `log_level`, `vapid_public_key`, `vapid_private_key`, `vapid_email`
- **Init script** copies hooks, migrations, and frontend to the config volume on each start

**Keeping the addon in sync:**
The `build-for-ha.cmd` script (Windows) and `ha-addon/build-local.sh` (Linux/Mac) automate syncing from the main repo:
- Builds frontend → copies to addon
- Copies `pocketbase/pb_hooks/*` → `ha-addon/calendhd/pb_hooks/`
- Copies `pocketbase/pb_migrations/*` → `ha-addon/calendhd/pb_migrations/`
- Copies `push-service/` → `ha-addon/calendhd/push-service/`

**When adding new hooks or migrations**, always run the build script or manually copy files to `ha-addon/calendhd/` to keep the addon in sync.

## Testing

- **Unit tests**: Vitest with `fake-indexeddb` polyfill (setup in `src/tests/setup.ts`)
- **Test files**: `src/lib/db/index.test.ts`, `src/lib/db/routines.test.ts`, `src/lib/utils/date.test.ts`, `src/lib/utils/recurrence.test.ts`, `src/lib/utils/index.test.ts`
- **E2E tests**: Playwright (via `npm run test:e2e`)
- **No ESLint/Prettier config** — linting is `svelte-check` only

## Conventions

- **Tailwind CSS 4** via `@tailwindcss/vite` plugin (no PostCSS config, no `tailwind.config` file)
- **Calm color palette**: Primary sage green (`#7C9885`), secondary lavender (`#9A88B5`), accent peach (`#E8A383`); 8 soft category colors; UI avoids harsh contrasts
- **Dark mode**: CSS class strategy with theme toggle in settings
- **Dual type system**: Server types (e.g. `CalendarEvent`) extend `BaseRecord`; local types (e.g. `LocalEvent`) add `local_id` and `sync_status`
- **Barrel exports**: Each `src/lib/` subdirectory has an `index.ts` re-exporting its contents
- **i18n**: All user-facing text uses `$t('key')` from svelte-i18n; keys organized hierarchically in `src/lib/i18n/locales/{en,sv}.json`
- **Accessibility**: Support for reduced animations, high contrast mode, configurable time format (12h/24h), and week start day
- **Icons**: `lucide-svelte` for UI icons; `EventIcon` component for emoji/icon display on events
- **Toasts**: `svelte-sonner` for toast notifications
- **UI primitives**: `bits-ui` for accessible component primitives
