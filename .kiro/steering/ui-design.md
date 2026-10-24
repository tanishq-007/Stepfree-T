---
inclusion: fileMatch
fileMatchPattern: "{app,components}/**/*.{ts,tsx,css}"
---

# UI design system

Complements `accessibility.md` (the hard rules). This file is about consistency.

## Tokens (`tailwind.config.ts`)

- Text: `text-ink` (primary), `text-ink-soft`, `text-ink-muted`. Brand: `brand-700` actions, `brand-50` tints.
- Status: `status-free` / `status-blocked` / `status-unknown` with `-tint` backgrounds. Always via
  `StatusChip` or `StatusBanner`, which pair colour with icon and text.
- Simulated data is always **violet** (`violet-50/100/300/700/900`). Nothing else uses violet.
- Snapshot / not-live / transfer warnings are **amber**.
- Line colours come from `lineStyle()` in `lib/client/lines.ts` only. Orange uses `text-ink` because white
  on `#ED8B00` is 2.53:1 (fails AA). `tests/components/contrast.test.ts` checks every line.

## Components

- Surfaces: `.card`. Buttons: `.btn-primary`, `.btn-secondary`, `.btn-ghost`. Inputs: `.field`. Pills: `.chip`.
- Section labels: `.eyebrow`. Loading: `.skeleton` (shimmer is off under reduced motion).
- Verdict change: `StatusBanner` is keyed by status/scenario/profile and plays `.verdict-enter` once.

## Layout (results page)

- DOM order = reading order = mobile order: presenter bar, verdict, data source, profile, alternative,
  refresh, map, explainer, evidence, profiles, alerts.
- Desktop (`lg`): map left (7/12), verdict right (5/12), via grid placement, not DOM reordering.
- Never hide a stale-data or simulated label to make a screen look cleaner.

## Map

- The canvas is `aria-hidden`; `StationList` is the text equivalent and drives the same selection.
- Markers use colour + glyph (check, cross, question) + legend text.
- If the map cannot start, `RouteSchematic` replaces it with the failure reason.
