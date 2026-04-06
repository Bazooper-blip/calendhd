# Routine Generation Improvements + Flexible Timing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve routine event generation (delete+regenerate on update, next-day events) and add flexible step timing with soft deadlines.

**Architecture:** Server-side changes to PB hooks add a `targetDate` parameter and a delete-before-regenerate flow. Client-side changes extend `toggleTaskComplete` to cascade time shifts for flexible steps. A new PB migration adds `target_end_time` to routine_templates. RoutineBlock gets deadline visuals and flexible time indicators.

**Tech Stack:** PocketBase hooks (CommonJS modules), Svelte 5 runes, Tailwind CSS 4, date-fns

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/types/index.ts` | Modify | Add `timing_mode` to RoutineStep, `target_end_time` to RoutineTemplate |
| `pocketbase/pb_migrations/0003_routine_target_end.js` | Create | Add `target_end_time` text field to routine_templates collection |
| `pocketbase/pb_hooks/routine_helpers.js` | Modify | Add `targetDate` param, `deleteRoutineEventsForDate` helper |
| `pocketbase/pb_hooks/060_routine_generator.pb.js` | Modify | Update hooks for today+tomorrow, delete-before-regenerate |
| `src/lib/stores/calendar.svelte.ts` | Modify | Extend `toggleTaskComplete` for flexible timing cascade |
| `src/lib/components/calendar/RoutineBlock.svelte` | Modify | Deadline warning, flexible time "~" prefix, deadline colors |
| `src/routes/routines/new/+page.svelte` | Modify | Add timing_mode toggle per step, target_end_time field |
| `src/routes/routines/[id]/+page.svelte` | Modify | Same UI additions as new page |

---

### Task 1: Type changes and PB migration

Add the new fields to TypeScript types and PocketBase schema.

**Files:**
- Modify: `src/lib/types/index.ts`
- Create: `pocketbase/pb_migrations/0003_routine_target_end.js`

- [ ] **Step 1: Add `timing_mode` to RoutineStep**

In `src/lib/types/index.ts`, change the RoutineStep interface (around line 42):

```typescript
export interface RoutineStep {
	title: string;
	duration_minutes: number;
	icon?: string;
	category?: string;
	energy_level?: EnergyLevel;
	timing_mode?: 'fixed' | 'flexible';
}
```

- [ ] **Step 2: Add `target_end_time` to RoutineTemplate**

In the same file, change the RoutineTemplate interface (around line 57):

```typescript
export interface RoutineTemplate extends BaseRecord {
	user: string;
	name: string;
	steps: RoutineStep[];
	schedule: RoutineSchedule;
	is_active: boolean;
	color?: string;
	icon?: string;
	target_end_time?: string;
}
```

- [ ] **Step 3: Create PB migration for target_end_time**

Create `pocketbase/pb_migrations/0003_routine_target_end.js`:

```javascript
/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = app.findCollectionByNameOrId("routine_templates");

  collection.fields.add(new TextField({
    name: "target_end_time",
    required: false,
    max: 5
  }));

  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("routine_templates");
  collection.fields.removeByName("target_end_time");
  app.save(collection);
});
```

- [ ] **Step 4: Run type check**

Run: `npm run check`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/types/index.ts pocketbase/pb_migrations/0003_routine_target_end.js
git commit -m "feat(routines): add timing_mode to RoutineStep and target_end_time to RoutineTemplate"
```

---

### Task 2: Server-side generation improvements

Add `targetDate` parameter to `generateEventsForRoutine`, add `deleteRoutineEventsForDate` helper, and update all hooks for today+tomorrow generation with delete-before-regenerate on update.

**Files:**
- Modify: `pocketbase/pb_hooks/routine_helpers.js`
- Modify: `pocketbase/pb_hooks/060_routine_generator.pb.js`

- [ ] **Step 1: Update routine_helpers.js**

Replace the full content of `pocketbase/pb_hooks/routine_helpers.js` with:

