# Event Icons Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add per-event visual icons (emoji + Lucide) to calendar events as a visual aid for AuDHD users.

**Architecture:** A single `icon?: string` field on events stores either native emoji or `"lucide:name"` prefixed strings. A new `IconPicker` component with two tabs (Emoji/Lucide) is added to the event form. A shared `EventIcon` renderer displays icons inline before event titles across all calendar views.

**Tech Stack:** SvelteKit, Svelte 5 runes, `lucide-svelte`, Dexie (IndexedDB), PocketBase, Zod, Tailwind CSS 4, svelte-i18n

---

### Task 1: Install lucide-svelte dependency

**Files:**
- Modify: `package.json`

**Step 1: Install the package**

Run: `npm install lucide-svelte`

**Step 2: Verify installation**

Run: `npm ls lucide-svelte`
Expected: `lucide-svelte@<version>` listed

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add lucide-svelte dependency for event icons"
```

---

### Task 2: Add icon field to types and schemas

**Files:**
- Modify: `src/lib/types/index.ts` (lines 67-85 CalendarEvent, 153-158 LocalEvent, 181-194 DisplayEvent, 39-49 Template, 204-220 EventFormData, 230-240 TemplateFormData)
- Modify: `src/lib/schemas/index.ts` (lines 25-56 eventSchema, 66-78 templateSchema)

**Step 1: Add `icon` to CalendarEvent**

In `src/lib/types/index.ts`, add `icon?: string;` after `image?: string;` (line 77):

```typescript
// Calendar event
export interface CalendarEvent extends BaseRecord, SharedFields {
	user: string;
	template?: string;
	category?: string;
	title: string;
	description?: string;
	start_time: string;
	end_time?: string;
	is_all_day: boolean;
	is_task?: boolean;
	image?: string;
	icon?: string;          // <-- ADD THIS LINE
	color_override?: string;
	recurrence_rule?: RecurrenceRule;
	recurrence_parent?: string;
	reminders: ReminderConfig[];
	completed_at?: string;
	local_id?: string;
	last_synced?: string;
}
```

**Step 2: Add `icon` to DisplayEvent**

In `src/lib/types/index.ts`, add `icon?: string;` after `color: string;` (line 189):

```typescript
export interface DisplayEvent {
	id: string;
	title: string;
	start: Date;
	end?: Date;
	is_all_day: boolean;
	is_task: boolean;
	is_completed: boolean;
	color: string;
	icon?: string;          // <-- ADD THIS LINE
	category_name?: string;
	is_external: boolean;
	subscription_name?: string;
	original_event: CalendarEvent | ExternalEvent;
}
```

**Step 3: Add `icon` to Template**

In `src/lib/types/index.ts`, add `icon?: string;` after `image?: string;` (line 47):

```typescript
export interface Template extends BaseRecord, SharedFields {
	user: string;
	name: string;
	category?: string;
	default_duration_minutes: number;
	default_is_all_day: boolean;
	default_reminders: ReminderConfig[];
	description?: string;
	image?: string;
	icon?: string;          // <-- ADD THIS LINE
	color_override?: string;
}
```

**Step 4: Add `icon` to EventFormData**

In `src/lib/types/index.ts`, add `icon?: string;` after `color_override?: string;` (line 215):

```typescript
export interface EventFormData {
	title: string;
	description?: string;
	start_date: string;
	start_time?: string;
	end_date?: string;
	end_time?: string;
	is_all_day: boolean;
	is_task: boolean;
	category?: string;
	template?: string;
	color_override?: string;
	icon?: string;          // <-- ADD THIS LINE
	reminders: ReminderConfig[];
	recurrence_rule?: RecurrenceRule;
	household?: string;
	is_private?: boolean;
}
```

**Step 5: Add `icon` to TemplateFormData**

In `src/lib/types/index.ts`, add `icon?: string;` after `color_override?: string;` (line 237):

```typescript
export interface TemplateFormData {
	name: string;
	category?: string;
	default_duration_minutes: number;
	default_is_all_day: boolean;
	default_reminders: ReminderConfig[];
	description?: string;
	color_override?: string;
	icon?: string;          // <-- ADD THIS LINE
	household?: string;
	is_private?: boolean;
}
```

**Step 6: Add `icon` to eventSchema in Zod**

In `src/lib/schemas/index.ts`, add `icon` field after `color_override` (around line 38):

```typescript
export const eventSchema = z.object({
	title: z.string().min(1, 'Title is required').max(500, 'Title is too long'),
	description: z.string().max(10000, 'Description is too long').optional(),
	start_date: z.string().min(1, 'Start date is required'),
	start_time: z.string().optional(),
	end_date: z.string().optional(),
	end_time: z.string().optional(),
	is_all_day: z.boolean().default(false),
	category: z.string().optional(),
	color_override: z
		.string()
		.regex(/^#[0-9A-Fa-f]{3,8}$/, 'Invalid color format')
		.optional()
		.or(z.literal('')),
	icon: z.string().max(100).optional().or(z.literal('')),  // <-- ADD THIS LINE
	reminders: z.array(z.number()).optional(),
	recurrence_rule: z
		.object({
			// ... existing recurrence fields unchanged
		})
		.optional()
});
```

**Step 7: Add `icon` to templateSchema in Zod**

In `src/lib/schemas/index.ts`, add `icon` field after `color_override` (around line 76):

```typescript
export const templateSchema = z.object({
	name: z.string().min(1, 'Name is required').max(200, 'Name is too long'),
	category: z.string().optional(),
	default_duration_minutes: z.number().min(0).max(10080, 'Duration cannot exceed 7 days'),
	default_is_all_day: z.boolean().default(false),
	description: z.string().max(5000, 'Description is too long').optional(),
	color_override: z
		.string()
		.regex(/^#[0-9A-Fa-f]{3,8}$/, 'Invalid color format')
		.optional()
		.or(z.literal('')),
	icon: z.string().max(100).optional().or(z.literal('')),  // <-- ADD THIS LINE
	default_reminders: z.array(z.number()).optional()
});
```

**Step 8: Verify types compile**

Run: `npm run check`
Expected: No type errors

**Step 9: Commit**

```bash
git add src/lib/types/index.ts src/lib/schemas/index.ts
git commit -m "feat: add icon field to event, template, and display types and schemas"
```

---

### Task 3: Pass icon through calendar store to DisplayEvent

**Files:**
- Modify: `src/lib/stores/calendar.svelte.ts` (lines 99-138 displayEvents getter)

**Step 1: Add icon to DisplayEvent mapping**

In `src/lib/stores/calendar.svelte.ts`, in the `displayEvents` getter, add `icon` to the calendar event mapping (around line 112):

```typescript
// Convert calendar events
for (const event of events) {
	allEvents.push({
		id: event.id,
		title: event.title,
		start: new Date(event.start_time),
		end: event.end_time ? new Date(event.end_time) : undefined,
		is_all_day: event.is_all_day,
		is_task: event.is_task || false,
		is_completed: !!event.completed_at,
		color: event.color_override || '#7C9885',
		icon: event.icon,       // <-- ADD THIS LINE
		is_external: false,
		original_event: event
	});
}
```

External events don't have icons, so no changes needed there.

**Step 2: Verify types compile**

Run: `npm run check`
Expected: No type errors

**Step 3: Commit**

```bash
git add src/lib/stores/calendar.svelte.ts
git commit -m "feat: pass event icon through to DisplayEvent in calendar store"
```

---

### Task 4: Create EventIcon renderer component

**Files:**
- Create: `src/lib/components/ui/EventIcon.svelte`
- Modify: `src/lib/components/ui/index.ts` (line 9, add export)

**Step 1: Create EventIcon.svelte**

Create `src/lib/components/ui/EventIcon.svelte`:

```svelte
<script lang="ts">
	import { cn } from '$utils';

	interface Props {
		icon: string;
		size?: 'sm' | 'md' | 'lg';
		class?: string;
	}

	let { icon, size = 'md', class: className }: Props = $props();

	const isLucide = $derived(icon.startsWith('lucide:'));
	const lucideName = $derived(isLucide ? icon.slice(7) : '');

	const sizeClasses: Record<string, string> = {
		sm: 'w-3 h-3',
		md: 'w-3.5 h-3.5',
		lg: 'w-4.5 h-4.5'
	};

	const emojiSizeClasses: Record<string, string> = {
		sm: 'text-xs leading-none',
		md: 'text-sm leading-none',
		lg: 'text-base leading-none'
	};

	// Dynamic Lucide icon import
	let LucideComponent: any = $state(null);

	$effect(() => {
		if (isLucide && lucideName) {
			loadLucideIcon(lucideName);
		}
	});

	async function loadLucideIcon(name: string) {
		try {
			const icons = await import('lucide-svelte');
			// Convert kebab-case to PascalCase for the component name
			const pascalName = name
				.split('-')
				.map((part) => part.charAt(0).toUpperCase() + part.slice(1))
				.join('');
			LucideComponent = (icons as any)[pascalName] || null;
		} catch {
			LucideComponent = null;
		}
	}
</script>

{#if icon}
	{#if isLucide && LucideComponent}
		<svelte:component
			this={LucideComponent}
			class={cn('flex-shrink-0', sizeClasses[size], className)}
		/>
	{:else if !isLucide}
		<span
			class={cn('flex-shrink-0 inline-flex items-center justify-center', emojiSizeClasses[size], className)}
			aria-hidden="true"
		>{icon}</span>
	{/if}
{/if}
```

**Step 2: Export from barrel**

In `src/lib/components/ui/index.ts`, add the export:

```typescript
export { default as EventIcon } from './EventIcon.svelte';
```

**Step 3: Verify types compile**

Run: `npm run check`
Expected: No type errors

**Step 4: Commit**

```bash
git add src/lib/components/ui/EventIcon.svelte src/lib/components/ui/index.ts
git commit -m "feat: add EventIcon renderer component for emoji and Lucide icons"
```

---

### Task 5: Create IconPicker component

**Files:**
- Create: `src/lib/components/ui/IconPicker.svelte`
- Modify: `src/lib/components/ui/index.ts` (add export)

**Step 1: Create IconPicker.svelte**

Create `src/lib/components/ui/IconPicker.svelte`. This component has two tabs (Emoji and Lucide icons), a search bar, and returns a unified string value.

```svelte
<script lang="ts">
	import { cn } from '$utils';
	import { t } from 'svelte-i18n';

	interface Props {
		value?: string;
		onSelect?: (icon: string) => void;
		class?: string;
	}

	let { value = '', onSelect, class: className }: Props = $props();

	let isOpen = $state(false);
	let activeTab = $state<'emoji' | 'lucide'>('emoji');
	let searchQuery = $state('');

	// Reuse the same emoji categories from EmojiPicker
	const emojiCategories = [
		{
			name: 'Common',
			emojis: ['📅', '📆', '🗓️', '⏰', '🔔', '✅', '❌', '⭐', '💡', '📝', '📌', '🎯', '🏠', '💼', '📧', '📞']
		},
		{
			name: 'Activities',
			emojis: ['🏃', '🚶', '🧘', '💪', '🏋️', '🚴', '🏊', '⚽', '🎾', '🎮', '🎬', '🎵', '📚', '✈️', '🚗', '🛒']
		},
		{
			name: 'Health',
			emojis: ['💊', '🏥', '🩺', '🧠', '❤️', '😴', '🥗', '🍎', '💧', '🧘‍♀️', '🦷', '👁️', '💉', '🩹', '🧪', '🌡️']
		},
		{
			name: 'Work',
			emojis: ['💻', '📊', '📈', '💰', '🏦', '📁', '📋', '✏️', '🖊️', '📎', '🗂️', '💳', '🎓', '👔', '🤝', '📢']
		},
		{
			name: 'People',
			emojis: ['👨‍👩‍👧', '👶', '🧒', '👦', '👧', '🧑', '👨', '👩', '🧓', '👴', '👵', '🐕', '🐈', '🎂', '🎉', '🎁']
		},
		{
			name: 'Food',
			emojis: ['☕', '🍵', '🥤', '🍔', '🍕', '🍜', '🍱', '🥡', '🍳', '🥐', '🍰', '🍪', '🥛', '🍺', '🍷', '🧁']
		},
		{
			name: 'Nature',
			emojis: ['🌸', '🌺', '🌻', '🌳', '🌴', '🌊', '⛰️', '🌙', '☀️', '🌈', '❄️', '🔥', '💨', '🌍', '🌵', '🍀']
		},
		{
			name: 'Objects',
			emojis: ['🔑', '🔒', '💎', '🎀', '🧸', '🎈', '🎨', '🔧', '🔨', '💡', '🔋', '📷', '🎥', '🎧', '🕹️', '🧩']
		}
	];

	// Curated Lucide icons organized by category (using kebab-case names)
	const lucideCategories = [
		{
			name: 'Common',
			icons: ['calendar', 'clock', 'bell', 'check', 'star', 'heart', 'home', 'briefcase', 'mail', 'phone', 'map-pin', 'bookmark', 'flag', 'target', 'zap', 'award']
		},
		{
			name: 'Activities',
			icons: ['bike', 'dumbbell', 'music', 'gamepad-2', 'film', 'book-open', 'plane', 'car', 'shopping-cart', 'utensils', 'coffee', 'wine', 'palette', 'camera', 'headphones', 'ticket']
		},
		{
			name: 'Health',
			icons: ['pill', 'stethoscope', 'brain', 'heart-pulse', 'apple', 'droplets', 'moon', 'sun', 'thermometer', 'eye', 'shield', 'activity', 'salad', 'bed', 'bath', 'leaf']
		},
		{
			name: 'Work',
			icons: ['laptop', 'monitor', 'code', 'presentation', 'bar-chart-3', 'wallet', 'file-text', 'clipboard', 'pen-tool', 'paperclip', 'folder', 'credit-card', 'graduation-cap', 'users', 'handshake', 'megaphone']
		},
		{
			name: 'People',
			icons: ['user', 'users', 'baby', 'dog', 'cat', 'cake', 'party-popper', 'gift', 'smile', 'laugh', 'hand-heart', 'crown', 'person-standing', 'accessibility', 'glasses', 'shirt']
		},
		{
			name: 'Travel',
			icons: ['map', 'compass', 'navigation', 'train-front', 'bus', 'ship', 'rocket', 'globe', 'mountain', 'tent', 'trees', 'umbrella', 'luggage', 'fuel', 'anchor', 'sunrise']
		}
	];

	const allEmojis = $derived(emojiCategories.flatMap((cat) => cat.emojis));

	const filteredEmojis = $derived(
		searchQuery ? allEmojis.filter((emoji) => emoji.includes(searchQuery)) : null
	);

	const filteredLucideCategories = $derived(
		searchQuery
			? lucideCategories.map((cat) => ({
					...cat,
					icons: cat.icons.filter((name) => name.includes(searchQuery.toLowerCase()))
				})).filter((cat) => cat.icons.length > 0)
			: lucideCategories
	);

	// Load Lucide components for display in picker
	let lucideComponents = $state<Record<string, any>>({});

	$effect(() => {
		if (activeTab === 'lucide') {
			loadLucideIcons();
		}
	});

	async function loadLucideIcons() {
		try {
			const icons = await import('lucide-svelte');
			const components: Record<string, any> = {};
			for (const cat of lucideCategories) {
				for (const name of cat.icons) {
					const pascalName = name
						.split('-')
						.map((part: string) => part.charAt(0).toUpperCase() + part.slice(1))
						.join('');
					if ((icons as any)[pascalName]) {
						components[name] = (icons as any)[pascalName];
					}
				}
			}
			lucideComponents = components;
		} catch {
			// Icons will just not render
		}
	}

	// Determine what the current value is for display
	const isLucideValue = $derived(value?.startsWith('lucide:') ?? false);
	const displayLucideName = $derived(isLucideValue ? value!.slice(7) : '');

	function selectEmoji(emoji: string) {
		onSelect?.(emoji);
		isOpen = false;
		searchQuery = '';
	}

	function selectLucideIcon(name: string) {
		onSelect?.(`lucide:${name}`);
		isOpen = false;
		searchQuery = '';
	}

	function clearIcon() {
		onSelect?.('');
		isOpen = false;
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (!target.closest('.icon-picker-container')) {
			isOpen = false;
		}
	}
</script>

<svelte:window onclick={handleClickOutside} />

<div class={cn('icon-picker-container relative', className)}>
	<!-- Trigger button -->
	<button
		type="button"
		onclick={() => isOpen = !isOpen}
		class="w-12 h-12 rounded-lg border-2 border-dashed border-neutral-300 hover:border-primary-400 flex items-center justify-center text-2xl transition-colors bg-white dark:bg-neutral-800"
	>
		{#if value && !isLucideValue}
			{value}
		{:else if isLucideValue && lucideComponents[displayLucideName]}
			<svelte:component
				this={lucideComponents[displayLucideName]}
				class="w-5 h-5 text-neutral-600 dark:text-neutral-300"
			/>
		{:else if isLucideValue}
			<!-- Lucide icon loading placeholder -->
			<span class="w-5 h-5 text-neutral-400">...</span>
		{:else}
			<svg class="w-5 h-5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.828 14.828a4 4 0 01-5.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
		{/if}
	</button>

	<!-- Dropdown -->
	{#if isOpen}
		<div class="absolute z-50 mt-2 w-80 bg-white dark:bg-neutral-800 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
			<!-- Tabs -->
			<div class="flex border-b border-neutral-100 dark:border-neutral-700">
				<button
					type="button"
					class={cn(
						'flex-1 px-4 py-2.5 text-sm font-medium transition-colors',
						activeTab === 'emoji'
							? 'text-primary-600 border-b-2 border-primary-500'
							: 'text-neutral-500 hover:text-neutral-700'
					)}
					onclick={() => { activeTab = 'emoji'; searchQuery = ''; }}
				>
					{$t('event.iconEmoji')}
				</button>
				<button
					type="button"
					class={cn(
						'flex-1 px-4 py-2.5 text-sm font-medium transition-colors',
						activeTab === 'lucide'
							? 'text-primary-600 border-b-2 border-primary-500'
							: 'text-neutral-500 hover:text-neutral-700'
					)}
					onclick={() => { activeTab = 'lucide'; searchQuery = ''; }}
				>
					{$t('event.iconIcons')}
				</button>
			</div>

			<!-- Search -->
			<div class="p-2 border-b border-neutral-100 dark:border-neutral-700">
				<input
					type="text"
					bind:value={searchQuery}
					placeholder={$t('common.search')}
					class="w-full px-3 py-2 text-sm bg-neutral-50 dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
				/>
			</div>

			<!-- Content -->
			<div class="max-h-64 overflow-y-auto p-2">
				{#if activeTab === 'emoji'}
					{#if filteredEmojis}
						<div class="grid grid-cols-8 gap-1">
							{#each filteredEmojis as emoji}
								<button
									type="button"
									onclick={() => selectEmoji(emoji)}
									class="w-8 h-8 flex items-center justify-center text-xl hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors"
								>
									{emoji}
								</button>
							{/each}
						</div>
						{#if filteredEmojis.length === 0}
							<p class="text-center text-neutral-500 py-4 text-sm">No results</p>
						{/if}
					{:else}
						{#each emojiCategories as category}
							<div class="mb-3">
								<h4 class="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-1 px-1">{category.name}</h4>
								<div class="grid grid-cols-8 gap-1">
									{#each category.emojis as emoji}
										<button
											type="button"
											onclick={() => selectEmoji(emoji)}
											class="w-8 h-8 flex items-center justify-center text-xl hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors"
										>
											{emoji}
										</button>
									{/each}
								</div>
							</div>
						{/each}
					{/if}
				{:else}
					<!-- Lucide icons -->
					{#each filteredLucideCategories as category}
						<div class="mb-3">
							<h4 class="text-xs font-semibold text-neutral-500 dark:text-neutral-400 mb-1 px-1">{category.name}</h4>
							<div class="grid grid-cols-8 gap-1">
								{#each category.icons as iconName}
									<button
										type="button"
										onclick={() => selectLucideIcon(iconName)}
										class="w-8 h-8 flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors"
										title={iconName}
									>
										{#if lucideComponents[iconName]}
											<svelte:component
												this={lucideComponents[iconName]}
												class="w-5 h-5 text-neutral-600 dark:text-neutral-300"
											/>
										{:else}
											<span class="w-5 h-5 bg-neutral-200 dark:bg-neutral-600 rounded animate-pulse"></span>
										{/if}
									</button>
								{/each}
							</div>
						</div>
					{/each}
					{#if filteredLucideCategories.length === 0}
						<p class="text-center text-neutral-500 py-4 text-sm">No results</p>
					{/if}
				{/if}
			</div>

			<!-- Clear button -->
			{#if value}
				<div class="p-2 border-t border-neutral-100 dark:border-neutral-700">
					<button
						type="button"
						onclick={clearIcon}
						class="w-full px-3 py-2 text-sm text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg transition-colors"
					>
						{$t('event.removeIcon')}
					</button>
				</div>
			{/if}
		</div>
	{/if}
</div>
```

**Step 2: Export from barrel**

In `src/lib/components/ui/index.ts`, add:

```typescript
export { default as IconPicker } from './IconPicker.svelte';
```

**Step 3: Verify types compile**

Run: `npm run check`
Expected: No type errors (i18n keys will be added in Task 7)

**Step 4: Commit**

```bash
git add src/lib/components/ui/IconPicker.svelte src/lib/components/ui/index.ts
git commit -m "feat: add IconPicker component with emoji and Lucide icon tabs"
```

---

### Task 6: Add icon field to EventForm

**Files:**
- Modify: `src/lib/components/event/EventForm.svelte`

**Step 1: Add IconPicker import**

In `src/lib/components/event/EventForm.svelte`, update the import on line 4:

```typescript
import { Button, Input, Select, Toggle, ColorPicker, IconPicker } from '$components/ui';
```

**Step 2: Add icon state**

After line 28 (`let colorOverride = ...`), add:

```typescript
let icon = $state(initialData.icon || '');
```

**Step 3: Add icon to template apply**

In the `applyTemplate` function (around line 69), add after the color_override check:

```typescript
if (template.icon) icon = template.icon;
```

Note: This requires the `icon` field on templates, which we already added to the Template type. The `templatesStore.getById` will return templates with the new field once data includes it.

**Step 4: Add icon to submit data**

In the `handleSubmit` function, add `icon` to the data object (around line 123):

```typescript
const data: EventFormData = {
	title,
	description: description || undefined,
	start_date: startDate,
	start_time: isAllDay ? undefined : startTime,
	end_date: endDate || undefined,
	end_time: isAllDay ? undefined : endTime || undefined,
	is_all_day: isAllDay,
	is_task: isTask,
	category: category || undefined,
	color_override: colorOverride || undefined,
	icon: icon || undefined,        // <-- ADD THIS LINE
	reminders: $state.snapshot(reminders),
	recurrence_rule: recurrenceRule ? $state.snapshot(recurrenceRule) : undefined,
	household: household || undefined,
	is_private: household ? isPrivate : undefined
};
```

**Step 5: Add IconPicker to template**

In the form template section, add the IconPicker between the title field and the event type toggles. Insert after the closing `</div>` of the title section (after line 160) and before the event type toggles `<div>` (line 162):

```svelte
<!-- Icon -->
<div>
	<label class="block text-sm font-medium text-neutral-700 mb-1">
		{$t('event.icon')}
		<span class="text-neutral-400 font-normal">({$t('common.optional')})</span>
	</label>
	<IconPicker value={icon} onSelect={(v) => icon = v} />
</div>
```

**Step 6: Verify types compile**

Run: `npm run check`
Expected: No type errors

**Step 7: Commit**

```bash
git add src/lib/components/event/EventForm.svelte
git commit -m "feat: add icon picker to event creation and editing form"
```

---

### Task 7: Add i18n keys for icon feature

**Files:**
- Modify: `src/lib/i18n/locales/en.json`
- Modify: `src/lib/i18n/locales/sv.json`

**Step 1: Add English i18n keys**

In `src/lib/i18n/locales/en.json`, add these keys to the `"event"` section (after line 63, before the closing `}`):

```json
"icon": "Icon",
"iconEmoji": "Emoji",
"iconIcons": "Icons",
"removeIcon": "Remove icon"
```

**Step 2: Add Swedish i18n keys**

In `src/lib/i18n/locales/sv.json`, add the corresponding keys to the `"event"` section:

```json
"icon": "Ikon",
"iconEmoji": "Emoji",
"iconIcons": "Ikoner",
"removeIcon": "Ta bort ikon"
```

**Step 3: Commit**

```bash
git add src/lib/i18n/locales/en.json src/lib/i18n/locales/sv.json
git commit -m "feat: add i18n keys for event icon feature (en + sv)"
```

---

### Task 8: Add icon to event creation and editing routes

**Files:**
- Modify: `src/routes/event/new/+page.svelte` (lines 25-36)
- Modify: `src/routes/event/[id]/+page.svelte` (lines 51-61, 89-108)

**Step 1: Pass icon in event creation**

In `src/routes/event/new/+page.svelte`, add `icon` to the `createEvent` call (around line 25):

```typescript
await calendar.createEvent({
	title: data.title,
	description: data.description,
	start_time: startTime,
	end_time: endTime,
	is_all_day: data.is_all_day,
	is_task: data.is_task,
	category: data.category,
	template: data.template,
	color_override: data.color_override,
	icon: data.icon,                // <-- ADD THIS LINE
	reminders: data.reminders,
	recurrence_rule: data.recurrence_rule
});
```

**Step 2: Pass icon in event update**

In `src/routes/event/[id]/+page.svelte`, add `icon` to the `updateEvent` call (around line 51):

```typescript
await updateEvent(event.id, {
	title: data.title,
	description: data.description,
	start_time: startTime,
	end_time: endTime,
	is_all_day: data.is_all_day,
	category: data.category,
	color_override: data.color_override,
	icon: data.icon,                // <-- ADD THIS LINE
	reminders: data.reminders,
	recurrence_rule: data.recurrence_rule
});
```

**Step 3: Pass icon to initialData in edit page**

In `src/routes/event/[id]/+page.svelte`, add `icon` to the `initialData` derived (around line 96):

```typescript
const initialData = $derived(() => {
	if (!event) return {};

	const start = new Date(event.start_time);
	const end = event.end_time ? new Date(event.end_time) : null;

	return {
		title: event.title,
		description: event.description,
		start_date: format(start, 'yyyy-MM-dd'),
		start_time: event.is_all_day ? undefined : format(start, 'HH:mm'),
		end_date: end ? format(end, 'yyyy-MM-dd') : undefined,
		end_time: end && !event.is_all_day ? format(end, 'HH:mm') : undefined,
		is_all_day: event.is_all_day,
		category: event.category,
		color_override: event.color_override,
		icon: event.icon,            // <-- ADD THIS LINE
		reminders: event.reminders,
		recurrence_rule: event.recurrence_rule
	};
});
```

**Step 4: Verify types compile**

Run: `npm run check`
Expected: No type errors

**Step 5: Commit**

```bash
git add src/routes/event/new/+page.svelte src/routes/event/[id]/+page.svelte
git commit -m "feat: pass icon field through event create and edit routes"
```

---

### Task 9: Render icons in EventBlock (day/week views)

**Files:**
- Modify: `src/lib/components/calendar/EventBlock.svelte`

**Step 1: Import EventIcon**

In `src/lib/components/calendar/EventBlock.svelte`, add the import at line 2:

```typescript
import { EventIcon } from '$components/ui';
```

**Step 2: Render icon before title**

In `EventBlock.svelte`, find the title `<span>` (around line 62-68). Add EventIcon before the title text. Change:

```svelte
<span class={cn(
	'font-medium truncate',
	compact ? 'text-xs' : 'text-sm leading-tight',
	event.is_completed && 'line-through opacity-80'
)}>
	{event.title}
</span>
```

To:

```svelte
<span class={cn(
	'font-medium truncate flex items-center gap-1',
	compact ? 'text-xs' : 'text-sm leading-tight',
	event.is_completed && 'line-through opacity-80'
)}>
	{#if event.icon}
		<EventIcon icon={event.icon} size="md" />
	{/if}
	{event.title}
</span>
```

**Step 3: Verify types compile**

Run: `npm run check`
Expected: No type errors

**Step 4: Commit**

```bash
git add src/lib/components/calendar/EventBlock.svelte
git commit -m "feat: render event icons in day/week view event blocks"
```

---

### Task 10: Render icons in MonthView

**Files:**
- Modify: `src/lib/components/calendar/MonthView.svelte`

**Step 1: Import EventIcon**

In `src/lib/components/calendar/MonthView.svelte`, add after line 3:

```typescript
import { EventIcon } from '$components/ui';
```

**Step 2: Render icon in month event pills**

In `MonthView.svelte`, find the event rendering inside the day cells (around lines 111-125). Change the event div content:

```svelte
<div
	class="px-1 py-0.5 rounded text-xs font-medium text-white truncate cursor-pointer hover:ring-1 hover:ring-white/50"
	style:background-color={event.color}
	onclick={(e) => { e.stopPropagation(); handleEventClick(event); }}
>
	{#if event.is_all_day}
		<span class="inline-flex items-center gap-0.5">
			{#if event.icon}<EventIcon icon={event.icon} size="sm" />{/if}
			{event.title}
		</span>
	{:else}
		<span class="inline-flex items-center gap-0.5">
			<span class="opacity-70">{event.start.getHours()}:{event.start.getMinutes().toString().padStart(2, '0')}</span>
			{#if event.icon}<EventIcon icon={event.icon} size="sm" />{/if}
			{event.title}
		</span>
	{/if}
</div>
```

**Step 3: Verify types compile**

Run: `npm run check`
Expected: No type errors

**Step 4: Commit**

```bash
git add src/lib/components/calendar/MonthView.svelte
git commit -m "feat: render event icons in month view calendar cells"
```

---

### Task 11: Render icons in EventCard

**Files:**
- Modify: `src/lib/components/event/EventCard.svelte`

**Step 1: Import EventIcon**

In `src/lib/components/event/EventCard.svelte`, add after line 2:

```typescript
import { EventIcon } from '$components/ui';
```

**Step 2: Render icon before title**

Find the title `<h3>` (around line 62). Change:

```svelte
<h3 class="text-lg font-semibold mt-1 truncate">
	{event.title}
</h3>
```

To:

```svelte
<h3 class="text-lg font-semibold mt-1 truncate flex items-center gap-1.5">
	{#if 'icon' in event && event.icon}
		<EventIcon icon={event.icon} size="lg" />
	{/if}
	{event.title}
</h3>
```

**Step 3: Verify types compile**

Run: `npm run check`
Expected: No type errors

**Step 4: Commit**

```bash
git add src/lib/components/event/EventCard.svelte
git commit -m "feat: render event icons in event detail cards"
```

---

### Task 12: Render icons in DayView all-day strip

**Files:**
- Modify: `src/lib/components/calendar/DayView.svelte`

**Step 1: Import EventIcon**

In `src/lib/components/calendar/DayView.svelte`, add after line 6:

```typescript
import { EventIcon } from '$components/ui';
```

**Step 2: Render icon in all-day event buttons**

Find the all-day events rendering (around lines 78-88). Change:

```svelte
<button
	type="button"
	class="w-full px-2 py-1 rounded text-left text-sm font-medium text-white truncate"
	style:background-color={event.color}
	onclick={() => handleEventClick(event)}
>
	{event.title}
</button>
```

To:

```svelte
<button
	type="button"
	class="w-full px-2 py-1 rounded text-left text-sm font-medium text-white truncate flex items-center gap-1"
	style:background-color={event.color}
	onclick={() => handleEventClick(event)}
>
	{#if event.icon}
		<EventIcon icon={event.icon} size="md" />
	{/if}
	{event.title}
</button>
```

**Step 3: Verify types compile**

Run: `npm run check`
Expected: No type errors

**Step 4: Commit**

```bash
git add src/lib/components/calendar/DayView.svelte
git commit -m "feat: render event icons in day view all-day event strip"
```

---

### Task 13: Add PocketBase migration

**Files:**
- Create: `pocketbase/pb_migrations/1769800000_add_icon_to_events.js`

**Step 1: Create migration file**

Create `pocketbase/pb_migrations/1769800000_add_icon_to_events.js`:

```javascript
/// <reference path="../pb_data/types.d.ts" />
migrate((app) => {
  const collection = app.findCollectionByNameOrId("pbc_1687431684")

  // add icon field
  collection.fields.addAt(17, new Field({
    "hidden": false,
    "id": "text_icon",
    "maxSize": 100,
    "name": "icon",
    "presentable": false,
    "required": false,
    "system": false,
    "type": "text"
  }))

  return app.save(collection)
}, (app) => {
  const collection = app.findCollectionByNameOrId("pbc_1687431684")

  // remove field
  collection.fields.removeById("text_icon")

  return app.save(collection)
})
```

**Step 2: Commit**

```bash
git add pocketbase/pb_migrations/1769800000_add_icon_to_events.js
git commit -m "feat: add PocketBase migration for icon field on events"
```

---

### Task 14: Build verification

**Step 1: Run type check**

Run: `npm run check`
Expected: No errors

**Step 2: Run build**

Run: `npm run build`
Expected: Build succeeds, no errors

**Step 3: Final commit (if any fixes needed)**

If fixes were required:

```bash
git add -A
git commit -m "fix: resolve build issues for event icons feature"
```
