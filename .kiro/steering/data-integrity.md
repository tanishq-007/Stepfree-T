---
inclusion: fileMatch
fileMatchPattern: "{lib,app/api}/**/*.ts"
---

# MBTA data integrity and live/simulated separation

## Sources

| Data | Source | Freshness | Committed fallback |
|---|---|---|---|
| Stations, facilities, alerts | MBTA V3 `/stops`, `/facilities`, `/alerts` | live, cached 60 s | `lib/data/snapshots/mbta-snapshot.json` |
| Line geometry, stop order | MBTA V3 `/route_patterns?filter[canonical]=true&include=representative_trip.shape,representative_trip.stops` | cached 24 h | `lib/data/snapshots/mbta-network.json` (`npm run network`) |
| Base map tiles | OpenFreeMap (OpenMapTiles, OSM) | n/a | none: the UI falls back to a schematic |

## Rules

1. Real MBTA field names only. Write schemas from a real response (`tests/fixtures/`), keep them `.passthrough()`.
2. Never invent coordinates, geometry, travel times, walking distances, working elevators, or transfers.
   If a shape or stop list is missing, skip it (see `normalizeNetwork`).
3. MBTA shapes are **scheduled patterns**, not a rider's verified path. Label them "reference, not a
   verified itinerary".
4. Only `app/api/demo/route.ts` may import `lib/data/demo-snapshot.ts`. Enforced by
   `tests/data/demo-isolation.test.ts`.
5. Every response that carries data includes `dataSource` and `fetchedAt`. Demo responses also carry
   `simulated: true` and `label: "Simulated demo data"`.
6. The UI must never show a `demo` result under the real "Your trip" heading, even for one frame
   (`app/page.tsx` `mismatched` guard).
7. Do not commit an auto-refreshed `mbta-snapshot.json` together with unrelated work.
