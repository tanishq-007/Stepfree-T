# 05 Google Places and Street View: design

```
GET /api/restrooms?stationId=&radius=
  Zod(query) --400--> {error, details}
  no GOOGLE_MAPS_API_KEY ---------------------------> 200 {enabled:false}      (no MBTA call, no Google call)
  loadSnapshot -> station? --404--> {error}
  cached("google:restrooms:<id>", 1 h)
    POST places.googleapis.com/v1/places:searchNearby   radius 800, 20 nearest (rankPreference DISTANCE)
      -> parse each place leniently -> keep restroom === true -> sort by distance
  filter distance <= radius, first 5 --------------> 200 {stationId, places, source:"google", fetchedAt}
  Google failure ----------------------------------> 502 {error}                (fixed text)

GET /api/entrances?stationId=
  Zod --400--> ; loadSnapshot -> station? --404-->
  getStationEntrances (cached 1 h, no Google key needed)
    MBTA GET /stops/<id>?include=child_stops -> entrances in `child_stops` relationship order
    -> keep location_type 2, wheelchair_boarding === 1, with lat/lng -> first 3
    (MBTA down => 502 {error}; the entrances are the point of this route)
  none --------------------------------------------> 200 {stationId, stationName, entrances: []}
  per entrance, only if a key is set (Promise.allSettled, so one failure never hides the rest):
    Street View metadata (free, cached 1 h per point), source=outdoor
      OK           -> photo {available:true, captureDate, copyright, imageUrl:"/api/streetview/image?entranceId=..."}
      other status -> photo {available:false, ...null}
      call failed  -> photo null (logged)
  no key -> photo null and mapUrl null, names and Google Maps links still returned

GET /api/streetview/image?entranceId=
  Zod --400--> ; no key --> 404
  getEntrance(id)  cached 1 h, primed by /api/entrances  (MBTA GET /stops/<id>)
    not an entrance, or not marked accessible, or no coordinates --> 404
  Street View metadata -> not OK --> 404 {available:false}
  heading = bearingDegrees(panorama, entrance)
  GET maps.googleapis.com/maps/api/streetview?size=640x400&location=<entrance>&fov=80&pitch=0&heading=<h>&source=outdoor&return_error_code=true&key=...
  -> stream bytes, Cache-Control: public, max-age=3600

GET /api/entrance-map?stationId=
  Zod --400--> ; no key --> 404 ; unknown station --> 404 ; no accessible entrances --> 404 (nothing is called)
  GET maps.googleapis.com/maps/api/staticmap?size=640x320&scale=2
        &markers=color:blue|label:S|<station>&markers=color:green|label:1|<entrance 1>&... (no center or zoom: Google fits all markers)
  -> stream bytes, Cache-Control: public, max-age=3600
```

## Files

- `lib/google/config.ts`: reads the key, `GoogleApiError`, `googleFetch` (5 s timeout, never repeats the network error text).
- `lib/google/schemas.ts`: lenient Zod schemas for the Places response and the Street View metadata.
- `lib/google/accessibility.ts`: `normalizeAccessibility` (the `"yes" | "no" | "unknown"` mapping for restrooms).
- `lib/google/restrooms.ts`: Places request, `toRestroomPlaces` (pure filter, sort, limit), cached `getRestrooms`.
- `lib/google/streetview.ts`: metadata request, `resolvePhoto` (heading), image request.
- `lib/google/staticmap.ts`: `buildMapMarkers` (pure), the Maps Static request, `entranceMapAlt`.
- `lib/google/types.ts`: response types shared with the browser (types only, no server code).
- `lib/data/entrances.ts`: `normalizeEntrances` (MBTA order), `accessibleEntrances` (the only filter), lookups by station and by id. Also `fetchStationEntrances` and `fetchStop` in `lib/data/mbta-client.ts`.
- `lib/engine/geo.ts`: `bearingDegrees` next to `haversineKm`. (The brief said `lib/geo`. That file does not exist and the distance code already lives here, so the bearing sits beside it.)
- `lib/client/use-remote.ts`, `components/RestroomCard.tsx`, `components/AccessibleEntranceCard.tsx` (replaces `EntrancePhoto`).

## What the docs say (read before coding, then checked with real calls)

