# AccessPath AI

A mobile-first web app that checks whether an MBTA subway trip can be done **step-free right now**. A rider saves a trip (start station, end station, and a profile: wheelchair, stroller, or no stairs). The app reads live MBTA V3 data, runs a decision engine, and shows one of three states: **STEP_FREE** (green), **NOT_STEP_FREE** (red), **UNKNOWN** (gray). It explains problems in plain language, names the working elevator to use, and suggests the nearest verified accessible station.

On a step-free day it also shows **Plan B**: which single elevator the trip depends on, and which checked station to use if that elevator breaks. It warns about **planned outages later today** (next 12 hours) that would affect the trip.

Hackathon demo. Subway only (Red, Orange, Blue, Green, Mattapan). No transfers, buses, Commuter Rail, accounts or push notifications.

## Run it

Needs Node.js 20 or newer.

```bash
npm install
npm run snapshots        # fetch live MBTA data and write lib/data/snapshots/mbta-snapshot.json
npm run build
npm test                 # unit, API, component and property tests (Vitest + fast-check)
npm run dev              # http://localhost:3000
```

Other scripts:

- `npm run typecheck`, `npm start` (after `build`).
- `npm run check:gtfs -- <folder>`: cross-checks `lib/data/platform-map.ts` against MBTA GTFS `pathways.txt`. Download https://cdn.mbta.com/MBTA_GTFS.zip (about 21 MB) and unzip it first. The folder defaults to `$GTFS_DIR`, then `<temp>/mbta-gtfs`. Read-only.
- `npm run a11y -- [base-url]`: axe-core audit (WCAG 2.2 A/AA + best practice) in a real Chrome on every screen and every demo state, plus a 320 px reflow check. Start the app first. Set `CHROME_PATH` if Chrome is not in the default place.

### Environment variables (`.env.example`)

| Name | Needed? | What it does |
|---|---|---|
| `MBTA_API_KEY` | optional | Sent as `x-api-key`. Without it the MBTA allows 20 requests per minute. One refresh uses 8 requests and is cached for 60 s. |
| `ANTHROPIC_API_KEY` | optional | Turns on AI rewriting in `/api/explain`. Without it, built-in plain-language templates are used. |
| `ANTHROPIC_MODEL` | optional | Model for `/api/explain` (default `claude-haiku-4-5`). |
| `EXPLAIN_AI_LIMIT_PER_MINUTE` | optional | AI rewrites per client per minute (default 10). Over the limit, riders get the templates (header `x-ai-rate-limited: 1`). Counted per server instance. |
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
curl "$B/api/demo?scenario=elevator-outage-alewife"      # see the demo scenarios below
curl -X POST $B/api/explain -H 'content-type: application/json' \
  -d '{"profile":"wheelchair","tripResult":{ ...a /api/status result... }}'
