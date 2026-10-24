---
inclusion: fileMatch
fileMatchPattern: "{lib/ai,lib/engine,app/api/explain}/**/*.ts"
---

# Deterministic decisions, grounded AI

## Who decides what

- `lib/engine/` decides the status. Pure functions, no AI, no I/O, no clock reads.
- `presentableStatus()` in `lib/engine/journey.ts` is the ONLY place a status changes after the
  engine, and only towards caution (`STEP_FREE` to `UNKNOWN` for transfer/unknown routes).
  Property test I1 in `tests/engine/journey.property.test.ts`.
- `lib/ai/` only writes words about a status it is given.

## The AI contract (`lib/ai/explain.ts`)

The model gets: origin, destination, profile, status, reasons, alerts, alternative, data source,
`fetchedAt`, route relationship, a coverage note, and a `draftGuide` built by the templates.

Output is rejected (and templates are used) when it:

1. is not valid JSON for the schema, or skips an alert id;
2. claims accessibility on a non-`STEP_FREE` result (`POSITIVE_CLAIM`);
3. calls a verified `STEP_FREE` result blocked or uncertain (`NEGATIVE_CLAIM`);
4. adds, drops or duplicates a next step (step ids are chosen by `nextStepIds()` from the data);
5. names any known station that is not in the evidence (`inventedStation`);
6. times out (8 s) or the request fails.

`guide.source` is `"ai"` only after all checks pass. The UI shows "AI-generated" only then.

## Next steps the product may suggest

Only these, and only when the data supports them: `use-alternative` (engine returned one),
`check-transfer` (route needs a change of line), `read-notice` (there is an alert), `refresh`
(stale or snapshot data), `ask-staff` (not verified step-free), `recheck-before-leaving` (green).
