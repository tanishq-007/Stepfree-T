// P14 and the later-today warnings, on generated data.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { AccessStatus, Alert, DataSnapshot, Trip } from "@/lib/types";
import { STALE_AFTER_MINUTES } from "@/lib/types";
import type { PlatformMap } from "@/lib/data/platform-map";
import { evaluateTrip } from "@/lib/engine/evaluate-trip";
import { LATER_TODAY_HOURS, laterToday } from "@/lib/engine/later-today";
import { evaluateStation, worst } from "@/lib/engine/rules";
import {
  BLOCKING_EFFECTS,
  NOW,
  NOW_MS,
  OTHER_EFFECTS,
  alertArb,
  mixedAlertsArb,
  platformMapArb,
  snapshotArb,
  tripArb,
  type PeriodSpec,
} from "./arbitraries";

const RUNS = { numRuns: 300 };
const HOUR = 3_600_000;

/** Periods that start 1 to 20 hours from NOW. Some fall inside the 12 hour window, some after it. */
const futurePeriodSpec: fc.Arbitrary<PeriodSpec> = fc
  .record({ startH: fc.integer({ min: 1, max: 20 }), len: fc.option(fc.integer({ min: 1, max: 10 }), { nil: null }) })
  .map(({ startH, len }) => ({ startH, endH: len === null ? null : startH + len }));

const futureAlertsArb: fc.Arbitrary<Alert[]> = fc.array(alertArb([...BLOCKING_EFFECTS, ...OTHER_EFFECTS], futurePeriodSpec), {
  minLength: 1,
  maxLength: 5,
});

function statusAt(trip: Trip, snap: DataSnapshot, atMs: number, map: PlatformMap): AccessStatus {
  return [trip.originId, trip.destinationId]
    .map((id) => snap.stations.find((s) => s.id === id))
    .map((s) => (s ? evaluateStation(s, trip.profile, snap, atMs, map).status : "UNKNOWN"))
    .reduce<AccessStatus>((a, b) => worst(a, b), "STEP_FREE");
}

const SEVERITY: Record<AccessStatus, number> = { STEP_FREE: 0, UNKNOWN: 1, NOT_STEP_FREE: 2 };

describe("later today", () => {
  it("P14: outages that start after now never change the 'now' result", () => {
    fc.assert(
      fc.property(tripArb, platformMapArb, snapshotArb(mixedAlertsArb), futureAlertsArb, (trip, map, snap, future) => {
        const before = evaluateTrip(trip, snap, NOW, map);
        const after = evaluateTrip(trip, { ...snap, alerts: [...snap.alerts, ...future] }, NOW, map);
        expect(after.status).toBe(before.status);
        expect(after.blockingAlerts).toEqual(before.blockingAlerts);
        expect(after.alternative).toEqual(before.alternative);
      }),
      RUNS,
    );
  });

  it("every warning starts inside the window, is caused by an alert starting then, and is worse than now", () => {
    fc.assert(
      fc.property(tripArb, platformMapArb, snapshotArb(mixedAlertsArb), futureAlertsArb, (trip, map, snap, future) => {
        const all = { ...snap, alerts: [...snap.alerts, ...future] };
        const now = evaluateTrip(trip, all, NOW, map).status;
        for (const w of laterToday(trip, all, NOW, map)) {
          const t = Date.parse(w.startsAt);
          expect(t).toBeGreaterThan(NOW_MS);
          expect(t).toBeLessThanOrEqual(NOW_MS + LATER_TODAY_HOURS * HOUR);
          expect(SEVERITY[w.status]).toBeGreaterThan(SEVERITY[now]);
          expect(w.status).toBe(statusAt(trip, all, t, map));
          expect(SEVERITY[w.status]).toBeGreaterThan(SEVERITY[statusAt(trip, all, t - 1, map)]);
          expect(w.alerts.length).toBeGreaterThan(0);
          for (const a of w.alerts) expect(a.activePeriod.some((p) => Date.parse(p.start) === t)).toBe(true);
        }
      }),
      RUNS,
    );
  });

  it("never warns from stale data", () => {
    fc.assert(
      fc.property(tripArb, platformMapArb, snapshotArb(mixedAlertsArb), futureAlertsArb, (trip, map, snap, future) => {
        const stale = { ...snap, alerts: [...snap.alerts, ...future], fetchedAt: new Date(NOW_MS - (STALE_AFTER_MINUTES + 1) * 60_000).toISOString() };
        expect(laterToday(trip, stale, NOW, map)).toEqual([]);
      }),
      RUNS,
    );
  });

  it("a planned closure inside the window on a STEP_FREE trip always gives a warning", () => {
    fc.assert(
      fc.property(
        tripArb,
        platformMapArb,
        snapshotArb(fc.constant([])),
        fc.integer({ min: 1, max: LATER_TODAY_HOURS }),
        (trip, map, snap, startH) => {
          if (evaluateTrip(trip, snap, NOW, map).status !== "STEP_FREE") return;
          const closure: Alert = {
            id: "planned",
            effect: "STATION_CLOSURE",
            header: "Planned closure",
            description: "",
            stationIds: [trip.destinationId],
            facilityIds: [],
            activePeriod: [{ start: new Date(NOW_MS + startH * HOUR).toISOString(), end: null }],
            severity: 5,
            updatedAt: NOW.toISOString(),
          };
          const warnings = laterToday(trip, { ...snap, alerts: [closure] }, NOW, map);
          expect(warnings).toHaveLength(1);
          expect(warnings[0]?.status).toBe("NOT_STEP_FREE");
          expect(warnings[0]?.stationIds).toEqual([trip.destinationId]);
        },
      ),
      RUNS,
    );
  });
});
