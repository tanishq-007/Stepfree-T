// The evidence timeline is a decision trace built from the real result: no invented times (I8),
// no dropped blockers (I7), and its final decision always matches the engine.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { evaluateTrip } from "@/lib/engine/evaluate-trip";
import { presentableStatus, type RouteRelationship } from "@/lib/engine/journey";
import { laterToday } from "@/lib/engine/later-today";
import { planB } from "@/lib/engine/plan-b";
import { allowedTraceTimes, buildTrace } from "@/lib/engine/trace";
import { evaluateStation } from "@/lib/engine/rules";
import { mixedAlertsArb, NOW, NOW_MS, platformMapArb, snapshotArb, tripArb } from "./arbitraries";

const journeyArb: fc.Arbitrary<RouteRelationship> = fc.constantFrom<RouteRelationship>(
  { kind: "direct", lines: ["Red"] },
  { kind: "transfer", originLines: ["Red"], destinationLines: ["Blue"], transferStationIds: ["s3"] },
  { kind: "unknown", reason: "NO_NETWORK" },
);
const checkedAtArb = fc.integer({ min: 0, max: 120 }).map((s) => new Date(NOW_MS + s * 1000).toISOString());

const traceArb = fc
  .tuple(snapshotArb(mixedAlertsArb), tripArb, platformMapArb, journeyArb, checkedAtArb)
  .map(([snap, trip, map, journey, checkedAt]) => {
    const result = evaluateTrip(trip, snap, NOW, map);
    const station = (id: string) => {
      const s = snap.stations.find((x) => x.id === id);
      return s ? { id: s.id, name: s.name, wheelchairBoarding: s.wheelchairBoarding, status: evaluateStation(s, trip.profile, snap, NOW_MS, map).status } : null;
    };
    const input = {
      result,
      profile: trip.profile,
      journey,
      displayed: presentableStatus(result, journey, trip.originId),
      origin: station(trip.originId),
      destination: station(trip.destinationId),
      checkedAt,
      planB: planB(trip, snap, NOW, map),
      laterToday: laterToday(trip, snap, NOW, map),
    };
    return { input, steps: buildTrace(input) };
  });

describe("buildTrace", () => {
  it("I8: every timestamp shown comes from the data (no invented dates)", () => {
    fc.assert(
      fc.property(traceArb, ({ input, steps }) => {
        const allowed = allowedTraceTimes(input);
        for (const s of steps) if (s.time) expect(allowed.has(s.time.iso)).toBe(true);
      }),
    );
  });

  it("I8: an alert with no parseable time gets no time", () => {
    fc.assert(
      fc.property(traceArb, ({ input }) => {
        const broken = {
          ...input,
          result: { ...input.result, blockingAlerts: input.result.blockingAlerts.map((a) => ({ ...a, updatedAt: "", activePeriod: [] })) },
        };
        for (const s of buildTrace(broken)) if (s.kind === "alert") expect(s.time).toBeUndefined();
      }),
    );
  });

  it("I7: every blocking alert appears in the trace with its original MBTA text", () => {
    fc.assert(
      fc.property(traceArb, ({ input, steps }) => {
        for (const a of input.result.blockingAlerts) {
          const step = steps.find((s) => s.id === `alert-${a.id}`);
          expect(step?.mbtaText).toBe(a.header);
        }
      }),
    );
  });

  it("the decision step states the engine verdict, and a cap is shown separately", () => {
    fc.assert(
      fc.property(traceArb, ({ input, steps }) => {
        expect(steps.find((s) => s.kind === "decision")?.status).toBe(input.result.status);
        const cap = steps.find((s) => s.kind === "cap");
        expect(Boolean(cap)).toBe(input.displayed.capped);
        if (cap) expect(cap.status).toBe(input.displayed.status);
      }),
    );
  });

  it("the Plan B step appears exactly when planB() ran, and names only its single points of failure and stations", () => {
    fc.assert(
      fc.property(traceArb, ({ input, steps }) => {
        const step = steps.find((s) => s.kind === "planb");
        expect(Boolean(step)).toBe(Boolean(input.planB));
        if (!step || !input.planB) return;
        expect(step.status).toBeUndefined();
        expect(step.evidence?.map((e) => e.label)).toEqual(input.planB.elevators.map((e) => e.facilityId));
        for (const e of input.planB.elevators.filter((x) => x.role === "no_backup")) {
          expect(step.detail).toContain(e.alternative ? `Backup station: ${e.alternative.name}.` : `${e.name}: no backup. No checked backup station found.`);
        }
      }),
    );
  });

  it("later-today steps match laterToday() one for one, with its start times and no verdict chip", () => {
    fc.assert(
      fc.property(traceArb, ({ input, steps }) => {
        const later = steps.filter((s) => s.kind === "later");
        expect(later.map((s) => s.time?.iso)).toEqual((input.laterToday ?? []).map((c) => c.startsAt));
        for (const s of later) expect(s.status).toBeUndefined();
      }),
    );
  });

  it("never claims an alternative the engine did not return", () => {
    fc.assert(
      fc.property(traceArb, ({ input, steps }) => {
        const alt = steps.find((s) => s.kind === "alternative");
        if (alt && input.result.alternative) expect(alt.title).toContain(input.result.alternative.name);
        if (alt && !input.result.alternative) expect(alt.title).toBe("No verified alternative found");
      }),
    );
  });
});