- Nearby Search (New) is `POST https://places.googleapis.com/v1/places:searchNearby`. A field mask is required (header `X-Goog-FieldMask`); with no mask the API answers 400. `maxResultCount` is 1 to 20. `rankPreference: "DISTANCE"` sorts nearest first. Place types come from Table A: `library`, `cafe`, `restaurant`, `shopping_mall`, `transit_station`.
- `accessibilityOptions` has four booleans: `wheelchairAccessibleParking`, `wheelchairAccessibleEntrance`, `wheelchairAccessibleRestroom`, `wheelchairAccessibleSeating`. In real answers the whole object is often absent (10 of 20 places at Alewife) and single keys are often missing. An empty search answers `{}`.
- Open now is `currentOpeningHours.openNow`. It is missing for many places (11 of 20 at Alewife).
- Street View metadata: `GET https://maps.googleapis.com/maps/api/streetview/metadata`. Free, no quota. The key is a URL parameter (there is no header option). Answers `status` (`OK`, `ZERO_RESULTS`, `REQUEST_DENIED`, ...), `date` as `YYYY-MM`, `location`, `pano_id`, `copyright`.
- Street View image: `GET https://maps.googleapis.com/maps/api/streetview`. `size`, `heading` (0 to 360), `fov` (max 120), `pitch`, `source=outdoor`, `return_error_code=true` (404 instead of a gray picture). It returns 404 with that flag when there is no image and 403 for a bad key.

- Maps Static API: `GET https://maps.googleapis.com/maps/api/staticmap`. `size` is required (max 640x640, `scale=2` doubles the pixels). A marker `label` is one uppercase letter or digit. With markers and no `center` or `zoom`, Google picks both so all markers fit ("implicit positioning"). Pipes must be sent as `%7C`.
- MBTA entrances (real data, 333 entrances checked): `location_type` 2, `wheelchair_boarding` is `1` (accessible, 214) or `2` (not accessible, 119), all have coordinates. The station's `child_stops` relationship lists entrances in a stable order that differs from the `included` order, so "MBTA order" means the relationship order. 36 of 125 subway stations have no entrance records at all.

## Billing (from the docs)

Google bills a Places request at the highest tier of any field in the mask.

| Field | Tier |
|---|---|
| `places.id`, `places.displayName`, `places.location`, `places.accessibilityOptions`, `places.googleMapsUri` | Pro |
| `places.currentOpeningHours` (the only source of "open now") | Enterprise |

So asking for open-now moves every restroom search from the Pro tier to the Enterprise tier. We keep it because the brief asks for it. Dropping `places.currentOpeningHours.openNow` from the mask is the one-line change that lowers the price. Metadata requests are free; Street View images and Maps Static images use quota (the Maps Static API must also be enabled for the key; it is a separate API). Every restroom search is cached for an hour per station, so a given station costs at most one search an hour.

## Decisions

- One Google search per station, always at 800 m, cached for an hour. The requested radius only filters the cached list. This keeps the cost bounded by the number of stations (125) and keeps "1 hour per station" true for any `radius`.
- Nearby Search returns the 20 nearest places, so a station with more than 20 closer places could hide a restroom further out. We report only what Google returns.
- The card shows "Open now" from data that is up to an hour old. The card says when the hours were checked.
- Walking time is straight-line distance at 60 m per minute. Real walks are longer, so the card says the times are rough.
- Missing key returns `200 {enabled:false}` for restrooms and `200 {available:false}` for the photo. The cards render nothing, so the page is unchanged.
- The Street View image is requested by location, not by panorama id (the docs say ids change). The heading is computed ourselves so it is tested. (Google would also face the point by default.)
- **Only entrances MBTA marks accessible are ever shown.** There is no "Station area" fallback any more. A missing flag (0, null) is treated as not accessible even though GTFS lets an entrance inherit its station's value: we would be guessing.
- **MBTA order, not nearest.** The first three accessible entrances in the station's own order are listed, as the brief asks. At Back Bay, ten entrances exist and four are not accessible, so the list skips those.
- **The photo may not show the entrance.** The camera is aimed at the entrance, but Street View returns the nearest panorama. Checked with real calls on the first version: Alewife showed ticket machines inside the station, North Station a tunnel wall, Ashmont a bus in the way. The required caption "Photo facing this entrance... May have changed." is used as written, and the card adds one line saying a nearby building or vehicle may block the view.
- A third-party panorama can win (a real Alewife answer was "© RoadTrip NewEngland", July 2020). The response carries `copyright` (an addition to the brief's photo object) and the card names the provider.
- `photo: null` means "we do not know" (no key, or Google failed). `photo: {available:false}` means Google answered and has no picture. The card says "No street photo available" only for the second.
- `mapUrl` is `null` without a key, because the map route would only answer 404. The brief lists `mapUrl` on each entrance; every entrance carries the same station map URL.
- Without a key the card stays, with the heading, numbered names and Google Maps links (they need no key). This is how the brief's "hide the whole card if the key is missing, but still show the entrance names and links" is read.
- MBTA names such as `7 | Franklin St` carry MBTA's own numbering. The card shows `Franklin St` so it cannot clash with our 1, 2, 3.
- The image route takes an entrance id, so it asks MBTA about that id (cached, and primed by `/api/entrances` so the page does not spend extra MBTA calls) and refuses anything that is not an accessible entrance. The browser still cannot ask for any other location.
- `stationId` and `entranceId` are checked against MBTA data. The routes never take coordinates from the browser, so the key cannot be used as a general proxy for Google.
- Errors: Google and network error text is never copied into a response. Street View puts the key in the URL, and a network error message can contain that URL.
