# Design: Template default times + Event preview modal

Date: 2026-07-26
Status: Approved

## Overview

Two independent UX changes:

1. **Template default times.** Event templates can optionally store a start and stop
   time of day. Events created from such a template are prefilled with those times;
   the duration is derived from them. Templates without times keep the existing
   duration-only behavior.
2. **Event preview modal.** Clicking an event in any calendar view opens the small
   detail modal (the one external events already use) instead of navigating straight
   to the edit page. For internal events the modal adds an **Edit** button that leads
   to `/event/[id]`. The modal stays read-only otherwise — no delete, no task
   completion (those stay on the edit page and the event-block checkbox).

## 1. Data model & migration

New migration `pocketbase/pb_migrations/0011_template_default_times.js`:

- Adds `default_start_time` (text, optional) and `default_end_time` (text, optional)
  to the `templates` collection. Format: 24-hour `HH:mm` strings (same convention as
  `routine_templates.target_end_time` / `RoutineSchedule.time`).
- No backfill needed — absent values mean "no default time" and preserve current
  behavior.

`Template` in `src/lib/types/index.ts` gains:

```ts
default_start_time?: string; // HH:mm, 24h
default_end_time?: string;   // HH:mm, 24h
```

`default_duration_minutes` is **kept**. When times are set, the template form
computes the derived duration and saves it into `default_duration_minutes`, so the
field never contradicts the times and remains a valid fallback for any
duration-based consumer.

Release note: the migration must be synced to `ha-addon/calendhd/pb_migrations/`
via `./build-for-ha.sh` (repo rule for any migration/hook/src change).

## 2. Template form (`src/routes/templates/+page.svelte`)

For timed (non-all-day) templates:

- New "Set specific time" toggle below the all-day toggle.
  - **Off** (default): today's behavior — duration dropdown only.
  - **On**: duration dropdown is hidden and replaced by two time inputs
    (start, stop), both required to submit (submit stays disabled until both set).
- Duration is derived from the times, including cross-midnight:
  `duration = (end - start + 24h) % 24h` (a `23:00 → 01:00` template is 2 h).
- The template card list shows the time range (e.g. `09:00–10:30`) instead of the
  formatted duration when times are set.
- Editing an existing template pre-fills the toggle from whether both times exist.
  Turning the toggle off clears both time fields on save.
- All-day templates never show time controls. Both "toggle off" and "all-day on"
  clear the stored times **on save** (form state is kept while the modal is open,
  so toggling back and forth doesn't lose input).

i18n: new key for the toggle label (e.g. `template.setSpecificTime`); reuse existing
`event.startTime` / `event.endTime` for the inputs. Both `en.json` and `sv.json`
must be updated and stay key-balanced.

## 3. Applying a template (`EventForm.applyTemplate`)

In `src/lib/components/event/EventForm.svelte`:

- If the template has **both** times and is not all-day:
  - `startTime = default_start_time`, `endTime = default_end_time` (overwriting
    whatever the form had — the template's times are the point of picking it).
  - `endDate = startDate`, bumped one calendar day when `end <= start`
    (cross-midnight).
  - The start **date** is never touched — the user still picks when.
- Otherwise: exact current behavior (end = chosen start + `default_duration_minutes`).

The cross-midnight math is extracted into small pure helpers (see Testing) shared
by the template form and `applyTemplate`.

## 4. `EventDetailModal` (refactor of `ExternalEventModal`)

`src/lib/components/calendar/ExternalEventModal.svelte` is renamed to
`EventDetailModal.svelte` (barrel `index.ts` updated). Same props
(`event: DisplayEvent | null`, `onclose`), same `Modal size="md"` shell, branching
on `event.is_external`:

- **External branch**: pixel-identical to today — subscription badge, read-only
  chip, date/time block, location, description, reminder row. The subscription
  fetch only runs for external events.
- **Internal branch**:
  - Category chip (event color dot + category name) when a category is set.
  - Same date/time block (smart date label + time range / all-day).
  - Description, when present (`whitespace-pre-line break-words`, as external).
  - Footer with a single **Edit** button (`$_('event.edit')` — "Edit Event") that
    closes the modal and `goto`s `/event/[id]`.

No delete button, no task-completion control, no reminder row for internal events.

## 5. View wiring

In `AgendaView.svelte`, `WeekView.svelte`, `MonthView.svelte`:

- `handleEventClick` always opens the modal (`detail = event`); the
  `goto('/event/{id}')` branch for internal events is removed.
- The `externalDetail` state is renamed (e.g. `eventDetail`), and the modal import
  updated to `EventDetailModal`.
- Day view needs no change — `DayView` delegates to `AgendaView`.
- Routine blocks/steps are untouched: they render via `RoutineBlock` and never go
  through `handleEventClick`.
- The task checkbox on `EventBlock` already `stopPropagation()`s, so completing a
  task still won't open the modal.

## 6. Error handling & edge cases

- Cross-midnight template times: handled in both derived duration (form) and end
  date bump (applyTemplate).
- Template with only one of the two times (possible only via API edits): treated as
  "no times" — falls back to duration behavior.
- Old templates (no times): unchanged behavior everywhere.
- Modal on an event whose record vanished server-side is not a new concern — the
  modal renders from the already-loaded `DisplayEvent`.

## 7. Testing

- **Unit (Vitest, node env)**: pure helpers in `src/lib/utils/` —
  `deriveDurationMinutes(start, end)` (incl. cross-midnight, zero-length) and the
  end-date bump logic; cases added under `src/lib/utils/`.
- **Type/lint**: `npm run check` and `npm run test` must pass; i18n structural diff
  between `en.json` and `sv.json` must be empty.
- No E2E suite exists; manual smoke: create timed template → new event from it →
  times prefilled; click internal/external events in day, week, month views.

## Out of scope

- QuickAdd does not use templates today; that stays as-is.
- Routine interaction patterns.
- Any change to the external-event modal content.
