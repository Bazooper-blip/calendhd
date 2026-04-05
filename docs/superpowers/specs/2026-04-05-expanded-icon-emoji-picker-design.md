# Expanded Icon & Emoji Picker

**Date:** 2026-04-05
**Status:** Approved

## Summary

Expand the icon and emoji selection in calenDHD's event picker from 224 items (128 emojis + 96 Lucide icons) to ~550 items (~350 emojis + ~200 Lucide icons). Add a "Suggested" quick picks section at the top of both tabs optimized for ADHD calendar use, reducing decision paralysis while still offering a deep selection for users who want to browse.

## Motivation

The current curated set of 224 icons/emojis is too limited for a calendar app. Users need icons for specific event types (dentist, medication, package delivery, school pickup, etc.) that aren't available. ADHD users in particular benefit from visual differentiation of events, but too many options causes decision paralysis — so the design uses a curated "Suggested" section first, with the full expanded set below.

## Design

### Quick Picks ("Suggested" Category)

A new first category in both the emoji and Lucide icon tabs, labeled "Suggested". Contains the most commonly used items for calendar events based on research of ADHD planner apps and productivity tools.

**Suggested Emojis (~30):**
Routine & Self-Care: morning, medication, meals, bedtime, cleaning, shower, sleep
Work & Productivity: briefcase, laptop, phone, notes, target, calendar
Health & Medical: hospital, dentist, brain/therapy, running, yoga
Social & Fun: coffee, birthday, party, gaming, music, group
Travel & Errands: car, plane, shopping, package
Energy/Priority: lightning (high energy), snail (low energy), siren (urgent), star

**Suggested Lucide Icons (~20):**
calendar, clock, bell, heart, pill, brain, target, zap, briefcase, home, check, star, coffee, car, plane, book, dumbbell, users, shopping-cart, mail

### Expanded Emoji Set (~350 total)

Organized into 16 categories:

| Category | ~Count | Description |
|----------|--------|-------------|
| Suggested | 30 | ADHD-optimized quick picks (see above) |
| Routine & Home | 20 | House, cleaning, sleep, keys, laundry, plants |
| Work & Productivity | 24 | Office, meetings, tasks, deadlines |
| Health & Medical | 20 | Doctor, dentist, medication, therapy, vaccination |
| Fitness & Wellness | 20 | Exercise, sports, meditation, hydration |
| Food & Drink | 24 | Meals, cooking, restaurants, beverages |
| Social & Celebrations | 20 | Birthdays, parties, dates, group events |
| Travel & Transport | 24 | Flights, driving, transit, hotels, packages |
| Education | 16 | Study, school, reading, languages |
| Nature & Weather | 24 | Seasons, weather, outdoors, plants |
| Finance | 16 | Money, bills, banking, budgets |
| Kids & Family | 16 | Baby, school, activities, toys |
| Pets | 12 | Dogs, cats, vet, pet care |
| Objects & Symbols | 24 | Keys, locks, tools, cameras, puzzles |
| Flags | 20 | Racing, common country flags, markers |
| Smileys & Expressions | 24 | Emotions, reactions, states |

### Expanded Lucide Icon Set (~200 total)

Organized into 11 categories:

| Category | ~Count | Description |
|----------|--------|-------------|
| Suggested | 20 | Most-used calendar icons (see above) |
| Common | 16 | Existing set (calendar, clock, bell, etc.) |
| Activities | 20 | Sports, hobbies, entertainment |
| Health | 20 | Medical, wellness, body |
| Work | 20 | Office, productivity, business |
| People | 20 | Users, family, social |
| Travel | 20 | Transport, maps, navigation |
| Weather | 16 | NEW: cloud, rain, sun, snow, wind |
| Home & Routine | 16 | NEW: bed, bath, key, alarm, lamp |
| Education | 16 | NEW: book, pencil, ruler, school |
| Finance | 12 | NEW: wallet, receipt, piggy-bank |

### UI Changes

**Responsive Picker Sizing:**
- Desktop (>=640px): 384px wide (w-96), max-height-80 (320px scroll area), 8-column grid
- Mobile (<640px): full parent width, max-height-80, 6-column grid for larger tap targets
- Icon/emoji buttons: 40x40px (up from ~32px) for better touch targets
- Meets WCAG 2.5.8 target size recommendation with gap included

**IconPicker.svelte:**
- "Suggested" category appears first in both emoji and icon tabs
- All existing categories retained, new categories added below
- Responsive grid: 8 columns desktop, 6 columns mobile
- Picker width: w-96 desktop, full-width mobile
- Scroll area: max-h-80 (320px, up from 256px)
- Search works across the full expanded set
- Lazy loading of Lucide icons preserved (tab activation)

**EmojiPicker.svelte:**
- Same expansion and responsive sizing applied
- "Suggested" first, then full categories

**EventIcon.svelte:**
- No changes needed — rendering logic handles any emoji or `lucide:name` string

### What Doesn't Change

- Icon storage format: raw emoji string or `"lucide:name"` prefix
- EventIcon.svelte rendering logic
- EventForm.svelte integration (onSelect callback)
- Database schema — `icon` field remains `string | undefined`
- No new npm dependencies

## Files to Modify

1. `src/lib/components/ui/IconPicker.svelte` — Expand emoji and icon arrays, add Suggested category
2. `src/lib/components/ui/EmojiPicker.svelte` — Expand emoji arrays, add Suggested category

## Testing

- Verify all emojis render correctly in the picker grid
- Verify all new Lucide icon names resolve via dynamic import
- Verify search filters across the expanded set
- Verify selected icons display correctly in EventBlock and category cards
- Verify picker performance with larger dataset (scroll smoothness)
