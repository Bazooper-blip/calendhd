# Expanded Icon & Emoji Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the icon/emoji picker from 224 items to ~550, add ADHD-optimized "Suggested" quick picks, and make the picker responsive with larger tap targets.

**Architecture:** Data-only expansion of existing emoji/icon arrays in IconPicker.svelte and EmojiPicker.svelte. CSS changes for responsive sizing. No new files, dependencies, or component restructuring.

**Tech Stack:** Svelte 5, Tailwind CSS 4, lucide-svelte

**Spec:** `docs/superpowers/specs/2026-04-05-expanded-icon-emoji-picker-design.md`

---

### Task 1: Expand IconPicker.svelte — Emoji Data

**Files:**
- Modify: `src/lib/components/ui/IconPicker.svelte`

- [ ] **Step 1: Replace the `emojiCategories` array (line 26-59) with the expanded set**

Replace the existing `emojiCategories` constant with:

```typescript
const emojiCategories = [
	{
		name: 'Suggested',
		emojis: ['🌅', '💊', '🍽️', '🌙', '🧹', '🚿', '💤', '💼', '💻', '📞', '📝', '🎯', '📅', '🏥', '🦷', '🧠', '🏃', '🧘', '☕', '🎂', '🎉', '🎮', '🎵', '👥', '🚗', '✈️', '🛒', '📦', '⚡', '⭐']
	},
	{
		name: 'Routine & Home',
		emojis: ['🏠', '🧹', '🚿', '💤', '🛏️', '🪴', '🔑', '🧺', '🪥', '🚰', '🛁', '🧴', '🪞', '💡', '🔒', '🏡', '🧸', '🕯️', '🧊', '📱']
	},
	{
		name: 'Work & Productivity',
		emojis: ['💼', '💻', '📞', '📧', '📝', '📅', '📊', '📋', '✅', '🎯', '📌', '🗓️', '📈', '✏️', '🖊️', '📎', '🗂️', '📁', '🖥️', '⏰', '🔔', '📢', '🤝', '👔']
	},
	{
		name: 'Health & Medical',
		emojis: ['🏥', '🦷', '🩺', '💊', '💉', '🧠', '❤️', '🩹', '🌡️', '🧪', '👁️', '🩻', '🏨', '🩸', '😷', '🤒', '🧬', '♿', '🩼', '🫀']
	},
	{
		name: 'Fitness & Wellness',
		emojis: ['🏃', '🧘', '🏋️', '🚴', '🏊', '⚽', '🎾', '🧘‍♀️', '💪', '🚶', '🤸', '🏄', '🧗', '🏌️', '⛷️', '🏓', '🥊', '🏸', '💧', '🧖']
	},
	{
		name: 'Food & Drink',
		emojis: ['☕', '🍵', '🥤', '🍔', '🍕', '🍜', '🍱', '🥡', '🍳', '🥐', '🍰', '🍪', '🥛', '🍺', '🍷', '🧁', '🥗', '🍎', '🍝', '🥘', '🍣', '🌮', '🥪', '🧇']
	},
	{
		name: 'Social & Celebrations',
		emojis: ['🎂', '🎉', '🎁', '👥', '🤝', '☕', '🍽️', '💐', '🥂', '🎊', '💒', '🎈', '🥳', '🎀', '💌', '🫂', '🤗', '🙋', '👋', '🎆']
	},
	{
		name: 'Travel & Transport',
		emojis: ['✈️', '🚗', '🚌', '🚆', '🏨', '🗺️', '🚕', '📦', '🚲', '🛵', '🚢', '🚁', '🛫', '🛬', '⛽', '🅿️', '🚏', '🧳', '🏖️', '🗼', '🎡', '🏕️', '🌍', '🧭']
	},
	{
		name: 'Education',
		emojis: ['📚', '🎓', '✏️', '📖', '🧪', '🗣️', '🎒', '💡', '📐', '🔬', '🧮', '📓', '🖍️', '🎨', '🌐', '📝']
	},
	{
		name: 'Nature & Weather',
		emojis: ['🌸', '🌺', '🌻', '🌳', '🌴', '🌊', '⛰️', '🌙', '☀️', '🌈', '❄️', '🔥', '💨', '🌍', '🌵', '🍀', '🌧️', '⛈️', '🌤️', '🌪️', '🌱', '🍂', '🦋', '🌾']
	},
	{
		name: 'Finance',
		emojis: ['💰', '💳', '🏦', '📊', '🧾', '💵', '💲', '📉', '📈', '🪙', '💎', '🏧', '🤑', '💸', '📒', '🧮']
	},
	{
		name: 'Kids & Family',
		emojis: ['👶', '🏫', '🎨', '⚽', '🎵', '🎭', '🧸', '🎠', '🎪', '🧒', '👦', '👧', '👨‍👩‍👧', '🍼', '🎮', '📚']
	},
	{
		name: 'Pets',
		emojis: ['🐕', '🐱', '🐾', '🐟', '🐴', '🐰', '🐦', '🐢', '🦜', '🐹', '🐍', '🦎']
	},
	{
		name: 'Objects & Symbols',
		emojis: ['🔑', '🔒', '💎', '🎀', '📷', '🎧', '🧩', '🔧', '🔨', '🔋', '🎥', '🕹️', '📻', '⚙️', '🧲', '🔭', '📡', '🪄', '🎲', '🏆', '🚨', '🔄', '❌', '🚫']
	},
	{
		name: 'Flags',
		emojis: ['🏁', '🚩', '🏳️', '🇺🇸', '🇬🇧', '🇸🇪', '🇩🇪', '🇫🇷', '🇪🇸', '🇮🇹', '🇯🇵', '🇰🇷', '🇨🇳', '🇧🇷', '🇨🇦', '🇦🇺', '🇮🇳', '🇲🇽', '🇳🇴', '🇫🇮']
	},
	{
		name: 'Smileys & Expressions',
		emojis: ['😊', '😴', '🤔', '😤', '🥳', '🤒', '😎', '😅', '🥰', '😢', '😡', '🤯', '😱', '🫠', '😌', '🙄', '😬', '🤓', '😇', '🥱', '😶', '🫡', '😮', '🤩']
	}
];
```

