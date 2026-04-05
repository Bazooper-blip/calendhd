# Accent Color Picker Design

**Goal:** Let users pick a primary/accent color from 6 curated palettes. The choice syncs to PocketBase and applies across light/dark modes.

## Accent Palettes

6 curated accent colors, each defining a full 50-900 primary scale for calm ADHD-friendly aesthetics:

| Name | 500 Hex | Character |
|------|---------|-----------|
| Sage | `#5f8069` | Default, natural calm |
| Ocean | `#5b85a6` | Cool, focused |
| Lavender | `#8b7bab` | Gentle, creative |
| Rose | `#b07a8a` | Warm, soft |
| Amber | `#a68b5b` | Earthy, grounded |
| Teal | `#5b9e96` | Fresh, balanced |

Each palette overrides `--color-primary-50` through `--color-primary-900` via a CSS class on `<html>` (e.g., `.accent-ocean`). No class = sage (default). Secondary, accent, and neutral scales are unchanged.

## Architecture

### CSS (`src/app.css`)

Add `.accent-<name>` classes after the `@theme` block. Each class overrides the 10 primary custom properties. Sage needs no class (it's the default in `@theme`). Example:

```css
.accent-ocean {
  --color-primary-50: #f0f5f9;
  --color-primary-100: #d9e6f0;
  /* ... through 900 */
}
```

These classes work in both light and dark modes because components already reference the right shade per context (e.g., `bg-primary-50` in light, `bg-primary-900/30` in dark).

### Data flow

1. User selects accent in Settings page
2. `settingsStore.update({ color_palette: 'ocean' })` writes to IndexedDB, syncs to PocketBase
3. `+layout.svelte` reads `settingsStore.colorPalette` and applies `.accent-{name}` class to `<html>`
4. CSS custom properties take effect immediately

### Schema change

Update `color_palette` select values in PocketBase migration + `pb_schema.json`:
- From: `['default', 'muted', 'vibrant']`
- To: `['sage', 'ocean', 'lavender', 'rose', 'amber', 'teal']`

Default: `'sage'`. Old values (`default`, `muted`, `vibrant`) fall back to sage in the settings store getter.

### Settings store

Add/update the `colorPalette` getter in `settings.svelte.ts` to return the accent name, falling back to `'sage'` for old values.

### Settings UI

New "Accent Color" row in the Appearance section of the settings page. 6 color circles (using the 500-shade as preview), labelled, with the active one visually highlighted (ring/checkmark). Clicking updates immediately.

### i18n

Add keys under `settings.accent*` in both `en.json` and `sv.json` for the section label and each color name.

## Scope

- Only the primary color scale changes (secondary lavender, accent peach, neutral warm gray stay fixed)
- No new components needed (inline in settings page)
- No changes to event/category per-item color overrides
- Focus ring color (`--color-primary-500`) updates automatically since it references the custom property