```

Bad input returns `400 {"error","details"}`. If MBTA is down the routes use the offline snapshot (`"dataSource":"snapshot"`). If the snapshot is also unreadable they return `502` with `"status":"UNKNOWN"`.

`/api/status` and `/api/demo` also return `planB` (null unless the trip is STEP_FREE now) and `laterToday` (a list of planned changes, empty for stale data).

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
7. When a broken elevator is covered, the app names the backup: "Porter Elevator 987 is out. Use Porter Elevator 983 instead." Only verified elevators are ever named.

**Plan B** (`lib/engine/plan-b.ts`) runs only when the trip is STEP_FREE now. For each working elevator at the two stations, it adds a simulated outage of that one elevator and re-runs the same station check:

- still STEP_FREE: it has a backup (or is not on a subway path);
- NOT_STEP_FREE: it is a single point of failure, and Plan B is the nearest station that is verified STEP_FREE with that elevator out;
- UNKNOWN: we could not check it, and the app says so. It is never called a single point of failure.

The trip is **Resilient** only when no single elevator can break it.

**Later today** (`lib/engine/later-today.ts`) looks at alerts for the two stations that start in the next 12 hours. It warns when one of them would make the trip worse than it is now. It never forecasts from stale data, and it never changes the "now" result.

Demo mode (switch in the footer, `/?demo=<scenario>`, or `/api/demo`) uses a **simulated** snapshot, labelled "Simulated demo data", so a presenter can show each state on command. Real routes never use it.

| Scenario | Trip | Shows |
|---|---|---|
| `elevator-outage-alewife` | Alewife to Park Street | Red: both platform elevators out, alternative Davis |
| `backup-elevator-alewife` | Alewife to Park Street | Green: Elevator 813 out, "Use Alewife Elevator 961 instead" |
| `plan-b-davis` | Davis to Park Street | Green, Plan B: Davis Elevator 816 has no backup, use Porter |
| `planned-outage` | Alewife to Park Street | Green now, warning: both platform elevators close in 3 hours |
| `all-clear` | Alewife to Park Street | Green |
| `api-down` | Alewife to Park Street | Gray: data 3 hours old |

For a real Plan B case, try Davis to Kendall/MIT with live data: Davis Elevator 816 is the only elevator to the Davis platform.

## Project layout

```
app/                 pages (/, /trip/new) and Route Handlers in app/api/*
components/          StatusBanner, TripForm, AlertCard, AlternativeCard, DataSourceBadge, DemoSwitch,
                     HeaderNav, Logo, RouteSchematic, StatusSkeleton, PlanBCard, LaterTodayCard
lib/types.ts         shared contract (unchanged by Plan B: its types live in lib/engine/plan-b.ts)
lib/data/            mbta-client, normalize, platform-map, snapshot, cache, schemas, demo-snapshot, snapshots/
lib/engine/          evaluate-trip, rules, find-alternative, geo, plan-b, later-today, constants
lib/ai/              explain (Anthropic + validation), fallback-templates
lib/api/             Zod schemas, HTTP helpers, trip-payload (result + Plan B + later today), rate-limit
lib/client/          browser-only helpers (localStorage, demo store, status hook, format, line colours)
scripts/             refresh-snapshots.ts, check-gtfs-platforms.ts, a11y-audit.ts
tests/               engine (property + example), data, api, components, fixtures (real MBTA responses)
.kiro/               steering, hooks, specs (EARS requirements, design, tasks)
```

Owners: data = Himani, engine = Tanishq, UI and deploy = Aatmaj, AI and integration = Pradyannya.

## Tests and property names

`npm test` runs 13 files and 126 tests. The property tests use fast-check on generated stations, alerts and platform maps. New properties use the guide's P-numbers. The original a to g names are kept, with the closest P-number:

| Test | Rule |
|---|---|
| a (P1) | An active blocking alert on a trip station is never STEP_FREE |
| b, b2 (P6, P15) | Stale or invalid data is UNKNOWN, never STEP_FREE; the 10-minute boundary is exact |
| c (P3) | Escalator-only alerts never change a result |
| d | Filtering never drops an active alert for a trip station |
| e (P9) | A suggested alternative is verified step-free and never a trip endpoint |
| f | Same inputs, same output |
| g (P14, part) | An expired alert never blocks |
| P4 | Closing a facility never improves a verdict |
| P8 | The trip verdict equals the worst station verdict |
| P10 | The summary only gives good news for STEP_FREE, and only names a checked station |
| P11 | A Resilient trip stays STEP_FREE when any single working elevator is removed |
| P12 | Listed single points of failure break the trip when removed; elevators with a backup do not |
| P13 | Every Plan B station is STEP_FREE with that elevator removed, shares a line, and is not an endpoint |
| P14 | Outages that start after now never change the "now" result; later-today warnings are exact |
| P16a, b, c | Conflicting sources (unknown elevator id, elevator missing from the map, unknown MBTA flag) are never STEP_FREE |

Coverage tests check that the generators reach every outcome, so no property passes by never running.

## Status

This branch includes the UI redesign from `main` (commit `71446a3`, design system, lucide icons, two-column dashboard) with Plan B and later today built into it.

Checked on this branch: `npm test` (124 passed), `npm run typecheck` and `npm run build` all pass. `npm run a11y` finds no violations on any screen.

### Done

- Step-free check for one origin and one destination against live MBTA alerts, with three results: STEP_FREE, NOT_STEP_FREE, UNKNOWN.
- Profiles: wheelchair, stroller, no stairs (see Known limitations for how they differ).
- Live MBTA V3 data cached for 60 s, with an offline snapshot when MBTA is down.
- UNKNOWN by default: data older than 10 minutes, a bad timestamp, or an unmapped or unverified elevator.
- Conflicting-source checks (P16): an elevator alert whose facility is not in the MBTA facility data, an elevator missing from the platform map, or an MBTA flag of "unknown" gives UNKNOWN. "Not accessible" gives NOT_STEP_FREE.
- Backup elevator check, and the app names the elevator to use ("Use Porter Elevator 983 instead").
- Plan B (Layer 2): single points of failure, a checked Plan B station, and a Plan B card.
- Later today (Layer 3): warnings for planned outages in the next 12 hours.
- Escalator outages are information only.
- Nearest verified alternative on the same line (straight-line distance, never a trip endpoint).
- Plain-language explanations from templates, with optional AI rewriting (tested against a stub only). AI calls are rate limited per client.
- Demo mode with six labelled simulated scenarios, also reachable as `/?demo=<scenario>`.
- Mobile UI. The verdict is in an `aria-live` region, and the banner says "According to MBTA data updated at 3:05 PM."
- Trip saved in `localStorage`. No accounts.
- API routes: health, stations, alerts, facilities, status, alternatives, explain, demo.
- GTFS cross-check: all 9 elevator ids in the committed alert snapshot, and all 68 platform-map ids, appear in GTFS `pathways.txt` (MBTA GTFS "Fall 2026, version D"). Findings are in the header of `lib/data/platform-map.ts`. Davis 816 was confirmed as the only elevator to its platform and changed to verified.
- Automated accessibility audit with axe-core in Chrome: 0 violations on all 8 screens, and no horizontal scrolling at 320 px. The audit found and we fixed three real issues:
  - the data-source badge used `aria-label` on a `<p>`, which screen readers may ignore;
  - after the redesign, the demo-mode caption was grey at 4.2:1 contrast on its tinted background (AA needs 4.5:1);
  - after the redesign, the header nav pushed the page 7 px sideways at 320 px wide; it now wraps.

  axe still asks for a human check of text on the gradient header, because it cannot measure contrast on gradients.
- Kiro: 4 specs, 4 steering files, 2 hooks. The engine spec and product rules now include Plan B and later today.

### To do

These need a person, an account or a team decision:

1. Test `/api/explain` with a real `ANTHROPIC_API_KEY`. No key was available here.
2. Deploy to Vercel with `MBTA_API_KEY` set (and `ANTHROPIC_API_KEY` if AI is used). Needs your Vercel account.
3. VoiceOver and TalkBack pass, and a real-phone test. Automated checks cannot replace these.
4. Hand-check, in person or against MBTA station maps, the entries still marked for review in `platform-map.ts` (State, North Station, Haymarket, Park Street).
5. Update the pitch and guide to match this code: Next.js and fast-check, three results, the P-numbers above.
6. Demo video (under 3 minutes) and the Kiro write-up. No property test has caught a real engine bug yet, so do not claim one. The axe audit did catch the badge issue above.

Next, if the team wants it:

- Replace the platform map with station graphs built from GTFS `pathways.txt`. The facility-id check passed, so this is possible. It changes the core engine, so do it on its own branch.
- Transfers and direction of travel (both need the station graph).

## Known limitations

- **The platform map is only partly verified.** It was built by reading MBTA facility names and then cross-checked against GTFS `pathways.txt`, not by visiting stations. It covers 16 stations; 28 of the 68 entries are marked `verified: false`. Elevators outside these 16 stations are unmapped, so an outage there gives UNKNOWN, and Plan B there says "could not check".
- **Plan B depends on the platform map.** Street-entrance elevators are unverified, so at most stations Plan B lists them under "could not check" and the overall Plan B is "not fully checked" rather than "Resilient".
- Later today only sees planned outages that the MBTA has already posted, and it looks 12 hours ahead, not to the end of the service day.
- No transfers, buses or Commuter Rail. A trip is one origin and one destination.
- Direction of travel is not modelled. An elevator outage is judged on every platform that elevator serves, so a result can be more cautious than needed.
- Street-entrance elevators are treated as an "Entrance" platform with `verified: false`, so an outage there usually gives UNKNOWN.
- A station-closure alert for one direction (for example "skipping Saint Paul Street outbound") blocks the whole station.
- "Nearest" alternative is straight-line distance on the same line, not walking or ride time.
- Station accessibility comes from the MBTA `wheelchair_boarding` field. We do not check stairs inside a station or mini-high platform details beyond alerts.
- The stroller profile uses exactly the same rules as wheelchair. Only no-stairs differs: uneven-platform alerts are shown as information and do not block.
- Conflicting sources are only partly checked. An elevator alert whose facility is not in the MBTA facility data, or an elevator missing from the platform map, gives UNKNOWN. This check covers elevator-closure alerts only. The MBTA `wheelchair_boarding` flag is followed as given, not cross-checked against an actual path inside the station.
- The MBTA test URL `stops?filter[route_type]=0,1&filter[location_type]=1` returns an empty list; stations are fetched per line instead (see `.kiro/specs/01-mbta-data/design.md`).
- The keyless MBTA limit is 20 requests per minute and each serverless instance has its own cache. Set `MBTA_API_KEY` for any public deploy.
- The AI path was tested against a stubbed Anthropic API only. It has not been run against the real API (no key was available), though a bad key correctly falls back to templates.
- The `/api/explain` AI rate limit is in memory, per server instance. It caps cost from one client; it is not a security boundary.
- Accessibility was checked with axe-core and Lighthouse in headless Chrome. No screen reader pass or real-phone test has been done.
- Not deployed to Vercel.
- The TypeScript version is pinned to 5.x: Next 15 cannot read `tsconfig` paths with the TypeScript 7 native compiler.