- [ ] **Step 2: Verify the emoji count**

Count should be approximately 350 emojis across 16 categories. The Suggested category has 30.

---

### Task 2: Expand IconPicker.svelte — Lucide Icon Data

**Files:**
- Modify: `src/lib/components/ui/IconPicker.svelte`

- [ ] **Step 1: Replace the `lucideCategories` array (line 63-88) with the expanded set**

Replace the existing `lucideCategories` constant with:

```typescript
const lucideCategories = [
	{
		name: 'Suggested',
		icons: ['calendar', 'clock', 'bell', 'heart', 'pill', 'brain', 'target', 'zap', 'briefcase', 'house', 'check', 'star', 'coffee', 'car', 'plane', 'book-open', 'dumbbell', 'users', 'shopping-cart', 'mail']
	},
	{
		name: 'Common',
		icons: ['calendar', 'clock', 'bell', 'check', 'star', 'heart', 'house', 'briefcase', 'mail', 'phone', 'map-pin', 'bookmark', 'flag', 'target', 'zap', 'award']
	},
	{
		name: 'Activities',
		icons: ['bike', 'dumbbell', 'music', 'gamepad-2', 'film', 'book-open', 'plane', 'car', 'shopping-cart', 'utensils', 'coffee', 'wine', 'palette', 'camera', 'headphones', 'ticket', 'theater', 'clapperboard', 'dice-5', 'tent']
	},
	{
		name: 'Health',
		icons: ['pill', 'stethoscope', 'brain', 'heart-pulse', 'apple', 'droplets', 'moon', 'sun', 'thermometer', 'eye', 'shield', 'activity', 'salad', 'bed', 'bath', 'leaf', 'syringe', 'bandage', 'scan', 'accessibility']
	},
	{
		name: 'Work',
		icons: ['laptop', 'monitor', 'code', 'presentation', 'chart-bar', 'wallet', 'file-text', 'clipboard', 'pen-tool', 'paperclip', 'folder', 'credit-card', 'graduation-cap', 'users', 'handshake', 'megaphone', 'calculator', 'archive', 'inbox', 'printer']
	},
	{
		name: 'People',
		icons: ['user', 'users', 'baby', 'dog', 'cat', 'cake', 'party-popper', 'gift', 'smile', 'laugh', 'hand-heart', 'crown', 'person-standing', 'glasses', 'shirt', 'flower-2', 'heart-handshake', 'message-circle', 'phone-call', 'video']
	},
	{
		name: 'Travel',
		icons: ['map', 'compass', 'navigation', 'train-front', 'bus', 'ship', 'rocket', 'globe', 'mountain', 'tent', 'trees', 'umbrella', 'luggage', 'fuel', 'anchor', 'sunrise', 'car-taxi-front', 'parking-meter', 'signpost', 'highway']
	},
	{
		name: 'Weather',
		icons: ['cloud', 'cloud-rain', 'cloud-snow', 'sun', 'moon', 'snowflake', 'wind', 'rainbow', 'thermometer-sun', 'cloud-lightning', 'cloud-drizzle', 'cloud-fog', 'haze', 'cloudy', 'sun-moon', 'waves']
	},
	{
		name: 'Home & Routine',
		icons: ['bed', 'bath', 'lamp', 'sofa', 'alarm-clock', 'key', 'lock', 'door-open', 'washing-machine', 'microwave', 'refrigerator', 'cooking-pot', 'shirt', 'spray-can', 'trash-2', 'recycle']
	},
	{
		name: 'Education',
		icons: ['book-open', 'notebook-pen', 'pencil', 'ruler', 'school', 'library', 'languages', 'microscope', 'atom', 'flask-conical', 'calculator', 'backpack', 'pen', 'highlighter', 'notebook', 'square-pen']
	},
	{
		name: 'Finance',
		icons: ['wallet', 'receipt', 'piggy-bank', 'banknote', 'coins', 'credit-card', 'landmark', 'trending-up', 'trending-down', 'circle-dollar-sign', 'hand-coins', 'chart-line']
	}
];
```