```javascript
// Shared helpers for routine event generation (loaded via require() inside hooks)

// PB JSVM returns JSON fields as byte arrays from record.get().
// This helper converts them to parsed objects.
function parseJsonField(value) {
    if (!value) return null;
    if (typeof value === "string") {
        try { return JSON.parse(value); } catch (e) { return null; }
    }
    // Already a proper object with expected properties
    if (typeof value === "object" && !Array.isArray(value)) return value;
    // Byte array: array of numbers representing ASCII/UTF-8 chars
    if (Array.isArray(value) || (typeof value === "object" && typeof value.length === "number")) {
        try {
            var str = String.fromCharCode.apply(null, value);
            return JSON.parse(str);
        } catch (e) { return null; }
    }
    return value;
}

module.exports = {
    // Delete all routine events for a specific date
    deleteRoutineEventsForDate: function(routineId, targetDate) {
        var dayStart = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 0, 0, 0);
        var dayEnd = new Date(targetDate.getFullYear(), targetDate.getMonth(), targetDate.getDate(), 23, 59, 59);

        var events;
        try {
            events = $app.findRecordsByFilter("events",
                "routine_template = {:rid} && start_time >= {:start} && start_time <= {:end}",
                "", 100, 0,
                { rid: routineId, start: dayStart.toISOString(), end: dayEnd.toISOString() }
            );
        } catch (err) {
            return; // No events found
        }

        for (var i = 0; i < events.length; i++) {
            try { $app.delete(events[i]); } catch (err) { /* ignore */ }
        }
    },

    // Generate events for a single routine on a specific date
    generateEventsForRoutine: function(routine, targetDate) {
        var now = targetDate || new Date();

        var schedule = parseJsonField(routine.get("schedule"));
        if (!schedule || !schedule.days || !schedule.time) return;

        var dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
        var targetDayName = dayNames[now.getDay()];

        if (schedule.days.indexOf(targetDayName) === -1) return;

        var steps = parseJsonField(routine.get("steps"));
        if (!steps || !steps.length) return;

        var routineId = routine.id;
        var userId = routine.get("user");
        var timeParts = schedule.time.split(":");
        var startHour = parseInt(timeParts[0], 10);
        var startMinute = parseInt(timeParts[1], 10);
        var currentTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), startHour, startMinute, 0);

        for (var stepIdx = 0; stepIdx < steps.length; stepIdx++) {
            var step = steps[stepIdx];
            var dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
            var dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);

            var existing;
            try {
                existing = $app.findRecordsByFilter("events",
                    "routine_template = {:rid} && routine_step_index = {:idx} && start_time >= {:start} && start_time <= {:end}",
                    "", 1, 0,
                    { rid: routineId, idx: stepIdx, start: dayStart.toISOString(), end: dayEnd.toISOString() }
                );
            } catch (err) {
                existing = [];
            }

            if (existing && existing.length > 0) {
                currentTime = new Date(currentTime.getTime() + (step.duration_minutes || 15) * 60000);
                continue;
            }

            var endTime = new Date(currentTime.getTime() + (step.duration_minutes || 15) * 60000);

            try {
                var collection = $app.findCollectionByNameOrId("events");
                var record = new Record(collection);
                record.set("user", userId);
                record.set("title", step.title);
                record.set("start_time", currentTime.toISOString());
                record.set("end_time", endTime.toISOString());
                record.set("is_all_day", false);
                record.set("is_task", true);
                record.set("icon", step.icon || routine.get("icon") || "");
                record.set("color_override", routine.get("color") || "");
                record.set("routine_template", routineId);
                record.set("routine_step_index", stepIdx);
                record.set("energy_level", step.energy_level || "medium");
                record.set("reminders", JSON.stringify([]));
                if (step.category) {
                    record.set("category", step.category);
                }
                $app.save(record);
            } catch (err) {
                console.log("[routine-gen] Failed to create event for step " + stepIdx + ": " + err);
            }

            currentTime = endTime;
        }
    },

    // Generate events for all active routines (today + tomorrow)
    generateAllRoutineEvents: function() {
        var routines;
        try {
            routines = $app.findRecordsByFilter("routine_templates", "is_active = true", "", 100, 0);
        } catch (err) {
            return;
        }
        if (!routines || routines.length === 0) return;

        var today = new Date();
        var tomorrow = new Date(today.getTime() + 86400000);

        var self = this;
        for (var i = 0; i < routines.length; i++) {
            self.generateEventsForRoutine(routines[i], today);
            self.generateEventsForRoutine(routines[i], tomorrow);
        }
    }
};
```

