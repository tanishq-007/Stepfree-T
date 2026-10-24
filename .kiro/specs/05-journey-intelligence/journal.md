# 05 Journey intelligence: development journal

What was built, how Kiro was used, what broke, and what we decided. Only features that were
actually used are listed.

## Kiro features used

| Feature | How it was used | Evidence |
|---|---|---|
| Specs | Wrote `requirements.md` (EARS), `design.md`, `tasks.md` for spec 05 before writing code, and worked task by task in stages A to G. | This folder; tasks checked off as each stage went green. |
| Steering | Read the existing `product.md`, `tech.md`, `accessibility.md` first; they set the hard limits (engine is pure, no fake data outside demo/tests, colour never alone). Added `data-integrity.md`, `ai-grounding.md`, `ui-design.md`, `testing.md`. | `.kiro/steering/` |
| Agent hooks | Added three command hooks with `createHook`. | `.kiro/hooks/engine-rules-tests.json`, `contract-typecheck.json`, `demo-live-isolation.json` |
| Property-based testing | fast-check invariants I1 to I9 from the design doc. | `tests/engine/*.property.test.ts`, `tests/api/journey-intelligence.test.ts`, `tests/components/contrast.test.ts` |

Not used: Kiro Crew, MCP servers, Powers. The `.kiro/settings/.kirocrew-cli-settings.lock` file was
already in the repo and was not touched.

## How Kiro changed the result

- **Steering stopped a dishonest shortcut.** The obvious way to colour map markers is "green if no
  alert". `product.md` rule 1 ("never STEP_FREE unless verified") made that wrong, so markers call the
  engine's own `evaluateStation()`. Measured on the committed real snapshot (wheelchair, fresh clock):
  97 of 125 stations have no active alert, but 19 of those are red because the MBTA lists them as not
  wheelchair accessible. "No alert = green" would have shown 19 inaccessible stations as step-free.
- **The spec forced the transfer question.** Writing R3.3 exposed that the engine only checks two
  stations. Alewife to Oak Grove passes both ends but needs Downtown Crossing. It is now capped to
  UNKNOWN with a reason, and the engine verdict is still shown in the trace.
- **Property tests caught nothing at first, so we broke the code on purpose.** Each guard was removed
  once (cap, Orange contrast, stale markers, invented trace time, AI step-set check, demo import). Every
  mutation turned a test red. The tests are kept because they fail for the right reason.

## Decisions and tradeoffs

- **Map library: MapLibre GL v6 (BSD-3)** with OpenFreeMap Positron tiles (keyless, OSM). Mapbox needs
  a token; Leaflet raster maps cannot style data-driven lines as cleanly. Loaded with `next/dynamic`,
  so the home page first load stayed at 143 kB.
- **Geometry from one request.** `/route_patterns?filter[canonical]=true&include=representative_trip.shape,representative_trip.stops`
  returns all 18 canonical subway patterns with shapes and stop order (about 200 KB). Cached 24 h, with a
  committed 119 KB copy for offline use and rate-limit safety.
- **No routing.** For a direct trip we cut the official shape between the two stations' nearest
  vertices. For transfers we draw nothing between the ends and say so. The map is labelled
  "reference, not a verified itinerary".
- **Additive API.** `journey`, `display`, `stations`, `profiles` were added to the `/api/status` and
  `/api/demo` responses. `TripResult` and `lib/types.ts` are unchanged. `/api/demo` gained an optional
  `profile` (default wheelchair) for the profile demo.
- **AI may reword, not decide.** Next-step ids are chosen from the data by templates; the model can
  only reword them. Any change to the set, an unknown station name, or a claim against the verdict
  falls back to templates.
- **Stroller is honest.** The rules treat stroller exactly like wheelchair. The UI says so instead of
  inventing a difference. The comparison table shows the one real difference (uneven platform for
  no-stairs).

## Failures found and fixed

Found by running the built app in headless Chromium, not by tests or the type checker:

1. **Map never drew: "Worker failed to load."** MapLibre v6 builds its worker URL from
   `import.meta.url`, which Next bundles away. Fix: `scripts/copy-map-worker.mjs` (postinstall,
   prebuild, predev) copies the matching worker to `public/vendor/`, and `setWorkerUrl()` points at it.
   The fallback schematic worked as designed while this was broken.
2. **Style rejected:** `"zoom" expression may only be used as input to a top-level "step" or
   "interpolate"`. I had put `interpolate(zoom)` inside a `case`. Inverted it.
3. **Blank map canvas.** `maplibre-gl.css` sets `.maplibregl-map{position:relative}`, overriding the
   `absolute inset-0` container, so it collapsed to 0 px. Sized by `h-full` instead.
4. **"Not step- / free" wrapped** in the narrow verdict column. `whitespace-nowrap` plus a smaller step;
   layout widened from `max-w-5xl` to `max-w-7xl` so the map gets real width.
5. **One frame of simulated data under the real heading** after switching demo off. The fetch effect
   runs after paint, so the old demo result rendered once. Added a render-time `mismatched` guard and a
   browser check that samples every animation frame for 3 s.
6. **Arrow keys stopped working on the profile switcher** because the fieldset was disabled while
   refreshing, which drops focus. It now stays enabled; a newer pick aborts the older request.
7. **Hooks written to the wrong `.kiro`.** `createHook` wrote to the workspace root (one level above
   the repo). Moved them into the repo and made each command `cd` to the repo first, so it runs from
   either directory.

## Not done

- Real Anthropic API call (no key). Only stubbed responses are tested.
- Screen reader pass, axe/Lighthouse audit, real phone. Keyboard, focus, reduced motion and contrast
  were checked in headless Chromium and by tests only.
- Live MBTA end-to-end in the browser. The geometry was fetched live once (to build the committed
  copy) and `/api/network` live parsing is unit-tested with a real trimmed response; browser QA ran
  with `FORCE_OFFLINE=1`.
