// P16: when data sources do not line up, the answer is never STEP_FREE.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import type { Alert, DataSnapshot } from "@/lib/types";
import { evaluateTrip } from "@/lib/engine/evaluate-trip";
import { NOW, NOW_MS, mixedAlertsArb, platformMapArb, snapshotArb, tripArb } from "./arbitraries";

const RUNS = { numRuns: 300 };

function elevatorAlert(stationId: string, facilityIds: string[]): Alert {
  return {
    id: "conflict",
    effect: "ELEVATOR_CLOSURE",
    header: "An elevator is unavailable",
    description: "",
    stationIds: [stationId],
    facilityIds,
    activePeriod: [{ start: new Date(NOW_MS - 3_600_000).toISOString(), end: null }],
    severity: 3,
    updatedAt: NOW.toISOString(),
  };
}

const withAlert = (snap: DataSnapshot, alert: Alert): DataSnapshot => ({ ...snap, alerts: [...snap.alerts, alert] });

describe("P16: conflicting sources", () => {
  it("P16a: an elevator alert that names no elevator we know at that station is never STEP_FREE", () => {
    fc.assert(
      fc.property(
        tripArb,
        platformMapArb,
        snapshotArb(mixedAlertsArb),
        fc.boolean(),
        fc.constantFrom<string[]>([], ["not-a-real-elevator"], ["s9-f0", "zzz"]),
        (trip, map, snap, useOrigin, facilityIds) => {
          const target = useOrigin ? trip.originId : trip.destinationId;
          const before = evaluateTrip(trip, snap, NOW, map).status;
          const after = evaluateTrip(trip, withAlert(snap, elevatorAlert(target, facilityIds)), NOW, map);
          expect(after.status).not.toBe("STEP_FREE");
          if (before === "STEP_FREE") {
            expect(after.status).toBe("UNKNOWN");
            expect(after.reasons.some((r) => r.code === "PLATFORM_UNVERIFIED")).toBe(true);
          }
        },
      ),
      RUNS,
    );
  });

  it("P16b: an outage of a real elevator that is missing from the platform map is never STEP_FREE", () => {
    fc.assert(
      fc.property(tripArb, platformMapArb, snapshotArb(mixedAlertsArb), fc.boolean(), (trip, map, snap, useOrigin) => {
        const target = useOrigin ? trip.originId : trip.destinationId;
        const elevator = snap.facilities.find((f) => f.type === "elevator" && f.stationId === target);
        if (!elevator) return;
        const { [elevator.id]: _removed, ...mapWithout } = map;
        const result = evaluateTrip(trip, withAlert(snap, elevatorAlert(target, [elevator.id])), NOW, mapWithout);
        expect(result.status).not.toBe("STEP_FREE");
      }),
      RUNS,
    );
  });

  it("P16c: a station whose MBTA accessibility flag is unknown is never STEP_FREE", () => {
    fc.assert(
      fc.property(tripArb, platformMapArb, snapshotArb(mixedAlertsArb), fc.boolean(), (trip, map, snap, useOrigin) => {
        const target = useOrigin ? trip.originId : trip.destinationId;
        const stations = snap.stations.map((s) => (s.id === target ? { ...s, wheelchairBoarding: "unknown" as const } : s));
        expect(evaluateTrip(trip, { ...snap, stations }, NOW, map).status).not.toBe("STEP_FREE");
      }),
      RUNS,
    );
  });
});
