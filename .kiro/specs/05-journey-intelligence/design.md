# 05 Journey intelligence: design

## Principle

Everything new is a **reader** of the engine, never a second decision-maker. The only place a status
is changed after `evaluateTrip` is `presentableStatus()`, and it can only move a verdict towards
caution (`STEP_FREE` -> `UNKNOWN`). This is enforced by a property test.

## Data flow

```
MBTA /route_patterns?filter[canonical]=true&include=representative_trip.shape,representative_trip.stops
        |  (1 request, ~200 KB, cached 24 h; committed offline copy lib/data/snapshots/mbta-network.json)
        v
lib/data/network.ts      normalizeNetwork(): lines[{id, line, color, shapes[[lng,lat]...], stationIds[]}]
        |
GET /api/network         {lines, dataSource, fetchedAt}            (reference geometry only)

GET /api/status          TripResult  + trip  + journey  + stations  (journey and stations are NEW, additive)
GET /api/demo            same shape, simulated
        |
lib/engine/journey.ts    routeRelationship(origin, dest, network)  -> direct | transfer | unknown
                         presentableStatus(result, journey)        -> cap STEP_FREE when not direct
lib/engine/station-map.ts stationStatuses(snapshot, profile, now)  -> per-station evaluateStation()
lib/engine/trace.ts       buildTrace(result, journey, profile, checkedAt) -> ordered steps
lib/engine/profiles.ts    compareProfiles(trip, snapshot, now)      -> real verdict per profile
```

`journey` and `stations` are added to the route **response** objects only. `TripResult` in
`lib/types.ts` is unchanged, so the engine, `/api/explain` validation and every existing test keep
working.

## Why the network is reference-only

MBTA shapes describe scheduled patterns (for example Alewife to Braintree). They are drawn for orientation.
The UI never claims the rider's exact path, never computes travel time or distance, and labels the layer
"reference, not a verified itinerary".

## Route relationship

From canonical patterns build `line -> Set(stationId)` (platform stop ids folded to parent stations
using the `parent_station` relationship included in the same response).

- `direct`: some line contains both stations. Report that line (and only that line).
- `transfer`: no shared line, but a line through origin and a line through destination share at least
  one station. Report the shared station(s) as candidate transfer points.
- `unknown`: network unavailable, a station missing from the network, or no single-transfer connection.

Transfers are never evaluated by the engine (spec 02 scope). So `transfer` and `unknown` cap a green
verdict to `UNKNOWN` with reason code `TRANSFER_NOT_CHECKED` or `ROUTE_UNKNOWN`.

## Station markers

`stationStatuses()` calls the existing `evaluateStation()` per station with the trip's profile. If the
snapshot is not fresh (`checkFreshness`), every station is `UNKNOWN`. Markers carry status, reason
codes, and alert ids; the client looks alerts up in the snapshot alert list the route also returns.
For demo responses only the demo snapshot's 8 Red Line stations are returned (no real data mixed in).

## Map component

- `maplibre-gl` (BSD-3), loaded with `next/dynamic` + `ssr: false` so it never runs on the server.
- Base style: OpenFreeMap Positron (`https://tiles.openfreemap.org/styles/positron`), keyless,
  OpenMapTiles + OSM data. Attribution kept on.
- Layers: line geometry (official colour, faded unless part of the trip), trip-line highlight,
  station circles coloured by status with a **shape glyph** symbol layer (check / cross / question) so
  colour is not the only signal, larger rings for origin, destination, alternative.
- Map canvas is `aria-hidden` for its visual content; a real `<ul>` station list next to it is the
  accessible equivalent and drives the same selection state.
- Failure: WebGL check + `error` event -> fallback card. Geometry fetch failure -> markers only + note.

## Explainer

`/api/explain` already returns `{summary, explanations, usedAI}`. Add optional `guide` fields
`{whatHappened, whyItMatters, nextSteps[]}` to the response. Templates build them deterministically from
the result. The AI prompt asks for the same keys; `validateModelOutput` gains a check that rejects any
`nextSteps` naming a station other than the engine's alternative, and the existing positive-claim
guard covers all new text. The request body gains optional `journey` context; old clients still work.

## Profiles

`compareProfiles()` runs `evaluateTrip` once per profile on the same snapshot and `now`. Facts shown to
the rider come from `PROFILE_RULES`, a static description derived from `impactFor()` and checked by a
test against `impactFor()` itself so the copy cannot drift from the rules.

## Timeline

`buildTrace()` returns `{id, kind, title, detail, status?, time?: {iso, label}, evidence?}`. `time` is
only set from `fetchedAt`, `checkedAt`, `alert.updatedAt` or `alert.activePeriod[0].start`. A property
test checks every emitted `time.iso` is one of those inputs.

## Presenter

`PresenterBar` (sticky, top of results) wraps the existing `demo-store`. One click per scenario. The
footer `DemoSwitch` stays as the entry point and shares the same store.

## Invariants (all property-tested)

- I1 `presentableStatus` never returns a status better than the engine's.
- I2 Non-`direct` relationship never displays `STEP_FREE`.
- I3 Stale snapshot -> every station marker `UNKNOWN`.
- I4 A station marker is `STEP_FREE` only if `evaluateStation` says so.
- I5 Demo responses are always `dataSource: "demo"`; live/snapshot never are.
- I6 Changing profile keeps `originId`/`destinationId` byte-identical.
- I7 Every blocking alert in the result appears in the trace.
- I8 No trace timestamp that is not in the inputs.
- I9 Line chips meet 4.5:1.
