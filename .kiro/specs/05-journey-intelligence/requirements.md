# 05 Journey intelligence: requirements (EARS)

Scope: interactive MBTA map, disruption simulator, AI journey explainer, mobility-profile switching,
journey evidence timeline, and three correctness fixes found during the UI review.
Builds on specs 01 to 04. The decision engine (`lib/engine/rules.ts`, `evaluate-trip.ts`) is NOT
rewritten: every requirement here either reads its output or narrows it, never widens it.

## Glossary

- **Verdict**: the `TripResult.status` from `evaluateTrip`.
- **Displayed verdict**: the verdict the UI shows after the journey cap (R3.3). Can only be equal to or
  more cautious than the verdict.
- **Route relationship**: how origin and destination connect on the subway network, derived from the
  MBTA canonical route patterns: `direct`, `transfer`, or `unknown`.
- **Geographic reference**: an official MBTA shape polyline. A scheduled pattern, not a verified path
  the rider will take.

## R1 Interactive map

1. THE app SHALL render an interactive geographic map (pan, zoom, touch gestures) using real station
   coordinates from the MBTA snapshot and real line geometry from MBTA `/route_patterns` shapes.
2. THE map SHALL credit its tile provider and OpenStreetMap contributors, and SHALL credit the MBTA for
   line and station data.
3. WHEN the map cannot load (WebGL unavailable, tiles or geometry fail), THE page SHALL show a labelled
   fallback and SHALL keep every verdict, alert and explanation fully readable without the map.
4. THE line geometry SHALL be served by `GET /api/network`, cached server-side for 24 hours, with a
   committed offline copy for `FORCE_OFFLINE=1` and for MBTA failure. The response SHALL include
   `dataSource` and `fetchedAt`.
5. Station marker state SHALL come from `evaluateStation` for that station and profile on the same
   snapshot the trip used. A marker SHALL be green ONLY when that station's own verdict is `STEP_FREE`
   on fresh data. Stale or invalid data SHALL make every marker gray.
6. THE map SHALL NOT show any station as green merely because it has no reported outage when its
   verdict is not `STEP_FREE` (for example an unmapped elevator outage, or `wheelchair_boarding`
   unknown).
7. THE map SHALL have a legend that pairs every colour with an icon shape and a text label.
8. WHEN a marker is selected, THE app SHALL show the station's name, lines, MBTA accessibility value,
   its own verdict with reasons, its active alerts with the original MBTA text, the data time and the
   data source. The panel SHALL distinguish "an elevator is out" from "no verified step-free path".
9. EVERY marker SHALL be reachable by keyboard through a text station list that mirrors the map, so
   the map is never the only way to reach station details.

## R2 Selected journey on the map

1. WHEN a trip is shown, THE map SHALL highlight origin and destination, fit the view to them, and
   SHALL draw the official geometry of the line(s) involved.
2. THE map SHALL label that geometry "MBTA line geometry (reference, not a verified itinerary)".
3. WHEN the route relationship is `transfer`, THE app SHALL say a transfer is required, name the
   candidate transfer station(s) the canonical patterns share, and SHALL state that transfer stations
   are not checked.
4. WHEN the route relationship is `unknown`, THE app SHALL NOT draw or describe a direct route.
5. THE alternative station returned by the engine SHALL be marked on the map. No other station SHALL be
   presented as an alternative.

## R3 Correctness fixes

1. **Line contrast.** Every line chip and map label SHALL meet WCAG AA 4.5:1. The Orange Line SHALL use
   dark text on the official fill (the MBTA's own white-on-`#ED8B00` measures 2.53:1 and fails;
   `#0F172A` on `#ED8B00` measures 7.05:1). Measured: Red 4.87, Green 4.81, Blue 9.50 with white.
2. **Route relationship.** THE UI SHALL NOT present a fallback line as a confirmed shared line. Only
   `direct` shows a single line as the trip's line.
3. **Journey cap.** IF the route relationship is not `direct` AND the verdict is `STEP_FREE`, THEN the
   displayed verdict SHALL be `UNKNOWN` with a reason explaining that a transfer station was not
   checked. The cap SHALL NEVER upgrade a verdict.
4. THE app SHALL state, on every result, that only the origin and destination stations are checked.

## R4 Disruption simulator

1. THE simulator SHALL reuse `/api/demo` and the three existing scenario ids
   (`all-clear`, `elevator-outage-alewife`, `api-down`). No new scenario ids.
2. THE presenter controls SHALL be reachable from the top of the results view without scrolling to the
   footer, and SHALL switch scenario in one click.
3. WHEN demo mode is on, THE app SHALL show a persistent "SIMULATED SCENARIO" label on the verdict, the
   map, and the explainer, AND SHALL show the fixed scenario trip (Alewife to Park Street, wheelchair)
   so the rider is not misled into thinking it is their saved trip.
4. WHEN the scenario changes, THE verdict, affected markers, alerts, explanation, timeline and
   alternative SHALL update together from one response. Transitions SHALL be skipped under
   `prefers-reduced-motion`.
5. WHEN demo mode is switched off, THE app SHALL return to the saved trip on real data.

## R5 AI journey explainer

1. THE explainer SHALL be titled "Understand your journey" and SHALL answer "What happened?",
   "Why does it affect me?" and "What can I do next?".
2. THE AI request SHALL include origin, destination, profile, verdict, reasons, alerts, alternative,
   data source, freshness, and the route relationship.
3. THE AI SHALL NOT override the verdict. Output that claims accessibility on a non-`STEP_FREE`
   result, or that contradicts the verdict, SHALL be rejected and replaced by templates.
4. "What can I do next?" SHALL list only actions backed by data in the result (an existing alternative,
   an MBTA notice, refresh, ask staff). It SHALL NOT invent routes, times or working elevators.
5. THE "AI-generated" badge SHALL appear only when `usedAI` is true.
6. THE explainer SHALL work fully with no `ANTHROPIC_API_KEY` (deterministic templates).

## R6 Mobility profiles

1. THE results view SHALL let the rider switch profile without re-entering the trip. The new profile
   SHALL be saved to the existing `accesspath.trip` storage with origin and destination unchanged.
2. WHEN the profile changes, THE app SHALL re-run `/api/status` and refresh the verdict, explanation,
   markers and timeline.
3. THE app SHALL explain what each profile actually changes in the engine. It SHALL NOT claim a
   difference the rules do not make. (Today: `stroller` uses exactly the wheelchair rules; `no_stairs`
   differs only in that uneven-platform alerts are informational.)
4. THE comparison view SHALL compute every profile's verdict with the real engine on the same data and
   SHALL show identical results as identical, with the reason.

## R7 Evidence timeline

1. THE timeline SHALL be an ordered **decision trace** built from the actual `TripResult`, snapshot
   time, profile and route relationship.
2. A timestamp SHALL be shown ONLY when it exists in the data (`fetchedAt`, check time, an alert's
   `updatedAt` or active-period start). Steps without a real timestamp SHALL show none. No invented
   times.
3. THE timeline SHALL show the data source, the original MBTA notice, alert and facility ids where
   meaningful, why each alert affects the trip, and why a result is `UNKNOWN` when it is.
4. THE timeline SHALL NOT expose API keys or server internals.
