# Accent Color Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users pick from 6 curated accent color palettes that swap the primary color scale, persisting to PocketBase.

**Architecture:** CSS classes (`.accent-ocean`, etc.) on `<html>` override `--color-primary-*` custom properties. The settings store getter maps the `color_palette` field to the class name. Layout applies the class reactively.

**Tech Stack:** Tailwind CSS 4 custom properties, Svelte 5 runes, PocketBase schema

---

### Task 1: Add accent color CSS classes

**Files:**
- Modify: `src/app.css`

- [ ] **Step 1: Add accent palette classes after the high-contrast block (after line 129)**

Add these classes after the `.high-contrast` block in `src/app.css`:

```css
/* Accent color palettes */
.accent-ocean {
  --color-primary-50: #f0f6fa;
  --color-primary-100: #dae8f2;
  --color-primary-200: #b8d4e6;
  --color-primary-300: #8db9d5;
  --color-primary-400: #6d9fbe;
  --color-primary-500: #5b85a6;
  --color-primary-600: #496b87;
  --color-primary-700: #3d586e;
  --color-primary-800: #34495b;
  --color-primary-900: #2c3d4d;
}

.accent-lavender {
  --color-primary-50: #f7f5fa;
  --color-primary-100: #ede9f4;
  --color-primary-200: #dbd3e8;
  --color-primary-300: #c2b4d7;
  --color-primary-400: #a695c1;
  --color-primary-500: #8b7bab;
  --color-primary-600: #72638e;
  --color-primary-700: #5e5275;
  --color-primary-800: #4e4461;
  --color-primary-900: #423a52;
}

.accent-rose {
  --color-primary-50: #faf5f7;
  --color-primary-100: #f4e8ec;
  --color-primary-200: #e8d1d8;
  --color-primary-300: #d6afbb;
  --color-primary-400: #c3919f;
  --color-primary-500: #b07a8a;
  --color-primary-600: #926271;
  --color-primary-700: #79515e;
  --color-primary-800: #64444e;
  --color-primary-900: #543a43;
}

.accent-amber {
  --color-primary-50: #faf8f0;
  --color-primary-100: #f2edda;
  --color-primary-200: #e5dbb8;
  --color-primary-300: #d3c28d;
  --color-primary-400: #bda66f;
  --color-primary-500: #a68b5b;
  --color-primary-600: #88714a;
  --color-primary-700: #705d3e;
  --color-primary-800: #5d4d35;
  --color-primary-900: #4e412e;
}

.accent-teal {
  --color-primary-50: #f0faf8;
  --color-primary-100: #daf2ee;
  --color-primary-200: #b8e5de;
  --color-primary-300: #8dd2c8;
  --color-primary-400: #6dbcb0;
  --color-primary-500: #5b9e96;
  --color-primary-600: #49817a;
  --color-primary-700: #3d6b65;
  --color-primary-800: #345854;
  --color-primary-900: #2c4a47;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app.css
git commit -m "feat: add accent color palette CSS classes"
```

---

### Task 2: Update PocketBase schema

**Files:**
- Modify: `pocketbase/pb_schema.json`
- Modify: `pocketbase/pb_migrations/0001_initial_schema.js`

- [ ] **Step 1: Update `pb_schema.json` color_palette values**

In `pocketbase/pb_schema.json`, find the `set_palette` field inside the `calendhd_settings` collection and replace:

```json
"values": ["default", "muted", "vibrant"]
```

With:

```json
"values": ["sage", "ocean", "lavender", "rose", "amber", "teal"]
```

- [ ] **Step 2: Update migration color_palette values**

In `pocketbase/pb_migrations/0001_initial_schema.js`, find the `color_palette` field definition and replace:

```javascript
values: ["default", "muted", "vibrant"], maxSelect: 1
```

With:

```javascript
values: ["sage", "ocean", "lavender", "rose", "amber", "teal"], maxSelect: 1
```

- [ ] **Step 3: Update the same in `ha-deploy/pb_migrations/0001_initial_schema.js`**

Same change as step 2.

- [ ] **Step 4: Commit**

```bash
git add pocketbase/pb_schema.json pocketbase/pb_migrations/0001_initial_schema.js ha-deploy/pb_migrations/0001_initial_schema.js
git commit -m "feat: update color_palette schema to accent color names"
```

---

### Task 3: Update TypeScript types and defaults

**Files:**
- Modify: `src/lib/types/index.ts`
- Modify: `src/lib/api/pocketbase.ts`

- [ ] **Step 1: Update UserSettings type**

In `src/lib/types/index.ts`, replace:

```typescript
color_palette: 'default' | 'muted' | 'vibrant';
```

With:

```typescript
color_palette: 'sage' | 'ocean' | 'lavender' | 'rose' | 'amber' | 'teal';
```

- [ ] **Step 2: Update default settings**

In `src/lib/api/pocketbase.ts`, in the `getDefaultSettings()` function, replace:

```typescript
color_palette: 'default',
```

With:

```typescript
color_palette: 'sage',
```

- [ ] **Step 3: Verify types**

```bash
npm run check
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/types/index.ts src/lib/api/pocketbase.ts
git commit -m "feat: update color_palette type and default to accent names"
```

---

