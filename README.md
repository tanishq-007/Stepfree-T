# AccessPath AI

A mobile-first web app that checks whether an MBTA subway trip can be done **step-free right now**. A rider saves a trip (start station, end station, and a profile: wheelchair, stroller, or no stairs). The app reads live MBTA V3 data, runs a decision engine, and shows one of three states: **STEP_FREE** (green), **NOT_STEP_FREE** (red), **UNKNOWN** (gray). It explains problems in plain language and suggests the nearest verified accessible station.

Hackathon demo. Subway only (Red, Orange, Blue, Green, Mattapan). No transfers, buses, Commuter Rail, accounts or push notifications.

## Run it

Needs Node.js 20 or newer.

```bash
npm install              # also copies the MapLibre map worker into public/vendor
npm run snapshots        # fetch live MBTA data and write lib/data/snapshots/mbta-snapshot.json
npm run network          # optional: refresh lib/data/snapshots/mbta-network.json (MBTA line geometry)
npm run build
npm test                 # unit, API, component and property tests (Vitest + fast-check)
npm run dev              # http://localhost:3000
```

Other scripts: `npm run typecheck`, `npm start` (after `build`).

### Environment variables (`.env.example`)

| Name | Needed? | What it does |
|---|---|---|
| `MBTA_API_KEY` | optional | Sent as `x-api-key`. Without it the MBTA allows 20 requests per minute. One refresh uses 8 requests and is cached for 60 s. |
| `ANTHROPIC_API_KEY` | optional | Turns on AI rewriting in `/api/explain`. Without it, built-in plain-language templates are used. |
| `ANTHROPIC_MODEL` | optional | Model for `/api/explain` (default `claude-haiku-4-5`). |
| `FORCE_OFFLINE` | testing | `1` skips the live MBTA call and uses the committed snapshot. |
| `SNAPSHOT_WRITE` | optional | `0` stops the dev server from rewriting the snapshot file after each live fetch. |

The app works with no keys set. Copy `.env.example` to `.env.local` to set them. `.env.local` is git-ignored.

### Try the API

```bash
B=http://localhost:3000
curl $B/api/health
curl $B/api/stations
curl "$B/api/alerts?stationId=place-alfcl"
curl "$B/api/facilities?stationId=place-alfcl"
curl "$B/api/status?origin=place-alfcl&destination=place-pktrm&profile=wheelchair"
curl "$B/api/alternatives?stationId=place-alfcl&profile=wheelchair"
curl "$B/api/demo?scenario=elevator-outage-alewife"      # also: all-clear, api-down; optional &profile=
curl $B/api/network                                        # MBTA line geometry (reference only)
curl -X POST $B/api/explain -H 'content-type: application/json' \
  -d '{"profile":"wheelchair","tripResult":{ ...a /api/status result... }}'
```

Bad input returns `400 {"error","details"}`. If MBTA is down the routes use the offline snapshot (`"dataSource":"snapshot"`). If the snapshot is also unreadable they return `502` with `"status":"UNKNOWN"`.

### Deploy to Vercel

1. Push the repo to GitHub.
2. In Vercel choose **Add New, Project**, import the repo. The framework is detected as Next.js. No build settings need changing.
3. Optional: add `MBTA_API_KEY` and `ANTHROPIC_API_KEY` under **Settings, Environment Variables**.
4. Deploy. The committed snapshot ships with the API functions (`outputFileTracingIncludes` in `next.config.mjs`). Vercel's filesystem is read-only, so snapshot writes are skipped.

Or from a terminal: `npx vercel` then `npx vercel --prod`. (Not done in this repo: it needs your Vercel account.)

## How it decides

The rules live in `lib/engine/` (pure functions, no I/O) and are written in `.kiro/steering/product.md`.

1. Missing, invalid or stale (older than 10 minutes) data gives **UNKNOWN**. The offline snapshot keeps its original time, so it is normally stale and gives UNKNOWN.
2. **STEP_FREE** needs both stations to be accessible per MBTA and no active blocking alert at either one.
3. Blocking alerts: station or stop closure, access issue, uneven platform, and an elevator outage that has no working verified elevator on the same platform.
4. If the platform an elevator serves is not verified in `lib/data/platform-map.ts`, the result is **UNKNOWN** (`PLATFORM_UNVERIFIED`), never STEP_FREE.
5. Escalator outages are information only. Expired alerts never block.
6. A suggested alternative is on the same line, accessible, has no blocking alert, is verified step-free, and is never a trip endpoint.

