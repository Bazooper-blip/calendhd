# Event Icons Design

Per-event visual icons (emoji + Lucide) as a visual aid for AuDHD users.

## Data Model

- Add `icon?: string` to `CalendarEvent`, `LocalEvent`, `DisplayEvent`, and `Template` types
- Storage format: raw emoji (`"🏃"`) or prefixed Lucide name (`"lucide:briefcase"`)
- Zod validation: `z.string().max(100).optional().or(z.literal(''))`
- PocketBase: add `icon` text field (optional, max 100) to `events` collection via migration
- Dexie: no index needed — field stored as part of event object

## Icon Picker Component

New component: `src/lib/components/ui/IconPicker.svelte`

- Two tabs: **Emoji** (reuse existing emoji picker pattern) and **Icons** (Lucide grid, searchable)
- Opens as popover/dropdown from a button showing current selection or "Add icon" placeholder
- Clear button to remove selection
- Returns unified string: `"😊"` or `"lucide:calendar"`
- Binds via `bind:value={icon}`

Lucide loading: import all icons into a name-to-component map at picker level (lazy-loaded when picker opens).

## Event Form Integration

- `IconPicker` placed between title and description fields in `EventForm.svelte`
- Labeled "Icon (optional)"
- Pre-populates when editing existing events
- `icon` added to form data object, written to IndexedDB on save

## Calendar View Rendering

New shared component: `src/lib/components/ui/EventIcon.svelte`

- Props: `icon` string, `size` (small/medium)
- Emoji: renders as `<span>` with text sizing
- `lucide:*`: dynamically imports and renders single Lucide SVG by name
- Uses `currentColor` for contrast compatibility
- No icon = no rendered element (no empty space)

### Display locations (icon before title, inline):

| View | Component | Icon size |
|------|-----------|-----------|
| Month cells | `MonthView.svelte` | ~12px / 0.75rem |
| Day/week blocks | `EventBlock.svelte` | ~14px / 0.875rem |
| Event card detail | `EventCard.svelte` | ~18px / 1.125rem |

## Sync & Migration

- No special sync logic — `icon` is a standard string field, handled by existing sync engine
- Conflict resolution: local-wins (existing behavior)
- PocketBase migration adds `icon` text field to `events` collection
- Existing events have no icon (undefined) — no backfill needed

## Templates

- Add `icon?: string` to `Template` type and schema
- Templates can carry a default icon for quick event creation

## Decisions

| Aspect | Decision |
|--------|----------|
| Scope | Per-event icon field |
| Sources | Native emoji + Lucide icons |
| Storage | Single `icon` string — raw emoji or `"lucide:name"` |
| Picker | Two-tab popover (Emoji / Lucide), searchable |
| Form placement | Between title and description, optional |
| Calendar display | Inline before title in all views, sized per context |
| Rendering | Shared `EventIcon.svelte` — span for emoji, dynamic SVG for Lucide |
| Sync | Standard field sync, no special handling |
| Migration | PocketBase text field + type updates |
