# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

calenDHD is a calm, ADHD-friendly calendar PWA for neurodivergent minds. It's an offline-first, client-only SvelteKit app backed by PocketBase, with IndexedDB (Dexie) as the local data store.

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

SSR is disabled (`export const ssr = false` in `+layout.ts`). The app is built as a static SPA using `@sveltejs/adapter-static` with `fallback: 'index.html'` for client-side routing. PWA capabilities are provided by `@vite-pwa/sveltekit` with Workbox.

### Data Flow: Local-First with Background Sync

1. All mutations write to **IndexedDB (Dexie)** immediately with `sync_status: 'pending'`
2. UI updates optimistically from local data
3. **Sync engine** (`src/lib/sync/engine.ts`) pushes pending changes to PocketBase in the background
4. PocketBase realtime subscriptions pull remote changes back to local
5. Sync runs on: app start, `online` event, and periodic interval (60s)

Sync status values: `'synced' | 'pending' | 'conflict'` (conflicts resolve local-wins for pending items).

### Svelte 5 Runes

All stores use the Svelte 5 rune system (`$state`, `$derived`, `$effect`), not legacy Svelte stores. Store files use the `.svelte.ts` extension.

### Path Aliases

Defined in `svelte.config.js`:
- `$components` → `src/lib/components`
- `$stores` → `src/lib/stores`
- `$db` → `src/lib/db`
- `$api` → `src/lib/api`
- `$sync` → `src/lib/sync`
- `$ical` → `src/lib/ical`
- `$utils` → `src/lib/utils`
- `$types` → `src/lib/types`

### Key Modules

| Module | Path | Purpose |
|--------|------|---------|
| Database | `src/lib/db/index.ts` | Dexie schema (events, categories, templates, subscriptions, external_events, settings, sync_meta) |
| API | `src/lib/api/pocketbase.ts` | PocketBase client, collection helpers, realtime subscriptions |
| Sync | `src/lib/sync/engine.ts` | Offline-first sync: push pending → pull remote → update metadata |
| Stores | `src/lib/stores/*.svelte.ts` | Rune-based stores: auth, calendar, categories, templates, household, settings |
| Schemas | `src/lib/schemas/index.ts` | Zod validation for forms (login, register, event, category, template, subscription) |
| iCal | `src/lib/ical/parser.ts` | Parse external iCal feeds using ical-expander |
| i18n | `src/lib/i18n/` | English (default, sync-loaded) and Swedish (lazy-loaded) via svelte-i18n |
| Date Utils | `src/lib/utils/date.ts` | Timezone-aware date formatting/manipulation via date-fns + date-fns-tz |
| Recurrence | `src/lib/utils/recurrence.ts` | Expand recurrence rules (daily, weekly, biweekly, monthly, yearly) |
| Notifications | `src/lib/utils/notifications.ts` | Web Push API, VAPID key handling |
| Types | `src/lib/types/index.ts` | Core types: CalendarEvent/LocalEvent, Category/LocalCategory, Template, DisplayEvent, RecurrenceRule, UserSettings, Household |

### Routes

- `/` — Redirects to user's default calendar view
- `/calendar/day/[[date]]`, `/calendar/week/[[date]]`, `/calendar/month/[[date]]` — Calendar views (optional date param)
- `/event/new`, `/event/[id]` — Event creation/editing
- `/auth/login`, `/auth/register` — Authentication
- `/categories`, `/templates`, `/subscriptions`, `/household`, `/settings` — Management pages
- `/api/subscriptions/[id]/sync` — Server endpoint for iCal feed sync

### PocketBase Schema

Migrations live in `pocketbase/pb_migrations/`. Collections: users, events, categories, templates, calendar_subscriptions, external_events, user_settings, scheduled_reminders, households, push_subscriptions.

### Deployment Targets

- **Docker**: `docker/` — docker-compose with PocketBase + frontend + optional nginx reverse proxy
- **Home Assistant Add-on**: `ha-addon/` — Full add-on with PocketBase hooks for reminders (`pb_hooks/`), migrations, and build automation
- **Push Service**: `push-service/` — Standalone Node.js web-push notification service

## Conventions

- **Tailwind CSS 4** via `@tailwindcss/vite` plugin (no PostCSS config needed)
- **Calm color palette**: Theme color is sage green (`#7C9885`); UI avoids harsh contrasts
- **Dual type system**: Server types (e.g. `CalendarEvent`) extend `BaseRecord`; local types (e.g. `LocalEvent`) add `local_id` (auto-increment) and `sync_status`
- **Barrel exports**: Each `src/lib/` subdirectory has an `index.ts` re-exporting its contents
- **Forms**: Validated with Zod schemas + `validateForm()` helper from `src/lib/schemas/`
- **i18n**: All user-facing text uses `$t('key')` from svelte-i18n; keys organized hierarchically in `src/lib/i18n/locales/{en,sv}.json`
- **Accessibility**: Support for reduced animations, high contrast mode, configurable time format (12h/24h), and week start day
