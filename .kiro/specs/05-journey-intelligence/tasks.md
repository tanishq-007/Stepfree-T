# 05 Journey intelligence: tasks

Stages are vertical slices: each one ended with typecheck + tests green.

## Stage A: data and correctness foundation
- [x] A1 `lib/data/polyline.ts` Google polyline decoder + tests (Google reference vector, malformed input)
- [x] A2 `lib/data/network.ts` Zod schema + `normalizeNetwork()` for `/route_patterns` (canonical, shape, stops)
- [x] A3 Network fetch (1 request, 24 h cache) + committed `mbta-network.json` offline copy + `npm run network`
- [x] A4 `GET /api/network` (`dataSource`, `fetchedAt`, `kind: "reference"`, 502 never crash)
- [x] A5 `lib/engine/journey.ts` `routeRelationship()` + `presentableStatus()` (R3.2, R3.3)
- [x] A6 Line colour contrast fix in `lib/client/lines.ts` (R3.1); `commonLine()` no longer falls back
- [x] A7 Property tests I1, I2, I9 (and a mutation check that each fails when its guard is removed)

## Stage B: map
- [x] B1 `lib/engine/station-map.ts` `stationStatuses()` (R1.5, R1.6) + property tests I3, I4
- [x] B2 `/api/status` and `/api/demo` return additive `journey`, `display`, `stations`, `stationAlerts`, `profiles`, `coverage`
- [x] B3 `components/map/TransitMap.tsx` (MapLibre, dynamic import, WebGL check, timeout, fallback, attribution)
- [x] B4 `StationList.tsx` accessible equivalent, `StationDetail.tsx` panel, `MapLegend.tsx` (R1.7 to R1.9)
- [x] B5 Fix found in browser QA: MapLibre v6 worker URL (`scripts/copy-map-worker.mjs` + `setWorkerUrl`)
- [x] B6 Fix found in browser QA: `zoom` inside `case` is invalid in a paint expression
- [x] B7 Fix found in browser QA: `.maplibregl-map{position:relative}` collapsed the absolute container

## Stage C: simulator
- [x] C1 `components/PresenterBar.tsx` (R4.2, R4.3) on the shared demo store; `usePresenter()`
- [x] C2 Verdict, markers, explainer, timeline update from one response; reduced motion respected (R4.4)
- [x] C3 Property test I5 + static isolation test `tests/data/demo-isolation.test.ts`
- [x] C4 Fix found in browser QA: one stale frame of demo data under "Your trip" after switching off (`mismatched` guard + per-frame browser check)

## Stage D: explainer
- [x] D1 `lib/ai/guide.ts`: `whatHappened`, `whyItMatters`, `nextSteps` from data only
- [x] D2 AI prompt + validation: step-set check, invented-station check, negative-claim check
- [x] D3 `components/JourneyExplainer.tsx` ("Understand your journey"), badge only when `guide.source === "ai"`
- [x] D4 Tests: template guide, AI guide accepted, four rejection cases, contradicting green result
- [ ] D5 Run the AI path against the real Anthropic API (no key available; stubbed only)

## Stage E: profiles
- [x] E1 `lib/engine/profiles.ts` `compareProfiles()`; `PROFILE_IMPACT` checked against `impactFor()` for every kind
- [x] E2 `components/ProfileSwitcher.tsx` on the results view; persists via `withProfile` + `saveTrip`
- [x] E3 `components/ProfileComparison.tsx` with the per-kind rule table
- [x] E4 Property test I6 (and browser check: profile persists across reload, stations unchanged)

## Stage F: timeline
- [x] F1 `lib/engine/trace.ts` `buildTrace()` (decision trace, real times only)
- [x] F2 `components/EvidenceTimeline.tsx` ("How we decided")
- [x] F3 Property tests I7, I8

## Stage G: integration and validation
- [x] G1 Results page layout (desktop map left / verdict right; mobile verdict first)
- [x] G2 Steering: `data-integrity.md`, `ai-grounding.md`, `ui-design.md`, `testing.md`; `product.md` rules 8 and 9
- [x] G3 Hooks: `engine-rules-tests`, `contract-typecheck`, `demo-live-isolation`
- [x] G4 typecheck, tests, `FORCE_OFFLINE=1 npm run build`, browser QA at 375/768/1440, 26 interaction checks
- [x] G5 Development journal `journal.md`
- [ ] G6 Screen reader pass (VoiceOver/NVDA) and an automated axe audit (not done)
- [ ] G7 Real-device test on a phone (not done; headless Chromium only)
