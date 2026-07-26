# Template Default Times + Event Preview Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Templates can optionally store a start/stop time of day that prefills new events created from them; clicking any event in any calendar view opens a small read-only detail modal, with an Edit button for internal events.

**Architecture:** Two independent changes on one branch. (1) A PocketBase migration adds `default_start_time`/`default_end_time` (`HH:mm` text) to `templates`; the template form gains a "Set specific time" toggle that swaps the duration dropdown for two time inputs; `EventForm.applyTemplate` prefills those times. (2) `ExternalEventModal.svelte` is renamed to `EventDetailModal.svelte` and gains an internal-event branch; the three calendar views always open it instead of navigating on click.

**Tech Stack:** SvelteKit (Svelte 5 runes), PocketBase JS migrations, date-fns, svelte-i18n, Vitest (node env), Biome.

**Spec:** `docs/superpowers/specs/2026-07-26-template-times-and-event-preview-modal-design.md`

## Global Constraints

- Branch: `claude/template-times-event-modal` (already created; spec committed on it).
- Svelte 5 runes only (`$state`, `$derived`, `$props`, `$bindable`) — never legacy stores or `$:`.
- All user-facing text via svelte-i18n (`$t('key')` in routes, `$_('key')` in components importing from `$lib/i18n`). NEVER `$_('key') || 'fallback'`.
- `src/lib/i18n/locales/en.json` and `sv.json` must stay key-balanced (verification command in Task 3).
- Dark mode conventions: `bg-white → dark:bg-neutral-800`, `text-neutral-{700,800} → dark:text-neutral-{200,100}`, `border-neutral-{100,200} → dark:border-neutral-{800,700}`.
- Time-of-day strings are 24-hour zero-padded `HH:mm` (same convention as `RoutineSchedule.time`).
- Verification commands: `npx vitest run` (tests), `npm run check` (svelte-check). Both must pass before every commit.
- Commit messages end with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.

---

### Task 1: Time-of-day helpers in date utils

**Files:**
- Modify: `src/lib/utils/date.ts` (append after `parseTimeToDate`, ~line 104)
- Test: `src/lib/utils/date.test.ts` (append new describes at end of file)

**Interfaces:**
- Consumes: nothing new.
- Produces: `deriveDurationMinutes(start: string, end: string): number` and `timeCrossesMidnight(start: string, end: string): boolean`, exported from `$utils` (the barrel `src/lib/utils/index.ts` already does `export * from './date'` — verify in Step 3, add the re-export only if missing). Tasks 3 and 4 import both from `$utils`.

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/utils/date.test.ts`, adding `deriveDurationMinutes, timeCrossesMidnight` to the existing `./date` import at the top of the file:

```ts
describe('deriveDurationMinutes', () => {
	it('computes a same-day duration', () => {
		expect(deriveDurationMinutes('09:00', '10:30')).toBe(90);
	});

	it('computes a cross-midnight duration', () => {
		expect(deriveDurationMinutes('23:00', '01:00')).toBe(120);
	});

	it('returns 0 for equal times', () => {
		expect(deriveDurationMinutes('09:00', '09:00')).toBe(0);
	});
});

