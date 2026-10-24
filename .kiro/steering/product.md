---
inclusion: always
---

# AccessPath AI: product rules

AccessPath AI tells a rider whether an MBTA subway trip can be done **step-free right now**. The rider saves a trip (origin station, destination station, profile: `wheelchair` | `stroller` | `no_stairs`). The app reads live MBTA V3 data, runs the decision engine in `lib/engine/`, and shows one of three states.

## The three states

| State | Colour + icon + text | Meaning |
|---|---|---|
| `STEP_FREE` | green, check, "Step-free" | Verified. Safe to plan the trip. |
| `NOT_STEP_FREE` | red, cross, "Not step-free" | A verified problem blocks the trip. |
| `UNKNOWN` | gray, question mark, "Cannot confirm" | We cannot verify. Treat as "do not rely on it". |

## Correctness rules (the engine must follow these exactly)

1. Never return `STEP_FREE` unless verified. Missing, stale (older than 10 minutes, `STALE_AFTER_MINUTES`) or failed data gives `UNKNOWN`.
2. A trip is `STEP_FREE` only if both stations are wheelchair accessible per MBTA and no active blocking alert affects either station.
3. Blocking alerts: station closure, stop closure, access issue, elevator closure or outage, uneven platform or similar accessibility issues.
4. An elevator outage does NOT automatically block a station. If another working elevator serves the same required platform (per `lib/data/platform-map.ts`), the station stays usable. If we cannot verify which platform an elevator serves, the result is `UNKNOWN`, not `STEP_FREE`.
5. Escalator outages are informational only and never block step-free.
6. An alert counts only while it is active: now is inside one of its `active_period` ranges.
7. Out of scope: checking transfer stations, buses, Commuter Rail, accounts, push notifications, multiple languages.
8. Only the origin and destination are checked. A trip that needs a change of line, or whose connection
   cannot be worked out from MBTA route patterns, is shown as `UNKNOWN` even when both ends pass
   (`presentableStatus()` in `lib/engine/journey.ts`). The engine verdict itself is unchanged and is
   shown in the evidence trace.
9. Map markers are each station's own `evaluateStation()` verdict. No outage is not the same as green.

## Honesty rules

- Never invent MBTA data. Fake data exists only in `/api/demo` and in `tests/`, and the UI must label it "Simulated demo data".
- The offline snapshot is labelled "Offline snapshot, not live". Because it keeps its original `fetchedAt`, it usually reads as stale and gives `UNKNOWN`.
- Never suggest an alternative station that is itself `UNKNOWN`, blocked, or one of the trip endpoints.
- `platform-map.ts` is hand-built from MBTA facility names and must be hand-verified by a teammate.
