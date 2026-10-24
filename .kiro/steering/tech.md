---
inclusion: always
---

# Tech and ownership

## Stack (use exactly this)

- Next.js 15 App Router, TypeScript (strict, no `any`), single repo. Backend = Route Handlers in `app/api/*`.
- Tailwind CSS 3, Zod for every input and every external payload, Vitest, fast-check.
- Saved trips live in `localStorage`. No database, no accounts.
- Deploy target: Vercel. Env vars (all optional): `MBTA_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_MAPS_API_KEY`. The app must work with no keys.
- `GOOGLE_MAPS_API_KEY` is server-only: no `NEXT_PUBLIC_` prefix, never in a URL, JSON body or header sent to the browser. Browser code imports only `lib/google/types.ts`.
- Test-only flag: `FORCE_OFFLINE=1` skips the live MBTA call.

## Layout and owners

| Area | Path | Owner |
|---|---|---|
| Data layer | `lib/data/*`, `scripts/refresh-snapshots.ts`, `tests/data/*`, `tests/fixtures/*` | Himani |
| Decision engine | `lib/engine/*`, `tests/engine/*` | Tanishq |
| UI and deploy | `app/*` (pages), `components/*`, `lib/client/*`, Vercel setup | Aatmaj |
| AI and integration | `lib/ai/*`, `lib/google/*`, `app/api/*`, `lib/api/*`, `tests/api/*` | Pradyannya |

`lib/types.ts` is the shared contract. Change it only with all four owners agreeing.

## Rules of the road

- Engine functions are pure: no I/O, no clock reads. Callers pass `now`.
- Keep functions small and typed. No `any`.
- Real MBTA field names only (see `tests/fixtures`). Schemas are lenient (`.passthrough()`).
- Fake data is allowed only in `lib/data/demo-snapshot.ts` (used by `/api/demo`) and in `tests/`.
- Every API route: Zod-validate input, JSON out, 400 `{error, details}` on bad input, never crash on MBTA failure, include `dataSource` and `fetchedAt`, `export const dynamic = "force-dynamic"`.
- Run `npx vitest run` and `npx tsc --noEmit` before every commit.