Demo mode (switch in the footer, or `/api/demo`) uses a **simulated** snapshot, labelled "Simulated demo data", so a presenter can show a red state on command. Real routes never use it.

## Journey intelligence (spec 05)

- **Journey map** (MapLibre GL + OpenFreeMap tiles). Station markers are each station's own engine
  verdict, never "green because no alert". Line geometry comes from MBTA canonical route patterns and
  is labelled as a reference, not a verified itinerary. A keyboard station list mirrors the map; if the
  map cannot start, a schematic takes its place.
- **Disruption simulator.** The presenter bar at the top of the trip page switches the three existing
  scenarios in one click. Everything simulated carries a violet "Simulated scenario" label and the
  fixed scenario trip is named.
- **Understand your journey.** What happened, why it affects this profile, what to do next. Next steps
  are chosen from the data; the AI (if a key is set) may only reword them.
- **Mobility profiles.** Switch profile on the results page; the engine re-runs and the trip is saved.
  The comparison shows every profile's real verdict and the one rule that differs (uneven platforms).
- **How we decided.** An ordered decision trace with times only where the data has them.
- **Transfers.** The engine checks only the two endpoint stations. A trip that needs a change of line is
  shown as "Cannot confirm" with the likely transfer station named.

Spec, steering, hooks and the development journal: `.kiro/specs/05-journey-intelligence/`.

## Project layout

```
app/                 pages (/, /trip/new) and Route Handlers in app/api/*
components/          StatusBanner, TripForm, AlertCard, AlternativeCard, DataSourceBadge, DemoSwitch
lib/types.ts         shared contract
lib/data/            mbta-client, normalize, platform-map, snapshot, cache, schemas, demo-snapshot, snapshots/
lib/engine/          evaluate-trip, rules, find-alternative, geo
lib/ai/              explain (Anthropic + validation), fallback-templates
lib/api/             Zod schemas and HTTP helpers for the routes
lib/client/          browser-only helpers (localStorage, demo store, status hook)
scripts/             refresh-snapshots.ts
tests/               engine (property + example), data, api, components, fixtures (real MBTA responses)
.kiro/               steering, hooks, specs (EARS requirements, design, tasks)
```

Owners: data = Himani, engine = Tanishq, UI and deploy = Aatmaj, AI and integration = Pradyannya.

## Known limitations

- **The platform map is only partly verified.** It was built by reading MBTA facility names, not by visiting stations. It covers 16 stations; 29 of the 68 entries are marked `verified: false` (inferred). Every entry needs a human check. Elevators outside these 16 stations are unmapped, so an outage there gives UNKNOWN.
- No transfers, buses or Commuter Rail. A trip is one origin and one destination. Transfer stations are named but not checked, so such trips show "Cannot confirm".
- Direction of travel is not modelled. An elevator outage is judged on every platform that elevator serves, so a result can be more cautious than needed.
- Street-entrance elevators are treated as an "Entrance" platform with `verified: false`, so an outage there usually gives UNKNOWN.
- A station-closure alert for one direction (for example "skipping Saint Paul Street outbound") blocks the whole station.
- "Nearest" alternative is straight-line distance on the same line, not walking or ride time.
- Station accessibility comes from the MBTA `wheelchair_boarding` field. We do not check stairs inside a station or mini-high platform details beyond alerts.
- Stroller and no-stairs profiles differ from wheelchair only for uneven-platform alerts.
- The MBTA test URL `stops?filter[route_type]=0,1&filter[location_type]=1` returns an empty list; stations are fetched per line instead (see `.kiro/specs/01-mbta-data/design.md`).
- The keyless MBTA limit is 20 requests per minute and each serverless instance has its own cache. Set `MBTA_API_KEY` for any public deploy.
- The AI path was tested against a stubbed Anthropic API only. It has not been run against the real API (no key was available), though a bad key correctly falls back to templates.
- `/api/explain` has no rate limiting. Add one before a public deploy if you set `ANTHROPIC_API_KEY`.
- The UI was checked in a headless WebKit browser (save a trip, live result, demo mode). No automated accessibility audit (axe/Lighthouse), screen reader pass, or real-phone test has been done.
- Not deployed to Vercel.
- The map needs WebGL and the OpenFreeMap tile server. Without them it falls back to a schematic; verdicts and explanations are unaffected.
- The TypeScript version is pinned to 5.x: Next 15 cannot read `tsconfig` paths with the TypeScript 7 native compiler.