### Task 4: Add colorPalette getter to settings store and apply in layout

**Files:**
- Modify: `src/lib/stores/settings.svelte.ts`
- Modify: `src/routes/+layout.svelte`

- [ ] **Step 1: Add colorPalette getter to settings store**

In `src/lib/stores/settings.svelte.ts`, add a new getter after the `highContrast` getter (after line 51):

```typescript
get colorPalette(): 'sage' | 'ocean' | 'lavender' | 'rose' | 'amber' | 'teal' {
    const val = settings?.color_palette;
    // Fall back to sage for old values or missing
    if (val === 'sage' || val === 'ocean' || val === 'lavender' || val === 'rose' || val === 'amber' || val === 'teal') {
        return val;
    }
    return 'sage';
},
```

- [ ] **Step 2: Apply accent class in layout**

In `src/routes/+layout.svelte`, inside the `$effect` that applies theme/accessibility classes (the block that handles theme, reduce-animations, high-contrast), add after the high contrast block:

```typescript
// Accent color
const accents = ['accent-sage', 'accent-ocean', 'accent-lavender', 'accent-rose', 'accent-amber', 'accent-teal'];
html.classList.remove(...accents);
if (settingsStore.colorPalette !== 'sage') {
    html.classList.add(`accent-${settingsStore.colorPalette}`);
}
```

- [ ] **Step 3: Verify types**

```bash
npm run check
```

Expected: 0 errors

- [ ] **Step 4: Commit**

```bash
git add src/lib/stores/settings.svelte.ts src/routes/+layout.svelte
git commit -m "feat: apply accent color class from settings store"
```

---

### Task 5: Add i18n keys

**Files:**
- Modify: `src/lib/i18n/locales/en.json`
- Modify: `src/lib/i18n/locales/sv.json`

- [ ] **Step 1: Add English keys**

In `src/lib/i18n/locales/en.json`, inside the `"settings"` object, add after the `"themeSystem"` key:

```json
"accentColor": "Accent Color",
"accentSage": "Sage",
"accentOcean": "Ocean",
"accentLavender": "Lavender",
"accentRose": "Rose",
"accentAmber": "Amber",
"accentTeal": "Teal",
```

- [ ] **Step 2: Add Swedish keys**

In `src/lib/i18n/locales/sv.json`, inside the `"settings"` object, add after the `"themeSystem"` key:

```json
"accentColor": "Accentfärg",
"accentSage": "Salvia",
"accentOcean": "Hav",
"accentLavender": "Lavendel",
"accentRose": "Ros",
"accentAmber": "Amber",
"accentTeal": "Blågrön",
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/i18n/locales/en.json src/lib/i18n/locales/sv.json
git commit -m "feat: add i18n keys for accent color picker"
```

---

### Task 6: Add accent color picker to settings UI

**Files:**
- Modify: `src/routes/settings/+page.svelte`

- [ ] **Step 1: Add accent color data and UI**

In `src/routes/settings/+page.svelte`, add the accent palette data inside the `<script>` block (after line 148, before the closing `</script>`):

```typescript
const accentPalettes = [
    { value: 'sage', color: '#5f8069' },
    { value: 'ocean', color: '#5b85a6' },
    { value: 'lavender', color: '#8b7bab' },
    { value: 'rose', color: '#b07a8a' },
    { value: 'amber', color: '#a68b5b' },
    { value: 'teal', color: '#5b9e96' }
] as const;
```

Then in the template, inside the Appearance section (after the language `<Select>` div, before the closing `</div>` of `<div class="space-y-4">`), add:

```svelte
<div>
    <span class="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
        {$_('settings.accentColor')}
    </span>
    <div class="flex flex-wrap gap-3">
        {#each accentPalettes as palette}
            <button
                type="button"
                onclick={() => handleChange('color_palette', palette.value)}
                class="group flex flex-col items-center gap-1.5"
            >
                <div
                    class="w-10 h-10 rounded-full transition-all {settingsStore.colorPalette === palette.value
                        ? 'ring-2 ring-offset-2 ring-primary-500 scale-110'
                        : 'hover:scale-105'}"
                    style:background-color={palette.color}
                >
                    {#if settingsStore.colorPalette === palette.value}
                        <svg class="w-5 h-5 m-auto mt-2.5 text-white drop-shadow" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5">
                            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                    {/if}
                </div>
                <span class="text-xs text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition-colors">
                    {$_(`settings.accent${palette.value.charAt(0).toUpperCase() + palette.value.slice(1)}`)}
                </span>
            </button>
        {/each}
    </div>
</div>
```

- [ ] **Step 2: Verify types and run dev**

```bash
npm run check
```

Expected: 0 errors

- [ ] **Step 3: Manual test**

```bash
npm run dev
```

Open Settings → Appearance. Verify:
1. Six color circles with labels appear below the language selector
2. Sage is selected by default (checkmark + ring)
3. Clicking another color changes the primary accent across the entire UI immediately
4. Focus rings, buttons, sidebar active state, loading spinner all update
5. Switching dark/light mode preserves the accent choice
6. Refreshing the page restores the accent selection

- [ ] **Step 4: Commit**

```bash
git add src/routes/settings/+page.svelte
git commit -m "feat: add accent color picker to settings UI"
```