- [ ] **Step 2: Verify the icon count**

Count should be approximately 200 icons across 11 categories. The Suggested category has 20.

- [ ] **Step 3: Commit data expansion**

```bash
git add src/lib/components/ui/IconPicker.svelte
git commit -m "feat: expand emoji and icon selection in IconPicker

Add ADHD-optimized Suggested category with 30 emojis and 20 icons.
Expand from 128 to ~350 emojis across 16 categories.
Expand from 96 to ~200 Lucide icons across 11 categories."
```

---

### Task 3: Update IconPicker.svelte — Responsive Sizing

**Files:**
- Modify: `src/lib/components/ui/IconPicker.svelte`

- [ ] **Step 1: Update dropdown width class**

In the dropdown container div (line 205), change:
```html
<div class="absolute z-50 mt-2 w-80 bg-white dark:bg-neutral-800 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
```
to:
```html
<div class="absolute z-50 mt-2 w-full sm:w-96 bg-white dark:bg-neutral-800 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
```

- [ ] **Step 2: Update scroll area max-height**

In the content container div (line 245), change:
```html
<div class="max-h-64 overflow-y-auto p-2">
```
to:
```html
<div class="max-h-80 overflow-y-auto p-2">
```

- [ ] **Step 3: Update all grid and button classes for responsive sizing**

There are 6 grid instances and 6 button size instances in the template. Update ALL of them.

Every occurrence of:
```html
class="grid grid-cols-8 gap-1"
```
change to:
```html
class="grid grid-cols-6 sm:grid-cols-8 gap-1"
```

Every emoji button occurrence of:
```html
class="w-8 h-8 flex items-center justify-center text-xl hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors"
```
change to:
```html
class="w-10 h-10 flex items-center justify-center text-xl hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors"
```

Every Lucide icon button occurrence of:
```html
class="w-8 h-8 flex items-center justify-center text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors"
```
change to:
```html
class="w-10 h-10 flex items-center justify-center text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors"
```

- [ ] **Step 4: Commit responsive sizing changes**

```bash
git add src/lib/components/ui/IconPicker.svelte
git commit -m "feat: responsive sizing for IconPicker

Desktop: 384px wide (w-96), 8-col grid.
Mobile: full-width, 6-col grid for larger tap targets.
Buttons: 40x40px (up from 32px). Scroll area: 320px (up from 256px)."
```

---

### Task 4: Expand EmojiPicker.svelte — Data + Responsive Sizing

**Files:**
- Modify: `src/lib/components/ui/EmojiPicker.svelte`

- [ ] **Step 1: Replace the `emojiCategories` array (line 16-49) with the same expanded set from Task 1**

Use the exact same `emojiCategories` array as in Task 1 Step 1.

- [ ] **Step 2: Update dropdown width class**

In the dropdown container div (line 100), change:
```html
<div class="absolute z-50 mt-2 w-72 bg-white dark:bg-neutral-800 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
```
to:
```html
<div class="absolute z-50 mt-2 w-full sm:w-96 bg-white dark:bg-neutral-800 rounded-xl shadow-lg border border-neutral-200 dark:border-neutral-700 overflow-hidden">
```

- [ ] **Step 3: Update scroll area max-height**

In the content container div (line 112), change:
```html
<div class="max-h-64 overflow-y-auto p-2">
```
to:
```html
<div class="max-h-80 overflow-y-auto p-2">
```

- [ ] **Step 4: Update all grid and button classes for responsive sizing**

There are 3 grid instances and 3 button size instances. Update ALL of them.

Every occurrence of:
```html
class="grid grid-cols-8 gap-1"
```
change to:
```html
class="grid grid-cols-6 sm:grid-cols-8 gap-1"
```

Every emoji button occurrence of:
```html
class="w-8 h-8 flex items-center justify-center text-xl hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors"
```
change to:
```html
class="w-10 h-10 flex items-center justify-center text-xl hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded transition-colors"
```

- [ ] **Step 5: Commit EmojiPicker changes**

```bash
git add src/lib/components/ui/EmojiPicker.svelte
git commit -m "feat: expand emoji selection and responsive sizing for EmojiPicker

Same expanded emoji set as IconPicker (350+ emojis, 16 categories).
Responsive: full-width mobile, 384px desktop. 40px tap targets."
```

---

### Task 5: Verify and Final Commit

**Files:**
- All modified files

- [ ] **Step 1: Run type check**

```bash
npm run check
```

Expected: 0 errors (warnings are pre-existing and acceptable).

- [ ] **Step 2: Verify Lucide icon names resolve**

Open the dev server (`npm run dev`), navigate to event creation, open the icon picker, switch to the Icons tab. Verify icons render (no blank squares). Check the browser console for any import errors.

- [ ] **Step 3: Test responsive behavior**

In browser dev tools, toggle between mobile (375px width) and desktop (1024px width). Verify:
- Mobile: picker is full-width, 6-column grid, buttons are comfortably tappable
- Desktop: picker is 384px, 8-column grid
- Scroll area is taller (320px) in both modes

- [ ] **Step 4: Push to remote**

```bash
git push
```
