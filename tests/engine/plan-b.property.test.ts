// Plan B properties P11-P13 (numbering from the AccessPath guide), on generated stations and platform maps.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { DataSnapshot, Station, Trip } from "@/lib/types";
import type { PlatformMap } from "@/lib/data/platform-map";
import { evaluateTrip } from "@/lib/engine/evaluate-trip";
import { planB, withElevatorOut, workingElevators } from "@/lib/engine/plan-b";
import { evaluateStation } from "@/lib/engine/rules";
import { NOW, NOW_MS, mixedAlertsArb, platformMapArb, snapshotArb, tripArb } from "./arbitraries";

const RUNS = { numRuns: 400 };
const inputs = fc.tuple(tripArb, platformMapArb, fc.oneof(snapshotArb(fc.constant([])), snapshotArb(mixedAlertsArb)));

function endpoints(trip: Trip, snap: DataSnapshot): Station[] {
  return [trip.originId, trip.destinationId].map((id) => snap.stations.find((s) => s.id === id)).filter((s): s is Station => !!s);
}

function tripWithout(trip: Trip, snap: DataSnapshot, map: PlatformMap, stationId: string, facilityId: string) {
  return evaluateTrip(trip, withElevatorOut(snap, stationId, facilityId, NOW_MS), NOW, map).status;
}

describe("Plan B properties", () => {
  it("Plan B exists exactly when the trip is STEP_FREE now, and never changes the input", () => {
    fc.assert(
      fc.property(inputs, ([trip, map, snap]) => {
        const before = structuredClone(snap);
        const plan = planB(trip, snap, NOW, map);
        expect(plan !== null).toBe(evaluateTrip(trip, snap, NOW, map).status === "STEP_FREE");
        expect(snap).toEqual(before);
      }),
      RUNS,
    );
  });

  it("Plan B lists every working elevator at both stations, once", () => {
    fc.assert(
      fc.property(inputs, ([trip, map, snap]) => {
        const plan = planB(trip, snap, NOW, map);
        if (!plan) return;
        const expected = endpoints(trip, snap).flatMap((s) => workingElevators(s, snap, NOW_MS)).sort();
        expect(plan.elevators.map((e) => e.facilityId).sort()).toEqual(expected);
      }),
      RUNS,
    );
  });

  it("P11: a Resilient trip stays STEP_FREE when any single working elevator is removed", () => {
    fc.assert(
      fc.property(inputs, ([trip, map, snap]) => {
        const plan = planB(trip, snap, NOW, map);
        if (plan?.status !== "resilient") return;
        for (const s of endpoints(trip, snap)) {
          for (const id of workingElevators(s, snap, NOW_MS)) expect(tripWithout(trip, snap, map, s.id, id)).toBe("STEP_FREE");
        }
      }),
      RUNS,
    );
  });

  it("P12: listed single points of failure break the trip when removed; elevators with a backup do not", () => {
    fc.assert(
      fc.property(inputs, ([trip, map, snap]) => {
        const plan = planB(trip, snap, NOW, map);
        if (!plan) return;
        for (const e of plan.elevators) {
          const status = tripWithout(trip, snap, map, e.stationId, e.facilityId);
          if (e.role === "no_backup") expect(status).toBe("NOT_STEP_FREE");
          else if (e.role === "cannot_check") expect(status).toBe("UNKNOWN");
          else expect(status).toBe("STEP_FREE");
        }
        const hasSpof = plan.elevators.some((e) => e.role === "no_backup");
        expect(plan.status === "fragile").toBe(hasSpof);
      }),
      RUNS,
    );
  });

  it("P13: every Plan B station is STEP_FREE with that elevator removed, shares a line, and is not a trip endpoint", () => {
    fc.assert(
      fc.property(inputs, ([trip, map, snap]) => {
        const plan = planB(trip, snap, NOW, map);
        if (!plan) return;
        for (const e of plan.elevators) {
          if (!e.alternative) continue;
          expect(e.role).toBe("no_backup");
          expect([trip.originId, trip.destinationId]).not.toContain(e.alternative.id);
          const from = snap.stations.find((s) => s.id === e.stationId);
          expect(e.alternative.lines.some((l) => from?.lines.includes(l))).toBe(true);
          const simulated = withElevatorOut(snap, e.stationId, e.facilityId, NOW_MS);
          expect(evaluateStation(e.alternative, trip.profile, simulated, NOW_MS, map).status).toBe("STEP_FREE");
        }
      }),
      RUNS,
    );
  });

  it("generators reach every Plan B outcome (no vacuous properties)", () => {
    const seen = { resilient: 0, fragile: 0, cannot_confirm: 0, withAlternative: 0 };
    fc.assert(
      fc.property(inputs, ([trip, map, snap]) => {
        const plan = planB(trip, snap, NOW, map);
        if (!plan) return;
        seen[plan.status] += 1;
        if (plan.elevators.some((e) => e.alternative)) seen.withAlternative += 1;
      }),
      { numRuns: 1500 },
    );
    expect(seen.resilient).toBeGreaterThan(10);
    expect(seen.fragile).toBeGreaterThan(10);
    expect(seen.cannot_confirm).toBeGreaterThan(10);
    expect(seen.withAlternative).toBeGreaterThan(10);
  });
});
