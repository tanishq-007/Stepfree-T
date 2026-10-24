// Guide properties P4, P8 and P10 that apply to the current (platform-map) engine.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { AccessStatus, Alert } from "@/lib/types";
import { evaluateTrip } from "@/lib/engine/evaluate-trip";
import { evaluateStation, worst } from "@/lib/engine/rules";
import { fallbackExplanation } from "@/lib/ai/fallback-templates";
import { NOW, NOW_MS, STATION_IDS, mixedAlertsArb, platformMapArb, snapshotArb, tripArb } from "./arbitraries";

const RUNS = { numRuns: 400 };
const SEVERITY: Record<AccessStatus, number> = { STEP_FREE: 0, UNKNOWN: 1, NOT_STEP_FREE: 2 };

/** An active closure of something: a station, an access path, an elevator (real or not), or an escalator. */
const closureArb: fc.Arbitrary<Alert> = fc.record({
  id: fc.constant("new-closure"),
  effect: fc.constantFrom("STATION_CLOSURE", "STOP_CLOSURE", "ACCESS_ISSUE", "ELEVATOR_CLOSURE", "ESCALATOR_CLOSURE"),
  header: fc.constant("Closed"),
  description: fc.constant(""),
  stationIds: fc.subarray([...STATION_IDS], { minLength: 1, maxLength: 2 }),
  facilityIds: fc.subarray(["s0-f0", "s0-f1", "s1-f0", "s1-f1", "s2-f0", "s3-f1", "unknown-elevator"], { maxLength: 2 }),
  activePeriod: fc.constant([{ start: new Date(NOW_MS - 3_600_000).toISOString(), end: null }]),
  severity: fc.constant(3),
  updatedAt: fc.constant(NOW.toISOString()),
});

describe("guide properties", () => {
  it("P4: closing a facility never improves a verdict", () => {
    fc.assert(
      fc.property(tripArb, platformMapArb, snapshotArb(mixedAlertsArb), closureArb, (trip, map, snap, closure) => {
        const before = evaluateTrip(trip, snap, NOW, map).status;
        const after = evaluateTrip(trip, { ...snap, alerts: [...snap.alerts, closure] }, NOW, map).status;
        expect(SEVERITY[after]).toBeGreaterThanOrEqual(SEVERITY[before]);
      }),
      RUNS,
    );
  });

  it("P8: the trip verdict equals the worst station verdict", () => {
    fc.assert(
      fc.property(tripArb, platformMapArb, snapshotArb(mixedAlertsArb), (trip, map, snap) => {
        const stations = [trip.originId, trip.destinationId].map((id) => snap.stations.find((s) => s.id === id));
        if (stations.some((s) => !s)) return;
        const expected = stations
          .map((s) => evaluateStation(s as NonNullable<typeof s>, trip.profile, snap, NOW_MS, map).status)
          .reduce<AccessStatus>((a, b) => worst(a, b), "STEP_FREE");
        expect(evaluateTrip(trip, snap, NOW, map).status).toBe(expected);
      }),
      RUNS,
    );
  });

  it("P10: the plain-language summary only says good news for a STEP_FREE trip, and only names a checked station", () => {
    fc.assert(
      fc.property(tripArb, platformMapArb, snapshotArb(mixedAlertsArb), (trip, map, snap) => {
        const result = evaluateTrip(trip, snap, NOW, map);
        const { summary } = fallbackExplanation(result, trip.profile);
        const positive = /good news|are step-free right now|is step-free right now/i.test(summary);
        expect(positive).toBe(result.status === "STEP_FREE");
        for (const s of snap.stations) {
          if (summary.includes(s.name)) expect(s.id).toBe(result.alternative?.id);
        }
      }),
      RUNS,
    );
  });
});
