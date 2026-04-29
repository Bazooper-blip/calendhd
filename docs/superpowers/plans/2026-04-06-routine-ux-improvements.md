# Routine UX Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make routine blocks in calendar views interactive - expandable with per-step checkboxes and a progress indicator.

**Architecture:** Extend the existing RoutineGroup interface to carry step event IDs and completion state. Add a shared RoutineBlock component that handles expand/collapse, checkboxes, and progress display. Use it in DayView and WeekView (MonthView stays compact). Clicking the block toggles expand; a small edit icon navigates to the routine edit page.

**Tech Stack:** Svelte 5 (runes), Tailwind CSS 4, existing calendar store (`toggleTaskComplete`), existing DisplayEvent type.

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `src/lib/components/calendar/RoutineBlock.svelte` | Create | Shared routine block component with expand/collapse, checkboxes, progress |
| `src/lib/components/calendar/WeekView.svelte` | Modify | Update RoutineGroup to include event IDs/completion, use RoutineBlock |
| `src/lib/components/calendar/DayView.svelte` | Modify | Same updates as WeekView, use RoutineBlock |
| `src/lib/components/calendar/index.ts` | Modify | Export RoutineBlock |

---

### Task 1: Extend RoutineGroup with completion data

The RoutineGroup `steps` array currently lacks event IDs and completion state. Both DayView and WeekView need to include this data so the RoutineBlock can render checkboxes and progress.

**Files:**
- Modify: `src/lib/components/calendar/WeekView.svelte` (lines 22-42, 62-125)
- Modify: `src/lib/components/calendar/DayView.svelte` (lines 18-38, 47-112)

- [ ] **Step 1: Update RoutineGroup interface in WeekView.svelte**

Change the `steps` array in the `RoutineGroup` interface to include `id` and `is_completed`:

```typescript
/** A routine group merges multiple routine step events into one visual block. */
interface RoutineGroup {
	kind: 'routine-group';
	routine_template: string;
	routine_group_name: string;
	color: string;
	icon?: string;
	start: Date;
	end: Date;
	steps: Array<{
		id: string;
		title: string;
		start: Date;
		end?: Date;
		icon?: string;
		energy_level?: EnergyLevel;
		is_completed: boolean;
	}>;
}
```

- [ ] **Step 2: Update the grouping logic in WeekView's getProcessedEventsForDay**

In the `processed.push(...)` block where steps are mapped (around line 114), add `id` and `is_completed`:

```typescript
steps: sorted.map((e) => ({
	id: e.id,
	title: e.title,
	start: e.start,
	end: e.end,
	icon: e.icon,
	energy_level: e.energy_level,
	is_completed: e.is_completed
}))
```

- [ ] **Step 3: Apply the same changes to DayView.svelte**

Make identical changes to DayView's `RoutineGroup` interface and `processedDayEvents` derived (same `id` and `is_completed` fields in both the interface and the mapping).

- [ ] **Step 4: Run type check**