- [ ] **Step 2: Update 060_routine_generator.pb.js**

Replace the full content of `pocketbase/pb_hooks/060_routine_generator.pb.js` with:

```javascript
/// <reference path="../pb_data/types.d.ts" />

// Daily cron: generate events from active routine templates (today + tomorrow)
cronAdd("routine_generator", "0 4 * * *", () => {
    const helpers = require(`${__hooks}/routine_helpers.js`);
    helpers.generateAllRoutineEvents();
});

// Generate on routine create (today + tomorrow)
onRecordAfterCreateSuccess("routine_templates", (e) => {
    const helpers = require(`${__hooks}/routine_helpers.js`);
    const routine = e.record;
    if (routine.get("is_active")) {
        const today = new Date();
        const tomorrow = new Date(today.getTime() + 86400000);
        helpers.generateEventsForRoutine(routine, today);
        helpers.generateEventsForRoutine(routine, tomorrow);
    }
});

// Delete + regenerate on routine update (today + tomorrow)
onRecordAfterUpdateSuccess("routine_templates", (e) => {
    const helpers = require(`${__hooks}/routine_helpers.js`);
    const routine = e.record;
    const today = new Date();
    const tomorrow = new Date(today.getTime() + 86400000);

    // Clean slate: delete all events for today and tomorrow
    helpers.deleteRoutineEventsForDate(routine.id, today);
    helpers.deleteRoutineEventsForDate(routine.id, tomorrow);

    // Regenerate if active
    if (routine.get("is_active")) {
        helpers.generateEventsForRoutine(routine, today);
        helpers.generateEventsForRoutine(routine, tomorrow);
    }
});

// Cascade delete: remove all generated events when routine is deleted
onRecordAfterDeleteSuccess("routine_templates", (e) => {
    const routineId = e.record.id;
    try {
        const events = $app.findRecordsByFilter("events", "routine_template = {:rid}", "", 100, 0, { rid: routineId });
        for (let i = 0; i < events.length; i++) {
            try { $app.delete(events[i]); } catch (err) { /* ignore */ }
        }
    } catch (err) { /* No events to delete */ }
});
```

- [ ] **Step 3: Restart PocketBase and test**

Restart PocketBase to apply migration and reload hooks. Then test:

```
powershell -NoProfile -Command "Invoke-RestMethod -Uri 'http://127.0.0.1:8090/api/routines/generate' -Method Post | ConvertTo-Json -Depth 5"
```

Note: the debug endpoint was removed in the cleanup. If needed, temporarily add it back to test. Otherwise verify by checking tomorrow's events appear in the calendar.

- [ ] **Step 4: Commit**

```bash
git add pocketbase/pb_hooks/routine_helpers.js pocketbase/pb_hooks/060_routine_generator.pb.js
git commit -m "feat(routines): next-day generation and delete+regenerate on update"
```

---

### Task 3: Flexible timing cascade in calendar store

Extend `toggleTaskComplete` to shift subsequent flexible steps when a step is completed.

**Files:**
- Modify: `src/lib/stores/calendar.svelte.ts`

- [ ] **Step 1: Read the current toggleTaskComplete and surrounding code**

Read `src/lib/stores/calendar.svelte.ts` lines 400-420 to see exact context.

- [ ] **Step 2: Replace toggleTaskComplete with cascade logic**

Find the existing `toggleTaskComplete` method (around line 408) and replace it with:

