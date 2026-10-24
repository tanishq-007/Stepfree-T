# 05 Google Places and Street View: tasks

Feature B was rewritten (accessible entrances, map and photos). Items for the first version of Feature B (one photo per station, "Station area") were removed with it.

## Before code

- [x] Read the official docs: Nearby Search (New), place types (Table A), place data fields and billing, Street View metadata and image, Maps Static markers. Confirmed endpoints, headers, field names, type names and billing tiers
- [x] Called every API for real with the project key and saved trimmed real responses in `tests/fixtures`: Places (found, empty, invalid key), Street View metadata (OK, ZERO_RESULTS, REQUEST_DENIED), MBTA entrances for Alewife, Bowdoin and Back Bay, and one single stop
- [x] Checked MBTA entrance values in real data (333 entrances): `wheelchair_boarding` is 1 or 2; the `child_stops` relationship order differs from `included`
- [x] Lenient Zod schemas (`.passthrough()`, optional fields) for every Google payload

## Feature A: restrooms

- [x] `GET /api/restrooms` with Zod input, 400/404/502, 1 hour cache per station, `force-dynamic`
- [x] `normalizeAccessibility` ("yes" | "no" | "unknown", missing is never "yes")
- [x] `RestroomCard` on the home page for both trip stations, collapsed by default
- [x] Property tests: normalizer never maps missing to "yes"; route never returns a place whose restroom is not "yes"
- [x] API tests with mocked Google: success, empty, Google error, missing key, bad input
- [x] Live call with a real key for `place-alfcl`; the five places and distances match an independent calculation

## Feature B: accessible entrances

- [x] MBTA entrances in MBTA order, only `wheelchair_boarding` = accessible, with coordinates, at most 3 (`lib/data/entrances.ts`)
- [x] `GET /api/entrances` with the response shape from the brief (names and Maps links work without a key)
- [x] `GET /api/streetview/image?entranceId=` (refuses any stop that is not an accessible entrance; 640x400, fov 80, pitch 0, computed heading, `return_error_code=true`, `Cache-Control: public, max-age=3600`, nothing on disk)
- [x] `GET /api/entrance-map?stationId=` (640x320, scale 2, numbered markers in list order, station marker `S`, fitted to all markers)
- [x] `bearingDegrees` (pure, [0, 360)) in `lib/engine/geo.ts`
- [x] `AccessibleEntranceCard` replaces `EntrancePhoto` and is wired into the home page for both trip stations
- [x] Property tests: route never returns a non-accessible entrance (random MBTA data, MBTA order, at most 3); bearing in [0, 360); map labels and list numbers match in count and order (route and card)
- [x] API tests with mocked Google and MBTA: found, none found, no photo for one entrance, Google error, missing key, bad input (400), key never in any body or header
- [x] Mutation checks: the filter, the marker order and a key leak were each broken on purpose and the tests failed
- [x] Live call with a real key: `/api/entrances?stationId=place-alfcl` and three `/api/streetview/image?entranceId=...` photos load (valid 640x400 JPEG)
- [ ] **NOT VERIFIED: `/api/entrance-map` against the real Google API.** The Maps Static API is not enabled for the project key (Google answers 403 "This API is not activated on your API project"). The route, the URL it builds and the card handling are tested with mocks only. Enable "Maps Static API" in Google Cloud, then open `/api/entrance-map?stationId=place-alfcl` to confirm the markers
- [ ] Look at the real map picture (needs the line above): check that pins 1 to 3 and S are readable at the auto-fitted zoom, especially for a station with one entrance very close to the station point

## Checks

- [x] `npm test` (251 tests) and `npm run build` pass
- [x] Real Chrome with axe-core on the home page with a real trip: 0 violations (cards open), tap targets at least 44 px, no overflow at 320 px, the browser never contacts Google and never sees the key (also absent from `.next/static`)
- [x] axe found a real conflict between the brief's `aria-label` and the visible link text (WCAG 2.5.3). Fixed; see requirement 32
- [ ] VoiceOver / TalkBack pass (not done)

## Known problems and follow-ups

- [ ] The nearest Street View photo often does not show the entrance (inside the station, a wall, a bus). The camera faces the entrance spot and the card says the view may be blocked, but a better check is not built. About half the photos seen were from third parties, some from 2015 to 2022
- [ ] No rate limit on the Google routes. Station and entrance ids are checked against MBTA data and results are cached, but a script could request many pictures. Set a quota cap and a budget alert for the key before a public deploy
- [ ] The card shows a "Looking for accessible entrances" message while loading; the restroom card shows nothing while loading
- [ ] Open-now moves every restroom search to a higher Google billing tier. Removing `places.currentOpeningHours.openNow` from the field mask lowers the price
- [ ] Per-entrance caching of MBTA data is in memory per server instance (like the other caches)
