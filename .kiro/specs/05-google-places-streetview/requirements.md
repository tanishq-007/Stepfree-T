# 05 Google Places and Street View: requirements (EARS)

Owner: Pradyannya (AI and integration). Scope: two optional features that use Google Maps Platform, their routes, cards and tests.
Neither feature changes a trip status. They add help around a trip. The decision engine does not import them.

## General

1. WHERE `GOOGLE_MAPS_API_KEY` is not set, THE app SHALL hide both features and SHALL work exactly as before. No route SHALL throw to the client.
2. THE key SHALL be read only on the server. It SHALL NOT have a `NEXT_PUBLIC_` prefix and SHALL NOT appear in any URL, JSON body, header or image sent to the browser, including error responses.
3. EVERY new route SHALL validate input with Zod, return JSON errors, return 400 `{error, details}` for bad input, and export `dynamic = "force-dynamic"`.
4. WHEN a `stationId` is not a known station, THE routes SHALL return 404 `{error}` (the same as `/api/alerts`). A rider-controlled value SHALL never become a free-form location sent to Google.
5. IF Google fails (network error, timeout, non-2xx, unreadable body), THEN THE routes SHALL return 502 `{error}` with a fixed message that does not repeat anything Google or the network layer said.
6. ALL Google payloads SHALL be parsed with lenient Zod schemas (`.passthrough()`, optional fields) written from the saved fixtures in `tests/fixtures`.
7. ALL rider text SHALL follow `plain-language.md`. ALL UI SHALL follow `accessibility.md`.
8. THE UI SHALL say the data comes from Google, may be incomplete, and may be out of date. It SHALL NOT present Google data as MBTA data.

## Feature A: accessible restrooms nearby

9. WHEN `GET /api/restrooms?stationId=&radius=` is called, THE route SHALL accept `radius` from 1 to 800 meters (default 400) and SHALL return 400 for anything else.
10. THE route SHALL look up the station's latitude and longitude from the existing station data.
11. THE route SHALL call Places API (New) Nearby Search (`POST https://places.googleapis.com/v1/places:searchNearby`) from the server with the headers `X-Goog-Api-Key` and `X-Goog-FieldMask`.
12. THE field mask SHALL contain only `places.id`, `places.displayName`, `places.location`, `places.accessibilityOptions`, `places.currentOpeningHours.openNow` and `places.googleMapsUri`.
13. THE request SHALL use the place types `library`, `cafe`, `restaurant`, `shopping_mall` and `transit_station`.
14. THE route SHALL keep only places where `accessibilityOptions.wheelchairAccessibleRestroom` is exactly `true`, sort them by straight-line distance from the station (`haversineKm`), and return at most 5.
15. THE normalizer SHALL map each accessibility field to `"yes" | "no" | "unknown"`. A missing, null or non-boolean value SHALL map to `"unknown"` and SHALL NEVER map to `"yes"`.
16. THE route SHALL cache results in memory for 1 hour per station. Failures SHALL NOT be cached.
17. THE response SHALL be `{stationId, places: [{id, name, distanceMeters, openNow: boolean | null, wheelchairRestroom: "yes", wheelchairEntrance, mapsUrl}], source: "google", fetchedAt}`.
18. THE `RestroomCard` SHALL appear for the origin and the destination, collapsed by default, with the title "Wheelchair-accessible restrooms near {station}".
19. EACH listed place SHALL show its name, the distance in plain words ("about 3 minutes away"), "Open now", "Closed now" or "Hours unknown", and an "Open in Google Maps" link with a descriptive `aria-label`.
20. THE card SHALL show "Reported by Google. May be incomplete. Some restrooms are for customers only." When there are no places it SHALL show "We could not find a reported wheelchair-accessible restroom nearby."

## Feature B: accessible entrances (map and photos)

This replaces the first version of Feature B (one photo per station, which could show a "Station area"). Scope rule: show ONLY entrances that MBTA marks wheelchair accessible. Never show a photo or a map for a non-accessible or unmarked entrance, and never label a generic station-area photo as an entrance.