```typescript
// Toggle task completion with flexible timing cascade
async toggleTaskComplete(id: string) {
	const event = events.find((e) => e.id === id);
	if (!event || !event.is_task) return;

	const completed_at = event.completed_at ? undefined : new Date().toISOString();
	await this.updateEvent(id, { completed_at });

	// Flexible timing cascade for routine steps
	if (event.routine_template && event.routine_step_index !== undefined) {
		const routineTemplate = routinesStore.getById(event.routine_template);
		if (!routineTemplate) return;

		const routineSteps = routineTemplate.steps;
		const currentStepIdx = event.routine_step_index;

		// Find all events for this routine today, sorted by step index
		const routineEvents = events
			.filter((e) =>
				e.routine_template === event.routine_template &&
				e.start_time &&
				new Date(e.start_time).toDateString() === new Date(event.start_time).toDateString()
			)
			.sort((a, b) => (a.routine_step_index ?? 0) - (b.routine_step_index ?? 0));

		if (completed_at) {
			// Completing: shift subsequent flexible steps from completion time
			let cursor = new Date(completed_at);

			for (let i = currentStepIdx + 1; i < routineSteps.length; i++) {
				const step = routineSteps[i];
				if (step.timing_mode !== 'flexible') break;

				const nextEvent = routineEvents.find((e) => e.routine_step_index === i);
				if (!nextEvent) continue;

				const duration = (step.duration_minutes || 15) * 60000;
				const newStart = cursor.toISOString();
				const newEnd = new Date(cursor.getTime() + duration).toISOString();

				await this.updateEvent(nextEvent.id, {
					start_time: newStart,
					end_time: newEnd
				});

				cursor = new Date(cursor.getTime() + duration);
			}
		} else {
			// Uncompleting: revert subsequent flexible steps to original calculated times
			const scheduleTime = routineTemplate.schedule.time;
			const [hStr, mStr] = scheduleTime.split(':');
			const baseDate = new Date(event.start_time);
			let cursor = new Date(
				baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(),
				parseInt(hStr, 10), parseInt(mStr, 10), 0
			);

			// Walk from step 0 to rebuild original times
			for (let i = 0; i < routineSteps.length; i++) {
				const step = routineSteps[i];
				const duration = (step.duration_minutes || 15) * 60000;

				if (i > currentStepIdx && step.timing_mode === 'flexible') {
					const nextEvent = routineEvents.find((e) => e.routine_step_index === i);
					if (nextEvent) {
						await this.updateEvent(nextEvent.id, {
							start_time: cursor.toISOString(),
							end_time: new Date(cursor.getTime() + duration).toISOString()
						});
					}
				}

				cursor = new Date(cursor.getTime() + duration);
			}
		}
	}
},
```

- [ ] **Step 3: Run type check**

Run: `npm run check`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/stores/calendar.svelte.ts
git commit -m "feat(routines): flexible timing cascade on step completion"
```

---

### Task 4: RoutineBlock visual changes

Add deadline display, deadline status colors, and flexible time "~" prefix.

**Files:**
- Modify: `src/lib/components/calendar/RoutineBlock.svelte`

- [ ] **Step 1: Add target_end_time and timing_mode to RoutineBlock props**

Read the current `RoutineBlock.svelte`. In the `RoutineStep` interface add `timing_mode`:

```typescript
interface RoutineStep {
	id: string;
	title: string;
	start: Date;
	end?: Date;
	icon?: string;
	energy_level?: EnergyLevel;
	is_completed: boolean;
	timing_mode?: 'fixed' | 'flexible';
}
```

Add `target_end_time` to Props:

```typescript
interface Props {
	routine_template: string;
	routine_group_name: string;
	color: string;
	icon?: string;
	steps: RoutineStep[];
	style?: string;
	compact?: boolean;
	target_end_time?: string;
}
```

Add it to the destructure:

```typescript
let {
	routine_template,
	routine_group_name,
	color,
	icon,
	steps,
	style = '',
	compact = false,
	target_end_time
}: Props = $props();
```

- [ ] **Step 2: Add deadline status derived**

After the existing `allDone` derived, add:

```typescript
// Deadline status: compare last step's end time against target
const deadlineStatus = $derived.by(() => {
	if (!target_end_time || steps.length === 0) return 'on-track';
	const lastStep = steps[steps.length - 1];
	if (!lastStep.end) return 'on-track';

	const [h, m] = target_end_time.split(':').map(Number);
	const targetMin = h * 60 + m;
	const endMin = lastStep.end.getHours() * 60 + lastStep.end.getMinutes();
	const overBy = endMin - targetMin;

	if (overBy <= 0) return 'on-track';
	if (overBy <= 5) return 'warning';
	return 'over';
});
```

- [ ] **Step 3: Update the progress pill to reflect deadline status**

Replace the progress pill span with:

```svelte
<!-- Progress pill -->
<span class={cn(
	'flex-shrink-0 text-[10px] font-medium rounded-full px-1.5',
	allDone ? 'bg-white/30'
		: deadlineStatus === 'over' ? 'bg-red-500/30'
		: deadlineStatus === 'warning' ? 'bg-amber-500/30'
		: 'bg-black/10'
)}>
	{completedCount}/{steps.length}
