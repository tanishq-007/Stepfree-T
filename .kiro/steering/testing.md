---
inclusion: always
---

# Testing expectations

Run before every commit: `npm run typecheck`, `npm test`, `FORCE_OFFLINE=1 npm run build`.

## What must be a property test (fast-check)

Anything that is a safety claim about all inputs, not one example:

| Invariant | Test |
|---|---|
| Missing/stale evidence never gives `STEP_FREE` | `tests/engine/evaluate-trip.property.test.ts` |
| I1 display cap never upgrades a verdict | `tests/engine/journey.property.test.ts` |
| I2 transfer/unknown route never shows `STEP_FREE` | `tests/engine/journey.property.test.ts` |
| I3 stale data makes every marker `UNKNOWN` | `tests/engine/station-map.property.test.ts` |
| I4 marker = `evaluateStation` | `tests/engine/station-map.property.test.ts` |
| I5 demo responses always labelled simulated | `tests/api/journey-intelligence.test.ts` |
| I6 profile change keeps station ids | `tests/engine/profiles.test.ts` |
| I7 every blocker appears in the trace | `tests/engine/trace.property.test.ts` |
| I8 no invented timestamps | `tests/engine/trace.property.test.ts` |
| I9 line chips meet 4.5:1 | `tests/components/contrast.test.ts` |
| No direct segment drawn for transfers | `tests/components/map-geo.test.ts` |

## Rules

- Fake data only in `tests/` and `lib/data/demo-snapshot.ts`. Prefer trimmed real MBTA responses in
  `tests/fixtures/` for adapters.
- Component tests assert semantics (roles, labels, icon + text, `data-status`), not Tailwind classes.
- A new safety guard needs a test that fails when the guard is removed (check it by breaking the code once).
- Do not claim a live-API or real-AI test passed if it ran against fixtures or a stub. Say which.
