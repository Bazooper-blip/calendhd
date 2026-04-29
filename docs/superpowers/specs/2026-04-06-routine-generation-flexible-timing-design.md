# Routine Generation Improvements + Flexible Timing Design

## Overview

Two feature areas for the calenDHD routine system:
1. **Routine generation improvements** - clean regeneration on update, next-day event generation
2. **Flexible routine timing** - steps that start when the previous step completes, with soft deadline warnings

## 1. Flexible Routine Timing

### Data Model Changes

**RoutineStep** gets a new optional field:
```typescript
timing_mode?: 'fixed' | 'flexible'; // defaults to 'fixed'
```

When `'flexible'`, the step's start time is estimated (based on durations from routine start) but adjusts when the previous step is completed.

**RoutineTemplate** gets a new optional field:
```typescript
target_end_time?: string; // HH:mm format, e.g. "07:35"
```

This is a soft deadline. The routine should ideally be done by this time.

No PocketBase schema changes needed - both fields live inside the existing JSON `steps` and routine template fields. `target_end_time` is a new text field on the `routine_templates` collection.

### Event Generation (Server-Side)

When generating events, all steps get events with calculated sequential start/end times regardless of `timing_mode`. Flexible steps use the same time calculation as fixed steps - the times are estimates based on durations. The `timing_mode` only affects client-side behavior on completion.

### Completion Cascade (Client-Side)

When `toggleTaskComplete` is called on a routine step event:
1. The step gets `completed_at` set (existing behavior)
2. If the next step in the same routine has `timing_mode: 'flexible'`:
   - Calculate the actual completion time
   - Update the next step's `start_time` to the completion time
   - Update the next step's `end_time` to `start_time + duration_minutes`
   - Cascade: if that step also feeds into a flexible step, shift it too
3. This happens in the calendar store's `toggleTaskComplete` method
4. Changes sync to server via the existing `updateEvent` flow

When uncompleting a step (toggling back), the shifted times revert to the original calculated times based on the routine's start time and cumulative durations.

### Soft Deadline

The `target_end_time` field on RoutineTemplate is set in the routine builder/edit page as an optional field.

In the RoutineBlock component:
- If `target_end_time` is set, display it (e.g. "done by 07:35")
- Compare the last step's current `end_time` against the target
- Progress pill color changes:
  - Default (bg-black/10): on track
  - Amber (bg-amber-500/30): up to 5 min over target
  - Red (bg-red-500/30): more than 5 min over target

### Routine Builder UI

The routine builder (new + edit pages) needs:
- A toggle or dropdown per step to set `timing_mode` (fixed vs flexible). Default: fixed.
- An optional "Target end time" field after the steps section (time input, HH:mm)
- The timeline preview should show flexible steps with a "~" prefix on their times

## 2. Regeneration on Routine Update

### Current Behavior

The `onRecordAfterUpdateSuccess` hook calls `generateEventsForRoutine` which only adds missing events. It does not remove or update stale events when steps/schedule change.

### New Behavior

The `onRecordAfterUpdateSuccess` hook:
1. Deletes ALL of today's and tomorrow's events for this routine (clean slate)
2. Calls `generateEventsForRoutine` for today and tomorrow to recreate them

This approach:
- Handles renamed steps, changed durations, reordered steps, added/removed steps
- Loses completion state on edit (acceptable - routines are not edited while in progress)
- Is simple to implement

### Implementation

Add a `deleteRoutineEventsForDate(routineId, date)` helper to `routine_helpers.js` that:
```
finds all events where routine_template = routineId AND start_time is on the given date
deletes them
```

The `onRecordAfterUpdateSuccess` hook calls this for today and tomorrow, then regenerates.

## 3. Next-Day Generation

### Changes to generateEventsForRoutine

Add a `targetDate` parameter (defaults to today):
```javascript
generateEventsForRoutine: function(routine, targetDate)
```

The function uses `targetDate` instead of `new Date()` for:
- Day-of-week check (is targetDate's day in the schedule?)
- Building start/end times (use targetDate's year/month/day with the routine's time)
- Duplicate check (query events on targetDate, not today)

### Hook Changes

- **Cron job**: calls `generateEventsForRoutine(routine, today)` and `generateEventsForRoutine(routine, tomorrow)` for each active routine
- **onRecordAfterCreateSuccess**: same - generate for today and tomorrow
- **onRecordAfterUpdateSuccess**: delete events for today and tomorrow, then regenerate both

### Delete on Routine Delete

The existing `onRecordAfterDeleteSuccess` already deletes all events for the routine regardless of date. No change needed.

## 4. RoutineBlock Visual Changes

- Show target end time in header if set (small text, e.g. "by 07:35")
- Progress pill color reflects deadline status (default/amber/red)
- Flexible steps show "~" prefix on their time in the expanded step list to indicate estimated time
- When a flexible step's time has been adjusted by a completion cascade, show the actual time (no "~")

## Data Flow Summary

```
Routine created/updated → PB hook deletes today+tomorrow events → regenerates for both days
                        → Client receives via realtime subscription
                        → displayEvents re-derives with new events

User completes step → toggleTaskComplete sets completed_at
                    → If next step is flexible, shift its start/end times
                    → updateEvent syncs shifted times to server
                    → RoutineBlock re-renders with updated times and progress
```

## Files Affected

| File | Changes |
|------|---------|
| `src/lib/types/index.ts` | Add `timing_mode` to RoutineStep, `target_end_time` to RoutineTemplate |
| `pocketbase/pb_hooks/routine_helpers.js` | Add `targetDate` param, `deleteRoutineEventsForDate` helper |
| `pocketbase/pb_hooks/060_routine_generator.pb.js` | Update hooks for today+tomorrow, delete-before-regenerate on update |
| `pocketbase/pb_migrations/0003_routine_target_end.js` | Add `target_end_time` field to routine_templates collection |
| `src/lib/stores/calendar.svelte.ts` | Extend `toggleTaskComplete` for flexible timing cascade |
| `src/lib/components/calendar/RoutineBlock.svelte` | Deadline warning, flexible time display |
| `src/routes/routines/new/+page.svelte` | Add timing_mode per step, target_end_time field |
| `src/routes/routines/[id]/+page.svelte` | Same as new page |