</span>
```

- [ ] **Step 4: Add target end time display in header**

After the progress pill (before the edit icon), add:

```svelte
{#if target_end_time}
	<span class={cn(
		'flex-shrink-0 text-[9px] opacity-60',
		deadlineStatus === 'over' && 'opacity-90 text-red-200',
		deadlineStatus === 'warning' && 'opacity-80'
	)}>
		by {target_end_time}
	</span>
{/if}
```

- [ ] **Step 5: Add "~" prefix for flexible step times in expanded view**

In the expanded step list, find the time display `<span>` (the `formatTime(step.start, format24h)` line) and replace it with:

```svelte
<span class="flex-shrink-0 opacity-60 ml-auto">
	{#if step.timing_mode === 'flexible' && !step.is_completed}~{/if}{formatTime(step.start, format24h)}
</span>
```

- [ ] **Step 6: Run type check**

Run: `npm run check`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/calendar/RoutineBlock.svelte
git commit -m "feat(routines): deadline warnings and flexible time display in RoutineBlock"
```

---

### Task 5: Pass new fields through view grouping logic

The DayView and WeekView grouping logic needs to pass `timing_mode` and `target_end_time` through to RoutineBlock.

**Files:**
- Modify: `src/lib/components/calendar/WeekView.svelte`
- Modify: `src/lib/components/calendar/DayView.svelte`

- [ ] **Step 1: Update RoutineGroup interface in WeekView.svelte**

Add `timing_mode` to the steps array and `target_end_time` to the group:

```typescript
interface RoutineGroup {
	kind: 'routine-group';
	routine_template: string;
	routine_group_name: string;
	color: string;
	icon?: string;
	start: Date;
	end: Date;
	target_end_time?: string;
	steps: Array<{
		id: string;
		title: string;
		start: Date;
		end?: Date;
		icon?: string;
		energy_level?: EnergyLevel;
		is_completed: boolean;
		timing_mode?: 'fixed' | 'flexible';
	}>;
}
```

- [ ] **Step 2: Update grouping logic in WeekView to pass the new fields**

In `getProcessedEventsForDay`, in the `processed.push(...)` block, add `timing_mode` to the step mapping and `target_end_time` to the group. The step mapping should become:

```typescript
steps: sorted.map((e) => ({
	id: e.id,
	title: e.title,
	start: e.start,
	end: e.end,
	icon: e.icon,
	energy_level: e.energy_level,
	is_completed: e.is_completed,
	timing_mode: e.original_event && 'routine_step_index' in e.original_event
		? routinesStore.getById(templateId)?.steps[e.original_event.routine_step_index ?? 0]?.timing_mode
		: undefined
}))
```

And add to the group object (after `end: latest`):

```typescript
target_end_time: routinesStore.getById(templateId)?.target_end_time,
```

- [ ] **Step 3: Update RoutineBlock usage in WeekView to pass target_end_time**

Find the `<RoutineBlock` usage and add the prop:

```svelte
<RoutineBlock
	routine_template={item.routine_template}
	routine_group_name={item.routine_group_name}
	color={item.color}
	icon={item.icon}
	steps={item.steps}
	style="top: {pos.top}%; height: {pos.height}%;"
	compact={true}
	target_end_time={item.target_end_time}
/>
```

- [ ] **Step 4: Apply identical changes to DayView.svelte**

Make the same three changes to DayView:
1. Add `timing_mode` to RoutineGroup steps and `target_end_time` to the group interface
2. Update the step mapping in `processedDayEvents` with the same `timing_mode` lookup
3. Add `target_end_time` to the group object
4. Pass `target_end_time` prop to `<RoutineBlock>`

The RoutineBlock usage in DayView (no `compact`):

```svelte
<RoutineBlock
	routine_template={item.routine_template}
	routine_group_name={item.routine_group_name}
	color={item.color}
	icon={item.icon}
	steps={item.steps}
	style="top: {pos.top}%; height: {pos.height}%;"
	target_end_time={item.target_end_time}
/>
```

- [ ] **Step 5: Add routinesStore import if missing**

Both WeekView and DayView need access to `routinesStore`. Check if it's already imported from `$stores`. If not, add it:

```typescript
import { calendar, settingsStore, routinesStore } from '$stores';
```

- [ ] **Step 6: Run type check**

Run: `npm run check`
Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/calendar/WeekView.svelte src/lib/components/calendar/DayView.svelte
git commit -m "feat(routines): pass timing_mode and target_end_time through view grouping"
```

---

### Task 6: Routine builder UI - timing_mode and target_end_time

Add per-step timing mode toggle and target end time field to both the new and edit routine pages.

**Files:**
- Modify: `src/routes/routines/new/+page.svelte`
- Modify: `src/routes/routines/[id]/+page.svelte`

- [ ] **Step 1: Update new/+page.svelte - add target_end_time state**

After the existing `let scheduleTime = $state('07:00');` line, add:

```typescript
let targetEndTime = $state('');
```

- [ ] **Step 2: Add timing_mode to addStep and step management**

Update the default step in the `steps` initial state and `addStep` function to include `timing_mode`:

Change the initial steps state:
```typescript
let steps = $state<RoutineStep[]>([
	{ title: '', duration_minutes: 10, energy_level: 'medium', timing_mode: 'fixed' }
]);
```

Change the `addStep` function:
```typescript
function addStep() {
	steps = [...steps, { title: '', duration_minutes: 10, energy_level: 'medium', timing_mode: 'flexible' }];
}
```

Note: first step defaults to `fixed`, subsequent steps default to `flexible`.

Add a `updateStepTimingMode` function after the existing update functions:

```typescript
function updateStepTimingMode(index: number, value: string) {
	const next = [...steps];
	next[index] = { ...next[index], timing_mode: value as 'fixed' | 'flexible' };
	steps = next;
}
```

- [ ] **Step 3: Update the timeline preview to show "~" for flexible steps**

In the `timeline` derived, add `timing_mode` to the returned object:

```typescript
return {
	title: step.title,
	start: fmt(startMin),
	end: fmt(endMin),
	energy: step.energy_level ?? 'medium',
	timing_mode: step.timing_mode ?? 'fixed'
};
```

In the timeline preview template section, update the time display to show "~" prefix for flexible steps. Find the `{item.start} – {item.end}` display and change it to:

```svelte
<div class="text-xs font-mono text-neutral-500 dark:text-neutral-400 w-24 shrink-0">
	{#if item.timing_mode === 'flexible'}~{/if}{item.start} – {item.end}
</div>
```

- [ ] **Step 4: Add timing mode selector per step in the form**

In the step form section, after the energy level `<Select>` block, add a timing mode toggle:

```svelte
<div class="flex-1">
	<label for="step-timing-{i}" class="block text-xs text-neutral-500 dark:text-neutral-400 mb-1">
		Timing
	</label>
	<Select
		id="step-timing-{i}"
		options={[
			{ value: 'fixed', label: 'Fixed' },
			{ value: 'flexible', label: 'Flexible' }
		]}
		value={step.timing_mode ?? 'fixed'}
		onchange={(e) => updateStepTimingMode(i, (e.target as HTMLSelectElement).value)}
	/>
</div>
```

- [ ] **Step 5: Add target end time field**

After the Steps section (before the Timeline preview section), add:

```svelte
<!-- 3b. Target end time -->
<div class="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-100 dark:border-neutral-700 p-4 space-y-4">
	<h2 class="text-sm font-semibold text-neutral-600 dark:text-neutral-400 uppercase tracking-wide">
		Target end time
	</h2>
	<div>
		<label for="target-end-time" class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">
			Routine should be done by (optional)
		</label>
		<Input id="target-end-time" type="time" bind:value={targetEndTime} class="max-w-[10rem]" />
	</div>
</div>
```

- [ ] **Step 6: Pass target_end_time in handleSave**

Update the `routinesStore.create()` call in `handleSave` to include `target_end_time`:

```typescript
await routinesStore.create({
	name,
	steps: $state.snapshot(steps),
	schedule: {
		days: $state.snapshot(scheduleDays) as any,
		time: scheduleTime
	},
	is_active: true,
	color: color || undefined,
	icon: icon || undefined,
	target_end_time: targetEndTime || undefined
});
```

- [ ] **Step 7: Apply identical changes to edit page**

In `src/routes/routines/[id]/+page.svelte`, make the same changes:

1. Add `let targetEndTime = $state('');` state
2. Add `updateStepTimingMode` function
3. Update timeline preview with `timing_mode` and "~" prefix
4. Add timing mode selector per step
5. Add target end time field section
6. Pass `target_end_time` in the `routinesStore.update()` call in `handleSave`
7. Load the existing `target_end_time` from the routine when populating form state (in the `$effect` that loads the routine data, add: `targetEndTime = existingRoutine.target_end_time ?? '';`)

- [ ] **Step 8: Update routines store create/update signatures**

In `src/lib/stores/routines.svelte.ts`, add `target_end_time` to the create method's data parameter type:

```typescript
async create(data: {
	name: string;
	steps: RoutineStep[];
	schedule: RoutineSchedule;
	is_active: boolean;
	color?: string;
	icon?: string;
	target_end_time?: string;
}) {
```

No change needed for `update` since it already accepts `Partial<RoutineTemplate>`.

- [ ] **Step 9: Run type check**

Run: `npm run check`
Expected: 0 errors

- [ ] **Step 10: Commit**

```bash
git add src/routes/routines/new/+page.svelte src/routes/routines/[id]/+page.svelte src/lib/stores/routines.svelte.ts
git commit -m "feat(routines): add timing mode and target end time to routine builder"
```

---

### Task 7: Add DisplayEvent support for routine_step_index

The flexible timing cascade in Task 3 needs `routine_step_index` on `DisplayEvent`. Currently only `routine_template` is passed through.

**Files:**
- Modify: `src/lib/types/index.ts`
- Modify: `src/lib/stores/calendar.svelte.ts`

- [ ] **Step 1: Add routine_step_index to DisplayEvent type**

In `src/lib/types/index.ts`, in the DisplayEvent interface (around line 202), add:

```typescript
routine_step_index?: number;
```

- [ ] **Step 2: Pass it through in displayEvents derivation**

In `src/lib/stores/calendar.svelte.ts`, in the displayEvents getter where calendar events are converted (around line 118), add after the `routine_template` line:

```typescript
routine_step_index: event.routine_step_index,
```

- [ ] **Step 3: Run type check**

Run: `npm run check`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/types/index.ts src/lib/stores/calendar.svelte.ts
git commit -m "feat(routines): pass routine_step_index through to DisplayEvent"
```