describe('timeCrossesMidnight', () => {
	it('is false for a same-day range', () => {
		expect(timeCrossesMidnight('09:00', '17:00')).toBe(false);
	});

	it('is true when end is before start', () => {
		expect(timeCrossesMidnight('23:00', '01:00')).toBe(true);
	});

	it('is false for equal times', () => {
		expect(timeCrossesMidnight('09:00', '09:00')).toBe(false);
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/utils/date.test.ts`
Expected: FAIL — `deriveDurationMinutes is not a function` (or import error).

- [ ] **Step 3: Implement the helpers**

Append to `src/lib/utils/date.ts`:

```ts
/**
 * Minutes between two HH:mm times of day. A range that wraps past
 * midnight (end before start) counts as next-day: 23:00→01:00 = 120.
 */
export function deriveDurationMinutes(start: string, end: string): number {
	const [sh, sm] = start.split(':').map(Number);
	const [eh, em] = end.split(':').map(Number);
	return (eh * 60 + em - (sh * 60 + sm) + 1440) % 1440;
}

/** True when an HH:mm range wraps past midnight (end strictly before start). */
export function timeCrossesMidnight(start: string, end: string): boolean {
	return end < start;
}
```

(Lexicographic `<` is correct for zero-padded `HH:mm` strings.)

Then open `src/lib/utils/index.ts` and confirm it re-exports `./date` (it must, since `formatDuration` is already imported from `$utils` elsewhere). If it doesn't, add `export * from './date';`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/utils/date.test.ts`
Expected: PASS (all new + existing cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/utils/date.ts src/lib/utils/date.test.ts
git commit -m "feat(utils): add HH:mm duration + cross-midnight helpers

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 2: Migration 0011 + Template type + store signature

**Files:**
- Create: `pocketbase/pb_migrations/0011_template_default_times.js`
- Modify: `src/lib/types/index.ts:25-35` (`Template` interface)
- Modify: `src/lib/stores/templates.svelte.ts:45-53` (`create()` data param type)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `Template.default_start_time?: string` and `Template.default_end_time?: string` (both `HH:mm`). Tasks 3 and 4 read these fields; Task 3 passes them to `templatesStore.create/update`.

- [ ] **Step 1: Write the migration**

Create `pocketbase/pb_migrations/0011_template_default_times.js` (pattern copied from `0003_routine_target_end.js`):

```js
/// <reference path="../pb_data/types.d.ts" />

migrate((app) => {
  const collection = app.findCollectionByNameOrId("templates");

  collection.fields.add(new TextField({
    name: "default_start_time",
    required: false,
    max: 5
  }));

  collection.fields.add(new TextField({
    name: "default_end_time",
    required: false,
    max: 5
  }));

  app.save(collection);
}, (app) => {
  const collection = app.findCollectionByNameOrId("templates");
  collection.fields.removeByName("default_start_time");
  collection.fields.removeByName("default_end_time");
  app.save(collection);
});
```

- [ ] **Step 2: Update the Template type**

In `src/lib/types/index.ts`, add two fields to `Template` after `default_is_all_day`:

```ts
// Template for quick event creation
export interface Template extends BaseRecord {
	user: string;
	name: string;
	category?: string;
	default_duration_minutes: number;
	default_is_all_day: boolean;
	default_start_time?: string; // HH:mm (24h); with end time, prefills events from this template
	default_end_time?: string; // HH:mm (24h)
	default_reminders: ReminderConfig[];
	description?: string;
	icon?: string;
	color_override?: string;
}
```

- [ ] **Step 3: Update the store create() signature**

In `src/lib/stores/templates.svelte.ts`, extend the inline `data` type of `create()`:

```ts
		async create(data: {
			name: string;
			category?: string;
			default_duration_minutes: number;
			default_is_all_day: boolean;
			default_start_time?: string;
			default_end_time?: string;
			default_reminders: ReminderConfig[];
			description?: string;
			color_override?: string;
		}) {
```

(`update()` already takes `Partial<Template>` — no change needed.)

- [ ] **Step 4: Verify types**

Run: `npm run check`
Expected: PASS (0 errors; warnings unchanged from baseline).

If PocketBase happens to be running locally (`pocketbase/pocketbase serve`), restarting it applies the migration; not required for this task to be complete.

- [ ] **Step 5: Commit**

```bash
git add pocketbase/pb_migrations/0011_template_default_times.js src/lib/types/index.ts src/lib/stores/templates.svelte.ts
git commit -m "feat(templates): add default_start_time/default_end_time fields

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 3: Template form — "Set specific time" toggle + card display + i18n

**Files:**
- Modify: `src/routes/templates/+page.svelte`
- Modify: `src/lib/i18n/locales/en.json` (`template` section)
- Modify: `src/lib/i18n/locales/sv.json` (`template` section)

**Interfaces:**
- Consumes: `deriveDurationMinutes` from `$utils` (Task 1); `Template.default_start_time/default_end_time` (Task 2).
- Produces: templates saved with either both times set (and `default_duration_minutes` = derived value) or both cleared (`''`). Task 4 relies on "both set or both empty".

- [ ] **Step 1: Add i18n keys to both locales**

In `src/lib/i18n/locales/en.json`, inside the `"template"` object (after `"defaultDuration"`):

```json
		"setSpecificTime": "Set specific time",
		"setSpecificTimeDesc": "New events from this template are prefilled with these times",
```

In `src/lib/i18n/locales/sv.json`, same position:

```json
		"setSpecificTime": "Ange specifik tid",
		"setSpecificTimeDesc": "Nya händelser från denna mall förifylls med dessa tider",
```

- [ ] **Step 2: Verify locale balance**

Run:

```bash
python3 -c "import json; e=json.load(open('src/lib/i18n/locales/en.json')); s=json.load(open('src/lib/i18n/locales/sv.json'));
def k(d,p=''): out=set();
 [out.update(k(v,(f'{p}.{x}' if p else x))) if isinstance(v,dict) else out.add(f'{p}.{x}' if p else x) for x,v in d.items()];
 return out
print(sorted(k(e)-k(s)), sorted(k(s)-k(e)))"
```

Expected: `[] []`

- [ ] **Step 3: Add form state and logic**

In `src/routes/templates/+page.svelte` script block:

Add to the imports from `$utils`: `deriveDurationMinutes` (line 6 becomes `import { formatDuration, deriveDurationMinutes } from '$utils';`).

Add state after `defaultIsAllDay` (line 17):

```ts
	let useSpecificTime = $state(false);
	let defaultStartTime = $state('09:00');
	let defaultEndTime = $state('10:00');
```

Add a derived guard after the `durationOptions` block:

```ts
	const timesInvalid = $derived(
		!defaultIsAllDay &&
			useSpecificTime &&
			(!defaultStartTime || !defaultEndTime || defaultStartTime === defaultEndTime)
	);
```

In `openCreateModal()`, add resets alongside `defaultIsAllDay = false;`:

```ts
		useSpecificTime = false;
		defaultStartTime = '09:00';
		defaultEndTime = '10:00';
```

In `openEditModal(template)`, add after `defaultIsAllDay = ...`:

```ts
		useSpecificTime = !!(template.default_start_time && template.default_end_time);
		defaultStartTime = template.default_start_time || '09:00';
		defaultEndTime = template.default_end_time || '10:00';
```

In `handleSubmit()`, guard at the top (`if (!name.trim() || timesInvalid) return;`) and rebuild the `data` object — times are saved only when the toggle is on for a timed template, and cleared (`''`) otherwise, with the duration derived from the times when they're set:

```ts
			const hasTimes =
				!defaultIsAllDay && useSpecificTime && !!defaultStartTime && !!defaultEndTime;
			const data = {
				name,
				category: category || undefined,
				default_duration_minutes: hasTimes
					? deriveDurationMinutes(defaultStartTime, defaultEndTime)
					: defaultDurationMinutes,
				default_is_all_day: defaultIsAllDay,
				default_start_time: hasTimes ? defaultStartTime : '',
				default_end_time: hasTimes ? defaultEndTime : '',
				default_reminders: $state.snapshot(defaultReminders),
				description: description || undefined,
				color_override: colorOverride || undefined
			};
```

- [ ] **Step 4: Update the modal markup**

Replace the current `{#if !defaultIsAllDay}` duration block (lines 219-231) with:

```svelte
	{#if !defaultIsAllDay}
		<Toggle
			bind:checked={useSpecificTime}
			label={$t('template.setSpecificTime')}
			description={$t('template.setSpecificTimeDesc')}
		/>

		{#if useSpecificTime}
			<div class="grid grid-cols-2 gap-4">
				<div>
					<label for="default-start-time" class="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
						{$t('event.startTime')}
					</label>
					<Input id="default-start-time" type="time" bind:value={defaultStartTime} required />
				</div>
				<div>
					<label for="default-end-time" class="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
						{$t('event.endTime')}
					</label>
					<Input id="default-end-time" type="time" bind:value={defaultEndTime} required />
				</div>
			</div>
		{:else}
			<div>
				<label for="duration" class="block text-sm font-medium text-neutral-700 dark:text-neutral-200 mb-1">
					{$t('template.defaultDuration')}
				</label>
				<Select
					id="duration"
					options={durationOptions}
					value={defaultDurationMinutes.toString()}
					onchange={(e) => defaultDurationMinutes = parseInt((e.target as HTMLSelectElement).value)}
				/>
			</div>
		{/if}
	{/if}
```

Update the footer submit button's disabled prop (line 257):

```svelte
		<Button onclick={handleSubmit} {loading} disabled={!name.trim() || timesInvalid}>
```

- [ ] **Step 5: Update the card list display**

Replace the duration line in the template card (line 151):

```svelte
								{template.default_is_all_day
									? $t('time.allDay')
									: template.default_start_time && template.default_end_time
										? `${template.default_start_time}–${template.default_end_time}`
										: formatDuration(template.default_duration_minutes)}
```

- [ ] **Step 6: Verify**

Run: `npm run check`
Expected: PASS.

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/routes/templates/+page.svelte src/lib/i18n/locales/en.json src/lib/i18n/locales/sv.json
git commit -m "feat(templates): optional default start/stop time on templates

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 4: applyTemplate prefills template times

**Files:**
- Modify: `src/lib/components/event/EventForm.svelte:1-80` (imports + `applyTemplate`)

**Interfaces:**
- Consumes: `timeCrossesMidnight` from `$utils` (Task 1); `Template.default_start_time/default_end_time` (Task 2), guaranteed both-set-or-both-empty by Task 3.
- Produces: no new exports — behavior change only.

- [ ] **Step 1: Update imports**

In `src/lib/components/event/EventForm.svelte`:
- Line 3: `import { format } from 'date-fns';` → `import { addDays, format } from 'date-fns';`
- Line 6: add `timeCrossesMidnight` → `import { REMINDER_OPTIONS, RECURRENCE_PRESETS, timeCrossesMidnight } from '$utils';`

- [ ] **Step 2: Rewrite the timing branch of applyTemplate**

Replace the current `if (!isAllDay && template.default_duration_minutes && startTime) { ... }` block (lines 72-79) with:

```ts
		if (!isAllDay && template.default_start_time && template.default_end_time) {
			// Template carries a specific time of day — prefill it; the user
			// still picks the date. Cross-midnight stop lands on the next day.
			startTime = template.default_start_time;
			endTime = template.default_end_time;
			endDate = timeCrossesMidnight(template.default_start_time, template.default_end_time)
				? format(addDays(new Date(`${startDate}T00:00:00`), 1), 'yyyy-MM-dd')
				: startDate;
		} else if (!isAllDay && template.default_duration_minutes && startTime) {
			const [hours, minutes] = startTime.split(':').map(Number);
			const endMinutes = hours * 60 + minutes + template.default_duration_minutes;
			const endHours = Math.floor(endMinutes / 60) % 24;
			const endMins = endMinutes % 60;
			endTime = `${endHours.toString().padStart(2, '0')}:${endMins.toString().padStart(2, '0')}`;
			endDate = startDate;
		}
```

- [ ] **Step 3: Verify**

Run: `npm run check`
Expected: PASS.

Manual smoke (optional but recommended if dev server + PocketBase are running): `/templates` → create template with times 23:00–01:00 → `/event/new` → pick the template → start 23:00, end 01:00, end date = start date + 1.

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/event/EventForm.svelte
git commit -m "feat(event): apply template default times when creating from template

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 5: EventDetailModal (rename + internal branch)

**Files:**
- Rename: `src/lib/components/calendar/ExternalEventModal.svelte` → `src/lib/components/calendar/EventDetailModal.svelte` (via `git mv`)
- Modify: `src/lib/components/calendar/index.ts:6`

**Interfaces:**
- Consumes: existing `Modal` footer snippet prop (`src/lib/components/ui/Modal.svelte` renders the footer bar only when the prop is passed), `Button` from `$components/ui`, i18n key `event.edit` ("Edit Event" / "Redigera händelse" — already in both locales).
- Produces: `EventDetailModal` component, props unchanged: `{ event: DisplayEvent | null, onclose: () => void }`. Task 6 imports it as `import EventDetailModal from './EventDetailModal.svelte';` and via the barrel as `EventDetailModal`.

- [ ] **Step 1: Rename the file**

```bash
git mv src/lib/components/calendar/ExternalEventModal.svelte src/lib/components/calendar/EventDetailModal.svelte
```

- [ ] **Step 2: Update the script block**

In `EventDetailModal.svelte`, apply these script changes (external branch logic is otherwise untouched):

Imports — add `goto` and `Button`, and the `CalendarEvent` type:

```ts
	import { goto } from '$app/navigation';
	import { Button, Modal } from '$components/ui';
	import { _ } from '$lib/i18n';
	import { settingsStore } from '$stores';
	import { formatDateSmart, formatTimeRange } from '$utils';
	import { getPocketBase } from '$api/pocketbase';
	import ExternalEventReminderRow from './ExternalEventReminderRow.svelte';
	import type { DisplayEvent, ExternalEvent, CalendarEvent, CalendarSubscription } from '$types';
```

Replace the `external` derived (lines 23-26) so it is null for internal events — this also keeps the subscription-loading `$effect` from running for them:

```ts
	const external = $derived(
		event && event.is_external ? (event.original_event as ExternalEvent) : null
	);

	const internal = $derived(
		event && !event.is_external ? (event.original_event as CalendarEvent) : null
	);

	function handleEdit() {
		if (!event) return;
		const id = event.id;
		onclose();
		goto(`/event/${id}`);
	}
```

(`dateLabel`, `timeLabel`, the `$effect`, and `loadSubscription` stay exactly as they are.)

- [ ] **Step 3: Update the markup**

Declare an edit-footer snippet above the `<Modal>` and pass it only for internal events; add the internal branch to the body. Full markup section:

```svelte
{#snippet editFooter()}
	<Button onclick={handleEdit}>{$_('event.edit')}</Button>
{/snippet}

<Modal
	{open}
	title={event?.title ?? ''}
	size="md"
	{onclose}
	footer={event && !event.is_external ? editFooter : undefined}
>
	{#if event && external}
		<!-- EXISTING external content, byte-for-byte unchanged (badge row,
		     date/time block, location, description, reminder section) -->
	{:else if event && internal}
		<div class="space-y-4">
			{#if event.category_name}
				<div class="flex items-center gap-2 flex-wrap">
					<span
						class="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border-l-4"
						style:background-color="{event.color}20"
						style:border-left-color={event.color}
					>
						<span class="w-2 h-2 rounded-full" style:background-color={event.color}></span>
						<span class="text-neutral-700 dark:text-neutral-200">{event.category_name}</span>
					</span>
				</div>
			{/if}

			<div>
				<div class="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">
					{$_('event.date')}
				</div>
				<div class="text-sm text-neutral-800 dark:text-neutral-100">{dateLabel}</div>
				<div class="text-sm text-neutral-600 dark:text-neutral-300">{timeLabel}</div>
			</div>

			{#if internal.description}
				<div>
					<div class="text-xs uppercase tracking-wide text-neutral-500 dark:text-neutral-400 mb-1">
						{$_('event.description')}
					</div>
					<div class="text-sm text-neutral-800 dark:text-neutral-100 whitespace-pre-line break-words">
						{internal.description}
					</div>
				</div>
			{/if}
		</div>
	{/if}
</Modal>
```

The `<!-- EXISTING external content -->` comment above is a placement marker for this plan only — keep the actual existing external markup there unchanged; do not paste the comment.

- [ ] **Step 4: Update the barrel**

In `src/lib/components/calendar/index.ts`, replace line 6:

```ts
export { default as EventDetailModal } from './EventDetailModal.svelte';
```

- [ ] **Step 5: Verify (expected: 3 stale imports)**

Run: `npm run check`
Expected: FAILS with unresolved `./ExternalEventModal` imports in AgendaView/WeekView/MonthView — those are fixed in Task 6. If check reports errors ONLY in those three files, this task is done. (If Task 6 runs in the same session/commit is preferred, see note below.)

**Note:** Tasks 5 and 6 must land as ONE commit to keep the tree green — do not commit at the end of this task; Task 6's commit includes both.

---

### Task 6: Wire all views to the modal

**Files:**
- Modify: `src/lib/components/calendar/AgendaView.svelte` (import line 23, `handleEventClick` ~line 241, state decl ~line 264, modal usage line 697)
- Modify: `src/lib/components/calendar/WeekView.svelte` (imports lines 2+20, `handleEventClick` line 186, state decl line 184, modal usage line 319)
- Modify: `src/lib/components/calendar/MonthView.svelte` (import line 18, state+`handleEventClick` lines 125-133, modal usage line 229)

**Interfaces:**
- Consumes: `EventDetailModal` from Task 5 (same props as old `ExternalEventModal`).
- Produces: user-visible behavior — every non-routine event click opens the modal.

Apply the same three changes in each of the three views:

- [ ] **Step 1: AgendaView**

```ts
// import (line 23):
import EventDetailModal from './EventDetailModal.svelte';

// handleEventClick (lines 241-247) becomes:
	function handleEventClick(event: DisplayEvent) {
		eventDetail = event;
	}

// state (line 264):
	let eventDetail = $state<DisplayEvent | null>(null);

// modal (line 697):
<EventDetailModal event={eventDetail} onclose={() => (eventDetail = null)} />
```

`goto` stays imported (still used by `handleRoutineEdit`).

- [ ] **Step 2: WeekView**

Same four edits (import line 20, `handleEventClick` lines 186-192, state line 184, modal line 319). Additionally REMOVE `import { goto } from '$app/navigation';` (line 2) — `handleEventClick` was its only caller in this file (verify with a search for `goto(` before deleting).

- [ ] **Step 3: MonthView**

Same four edits (import line 18, state line 125, `handleEventClick` lines 127-133, modal line 229). `goto` stays imported (still used by the routine chip onclick, line 205). `handleEventClick` keeps its existing `import('$types').DisplayEvent` param type.

- [ ] **Step 4: Verify**

Run: `npm run check`
Expected: PASS — no remaining references to `ExternalEventModal` anywhere:

```bash
grep -rn "ExternalEventModal" src/ && echo "STALE REFS FOUND" || echo "clean"
```

Expected: `clean`.

Run: `npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit (includes Task 5's rename)**

```bash
git add src/lib/components/calendar/
git commit -m "feat(calendar): event preview modal for internal events in all views

Renames ExternalEventModal to EventDetailModal; internal events now open
a read-only detail modal with an Edit button instead of navigating
straight to the edit page.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

---

### Task 7: Full verification + HA addon sync

**Files:**
- Modify (generated): `ha-addon/calendhd/pb_migrations/`, `ha-addon/calendhd/rootfs/opt/calendhd/public/` (via `./build-for-ha.sh`)

**Interfaces:**
- Consumes: everything above.
- Produces: release-ready branch (addon bundle in sync with `src/**` per repo rule).

- [ ] **Step 1: Full test + type + format pass**

```bash
npx vitest run
npm run check
npm run format:check
```

Expected: all PASS. If `format:check` flags the touched `.ts` files, run `npm run format`, re-verify, and amend into the relevant commit or commit as `style:`.

- [ ] **Step 2: i18n balance re-check**

Re-run the python structural diff from Task 3 Step 2. Expected: `[] []`.

- [ ] **Step 3: Sync the HA addon bundle**

```bash
./build-for-ha.sh
```

Expected: frontend build succeeds; `ha-addon/calendhd/pb_migrations/0011_template_default_times.js` now exists; `ha-addon/calendhd/rootfs/opt/calendhd/public/_app/` chunks refreshed.

- [ ] **Step 4: Commit the addon sync**

```bash
git add ha-addon/calendhd/
git commit -m "chore(ha): sync addon bundle (migration 0011 + rebuilt frontend)

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"
```

**Do NOT bump `version:` in `ha-addon/calendhd/config.yaml`** — that is the release trigger and stays a human decision at merge time.

- [ ] **Step 5: Manual smoke test (requires PocketBase + dev server running)**

1. `/templates`: create "Morning gym" with times 06:30–07:15 → card shows `06:30–07:15`.
2. `/event/new`: pick "Morning gym" → start 06:30, end 07:15, same end date.
3. Edit the template: toggle off "Set specific time" → save → card shows a duration again; `/event/new` + template behaves like pre-change.
4. Day, week, month views: click an internal event → modal with category/date/description + "Edit Event" button → button lands on `/event/[id]`.
5. Click an external event in each view → modal identical to before (badge, location, reminder row).
6. Click a task's checkbox in day view → completes without opening the modal.