21. THE entrances SHALL come from MBTA `GET /stops/{station}?include=child_stops`: child stops with `location_type` 2 whose `wheelchair_boarding` is exactly 1 (accessible; real data uses only 1 and 2 for entrances) and that have a latitude and longitude. A value of 0, 2, null or missing SHALL mean "not marked accessible". The data is public, so this part needs no Google key.
22. THE route SHALL keep MBTA's order (the order of the station's `child_stops` relationship) and return at most 3 entrances per station.
23. IF no entrance qualifies, THEN THE route SHALL return `entrances: []` and the UI SHALL say "We couldn't find an entrance marked wheelchair accessible for this station." with no photo and no map.
24. WHEN `GET /api/entrances?stationId=` is called, THE route SHALL return `{stationId, stationName, entrances: [{id, name, lat, lng, photo, mapUrl, googleMapsLink}]}`. THE `name`, `lat` and `lng` SHALL be MBTA's.
25. FOR each entrance (key set), THE route SHALL call the Street View metadata endpoint with `source=outdoor`. IF the status is `OK`, THEN the heading SHALL be the compass bearing (0 up to but not including 360, a pure function in `lib/engine/geo.ts`) from the panorama to the entrance, and `photo` SHALL be `{available: true, captureDate, copyright, imageUrl}` with `imageUrl` = `/api/streetview/image?entranceId=...`. IF the status is not `OK`, THEN `photo` SHALL be `{available: false, captureDate: null, copyright: null, imageUrl: null}`.
26. `photo` SHALL be `null` when we did not get an answer: no Google key, or the Google call failed. `mapUrl` SHALL be `/api/entrance-map?stationId=...` when a key is set, and `null` without one. `googleMapsLink` SHALL be `https://www.google.com/maps/search/?api=1&query=LAT,LNG` with no key.
27. A failed Google call SHALL NOT fail the route: names and Maps links still come back. No part of the response SHALL contain the key.
28. WHEN `GET /api/streetview/image?entranceId=` is called, THE route SHALL look the entrance up in MBTA and SHALL refuse (404) any stop that is not an entrance marked accessible with coordinates. It SHALL fetch the Street View Static image (640x400, `fov=80`, `pitch=0`, the computed `heading`, `source=outdoor`, `return_error_code=true`) and stream the bytes with `Cache-Control: public, max-age=3600`. It SHALL NOT write images to disk.
29. WHEN `GET /api/entrance-map?stationId=` is called, THE route SHALL fetch a Maps Static API image (640x320, `scale=2`) with one marker per accessible entrance labelled `1`, `2`, `3` in the same order as the list, a differently coloured marker labelled `S` for the station, and the view fitted to all markers. It SHALL stream the bytes with the same caching rules as requirement 28. IF there are no accessible entrances, THEN it SHALL return 404 and call nothing.
30. THE `AccessibleEntranceCard` SHALL appear for the origin and the destination (replacing `EntrancePhoto`), headed "Accessible entrances at {station}".
31. WHEN a map is available, THE card SHALL show it first, with alt text such as "Map of Alewife station showing 2 accessible entrances: 1, Alewife Brook Pkwy elevator; 2, Busway elevator."
32. THE card SHALL then list each entrance as a numbered item whose number is the map label. Each item SHALL show the entrance name in plain words (MBTA's own "2 | " numbering prefix removed so it cannot clash with ours), the lazy-loaded photo with the caption "Photo facing this entrance, taken {month year}. May have changed." and "Image © Google", alt text "Street-level photo facing the {entrance name} accessible entrance at {station}, taken {month year}.", and an "Open in Google Maps" link. Its `aria-label` is "Open in Google Maps: {entrance name} location". (The first draft asked for "Open {entrance name} location in Google Maps", but then the accessible name does not contain the visible words "Open in Google Maps", which fails WCAG 2.5.3 Label in Name and an axe rule. The label keeps the same words and starts with the visible text.)
33. IF an entrance has no photo (`available: false`), THEN its item SHALL say "No street photo available for this entrance." IF `photo` is `null`, THEN the item SHALL say nothing about photos.
34. Numbers and words, not colour alone, SHALL connect the list to the map pins. The map legend SHALL say that S is the station.
35. WHERE the key is missing, THE card SHALL show no map and no photos, and SHALL still show the heading, the numbered entrance names and the Google Maps links.
36. WHERE the photo's copyright is not Google's, THE caption SHALL name that provider.

## Tests

37. A property test SHALL show the normalizer never maps a missing or undefined field to `"yes"` (restrooms).
38. A property test SHALL show the bearing is always in [0, 360).
39. A property test SHALL show `/api/restrooms` never returns a place whose `wheelchairRestroom` is not `"yes"`.
40. A property test SHALL show `/api/entrances` never returns an entrance that MBTA does not mark accessible, never more than 3, and keeps MBTA's order.
41. A property test SHALL show the map marker labels and the list numbers always match in count and order.
42. API tests with mocked Google and MBTA answers (from the saved fixtures) SHALL cover, for entrances: accessible entrances found, none found, no Street View photo for one entrance, a Google error, a missing key, and bad input (400). For restrooms: success, empty results, Google error (502), missing key, and bad input.
43. A test SHALL show that no response body or header from any Google route contains the key, including when Google or the network error message contains it.