Run: `npm run check`
Expected: 0 errors (the template doesn't use these fields yet, so no breakage)

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/calendar/WeekView.svelte src/lib/components/calendar/DayView.svelte
git commit -m "feat(routines): add event ID and completion state to RoutineGroup steps"
```

---

### Task 2: Create RoutineBlock component

A shared component that renders the routine block with:
- **Collapsed state**: routine name, progress (e.g. "2/5"), first step + more
- **Expanded state**: routine name, progress, all steps with checkboxes, edit link
- Click on block toggles expand/collapse
- Click on checkbox toggles step completion (stops propagation)
- Small edit icon navigates to routine edit page

**Files:**
- Create: `src/lib/components/calendar/RoutineBlock.svelte`
- Modify: `src/lib/components/calendar/index.ts`

- [ ] **Step 1: Create RoutineBlock.svelte**

```svelte
<script lang="ts">
	import { goto } from '$app/navigation';
	import { cn, getContrastColor, formatTime } from '$utils';
	import { calendar, settingsStore } from '$stores';
	import { EventIcon } from '$components/ui';
	import type { EnergyLevel } from '$types';

	interface RoutineStep {
		id: string;
		title: string;
		start: Date;
		end?: Date;
		icon?: string;
		energy_level?: EnergyLevel;
		is_completed: boolean;
	}

	interface Props {
		routine_template: string;
		routine_group_name: string;
		color: string;
		icon?: string;
		steps: RoutineStep[];
		style?: string;
		compact?: boolean;
	}

	let {
		routine_template,
		routine_group_name,
		color,
		icon,
		steps,
		style = '',
		compact = false
	}: Props = $props();

	let expanded = $state(false);

	const format24h = $derived(settingsStore.timeFormat === '24h');
	const textColor = $derived(getContrastColor(color));
	const completedCount = $derived(steps.filter((s) => s.is_completed).length);
	const allDone = $derived(completedCount === steps.length);

	function toggleExpand(e: MouseEvent) {
		expanded = !expanded;
	}

	function handleCheckbox(e: MouseEvent, stepId: string) {
		e.stopPropagation();
		calendar.toggleTaskComplete(stepId);
	}

	function handleEdit(e: MouseEvent) {
		e.stopPropagation();
		goto(`/routines/${routine_template}`);
	}
</script>

<button
	type="button"
	class={cn(
		'absolute inset-x-1 rounded-lg overflow-hidden text-left transition-all hover:ring-2 hover:ring-primary-500 hover:ring-offset-1 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1',
		expanded && 'z-10 ring-2 ring-primary-500/30'
	)}
	{style}
	style:background-color={color}
	onclick={toggleExpand}
>
	<div class={cn('h-full flex flex-col', compact ? 'px-2 py-1' : 'px-2 py-1')} style:color={textColor}>
		<!-- Header row: icon, name, progress, edit -->
		<div class="flex items-center gap-1">
			<span class={cn('font-semibold truncate flex-1 flex items-center gap-1', compact ? 'text-xs' : 'text-xs')}>
				{#if icon}
					<EventIcon icon={icon} size="sm" />
				{/if}
				{routine_group_name}
			</span>
			<!-- Progress pill -->
			<span class={cn(
				'flex-shrink-0 text-[10px] font-medium rounded-full px-1.5',
				allDone ? 'bg-white/30' : 'bg-black/10'
			)}>
				{completedCount}/{steps.length}
			</span>
			<!-- Edit icon -->
			<!-- svelte-ignore a11y_click_events_have_key_events -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<span
				onclick={handleEdit}
				class="flex-shrink-0 opacity-60 hover:opacity-100 transition-opacity cursor-pointer"
				role="link"
				aria-label="Edit routine"
			>
				<svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
				</svg>
			</span>
		</div>

		{#if expanded}
			<!-- Expanded: all steps with checkboxes -->
			<div class="mt-1 space-y-px overflow-y-auto flex-1">
				{#each steps as step (step.id)}
					<div class={cn(
						'flex items-center gap-1.5 rounded px-1 py-0.5 transition-colors',
						compact ? 'text-[10px]' : 'text-[11px]'
					)}>
						<!-- Checkbox -->
						<!-- svelte-ignore a11y_click_events_have_key_events -->
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<span
							onclick={(e) => handleCheckbox(e, step.id)}
							class={cn(
								'flex-shrink-0 w-3.5 h-3.5 rounded border-[1.5px] flex items-center justify-center cursor-pointer transition-colors',
								step.is_completed
									? 'bg-white/30 border-white/50'
									: 'border-white/70 hover:border-white'
							)}
							role="checkbox"
							aria-checked={step.is_completed}
						>
							{#if step.is_completed}
								<svg class="w-2.5 h-2.5" fill="currentColor" viewBox="0 0 20 20">
									<path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd" />
								</svg>
							{/if}
						</span>
						{#if step.energy_level}
							<span class={cn(
								'flex-shrink-0 w-1.5 h-1.5 rounded-full',
								step.energy_level === 'low' && 'bg-green-400',
								step.energy_level === 'medium' && 'bg-amber-400',
								step.energy_level === 'high' && 'bg-red-400'
							)}></span>
						{/if}
						<span class={cn('truncate', step.is_completed && 'line-through opacity-60')}>
							{step.title}
						</span>
						<span class="flex-shrink-0 opacity-60 ml-auto">
							{formatTime(step.start, format24h)}
						</span>
					</div>
				{/each}
			</div>
		{:else}
			<!-- Collapsed: first step + more -->
			<span class={cn('opacity-80 truncate', compact ? 'text-[10px]' : 'text-[11px]')}>
				{steps[0].title}{#if steps.length > 1}&ensp;<span class="opacity-70">(+{steps.length - 1} more)</span>{/if}
			</span>
		{/if}
	</div>
</button>
```

- [ ] **Step 2: Export RoutineBlock from the calendar barrel**

In `src/lib/components/calendar/index.ts`, add:

```typescript
export { default as RoutineBlock } from './RoutineBlock.svelte';
```

- [ ] **Step 3: Run type check**

Run: `npm run check`
Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/components/calendar/RoutineBlock.svelte src/lib/components/calendar/index.ts
git commit -m "feat(routines): add RoutineBlock component with expand/collapse and checkboxes"
```

---

### Task 3: Wire RoutineBlock into WeekView

Replace the inline routine block rendering in WeekView with the new RoutineBlock component.

**Files:**
- Modify: `src/lib/components/calendar/WeekView.svelte` (lines 262-284)

- [ ] **Step 1: Import RoutineBlock**

Add to the imports at the top of WeekView.svelte:

```typescript
import RoutineBlock from './RoutineBlock.svelte';
```

- [ ] **Step 2: Replace the inline routine rendering**

Replace the `{:else}` block (the routine-group branch) with:

```svelte
{:else}
	{@const pos = getEventPosition(item.start, item.end, day)}
	<RoutineBlock
		routine_template={item.routine_template}
		routine_group_name={item.routine_group_name}
		color={item.color}
		icon={item.icon}
		steps={item.steps}
		style="top: {pos.top}%; height: {pos.height}%;"
		compact={true}
	/>
{/if}
```

- [ ] **Step 3: Remove unused imports**

Remove `getContrastColor` and `EventIcon` from WeekView if they're no longer used elsewhere in the file. Keep them if the template still references them.

- [ ] **Step 4: Run type check**

Run: `npm run check`
Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/calendar/WeekView.svelte
git commit -m "feat(routines): use RoutineBlock component in WeekView"
```

---

### Task 4: Wire RoutineBlock into DayView

Same change for DayView.

**Files:**
- Modify: `src/lib/components/calendar/DayView.svelte` (lines 242-264)

- [ ] **Step 1: Import RoutineBlock**

Add to the imports at the top of DayView.svelte:

```typescript
import RoutineBlock from './RoutineBlock.svelte';
```

- [ ] **Step 2: Replace the inline routine rendering**

Replace the `{:else}` block with:

```svelte
{:else}
	{@const pos = getEventPosition(item.start, item.end, date)}
	<RoutineBlock
		routine_template={item.routine_template}
		routine_group_name={item.routine_group_name}
		color={item.color}
		icon={item.icon}
		steps={item.steps}
		style="top: {pos.top}%; height: {pos.height}%;"
	/>
{/if}
```

Note: no `compact` prop (defaults to false), giving DayView slightly more room.

- [ ] **Step 3: Remove unused imports**

Remove `getContrastColor`, `EventIcon`, `cn` from DayView if no longer used elsewhere in the file.

- [ ] **Step 4: Run type check and test in browser**

Run: `npm run check`
Expected: 0 errors

Manual test:
1. Open day view with routine events
2. Click the routine block - it should expand showing all steps with checkboxes
3. Click a checkbox - the step should toggle completion (line-through + checkmark)
4. The progress pill should update (e.g. "1/5")
5. Click the edit icon - should navigate to `/routines/{id}`
6. Click the block again - should collapse back to compact view
7. Switch to week view - same behavior but more compact

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/calendar/DayView.svelte
git commit -m "feat(routines): use RoutineBlock component in DayView"
```

---

### Task 5: Handle expanded height overflow

When a routine block expands to show all steps, it may overflow its calculated height. The expanded block should grow beyond its time-slot height.

**Files:**
- Modify: `src/lib/components/calendar/RoutineBlock.svelte`

- [ ] **Step 1: Override height when expanded**

In RoutineBlock.svelte, the outer `<button>` uses the `style` prop which includes a fixed `height: X%`. When expanded, we need to override this to `height: auto; min-height: X%`. Update the button element:

```svelte
<button
	type="button"
	class={cn(
		'absolute inset-x-1 rounded-lg overflow-hidden text-left transition-all hover:ring-2 hover:ring-primary-500 hover:ring-offset-1 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-1',
		expanded && 'z-10 ring-2 ring-primary-500/30 !h-auto shadow-lg'
	)}
	style="{style}{expanded ? ` min-height: 0;` : ''}"
	style:background-color={color}
	onclick={toggleExpand}
>
```

The `!h-auto` Tailwind class overrides the inline height when expanded, and `shadow-lg` gives the expanded block visual elevation over other events.

- [ ] **Step 2: Test in browser**

Manual test:
1. Open day view with a routine that has 5+ steps
2. Click to expand - the block should grow to fit all steps
3. It should float above other content (z-10 + shadow)
4. Click to collapse - should return to original size

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/calendar/RoutineBlock.svelte
git commit -m "fix(routines): allow expanded routine block to grow beyond time slot"
```
