// Map markers must never be more optimistic than the engine (I3, I4).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { stationStatuses } from "@/lib/engine/station-map";
import { evaluateStation } from "@/lib/engine/rules";
import { mixedAlertsArb, NOW, NOW_MS, platformMapArb, profileArb, snapshotArb } from "./arbitraries";

describe("stationStatuses", () => {
  it("I4: a marker is STEP_FREE only when evaluateStation says so, and always matches it on fresh data", () => {
    fc.assert(
      fc.property(snapshotArb(mixedAlertsArb), profileArb, platformMapArb, (snap, profile, map) => {
        for (const m of stationStatuses(snap, profile, NOW, map)) {
          const station = snap.stations.find((s) => s.id === m.id);
          if (!station) throw new Error("marker for unknown station");
          expect(m.status).toBe(evaluateStation(station, profile, snap, NOW_MS, map).status);
        }
      }),
    );
  });

  it("I3: stale data turns every marker UNKNOWN", () => {
    fc.assert(
      fc.property(snapshotArb(mixedAlertsArb), profileArb, fc.integer({ min: 11, max: 10_000 }), (snap, profile, ageMin) => {
        const stale = { ...snap, fetchedAt: new Date(NOW_MS - ageMin * 60_000).toISOString() };
        expect(stationStatuses(stale, profile, NOW).every((m) => m.status === "UNKNOWN")).toBe(true);
      }),
    );
  });

  it("no outage is not enough: a station MBTA does not list as accessible is never green", () => {
    fc.assert(
      fc.property(snapshotArb(mixedAlertsArb), profileArb, (snap, profile) => {
        for (const m of stationStatuses(snap, profile, NOW)) {
          if (m.wheelchairBoarding !== "accessible") expect(m.status).not.toBe("STEP_FREE");
        }
      }),
    );
  });

  it("a station with an active blocking alert is never green", () => {
    fc.assert(
      fc.property(snapshotArb(mixedAlertsArb), profileArb, (snap, profile) => {
        for (const m of stationStatuses(snap, profile, NOW)) if (m.blockingAlertIds.length > 0) expect(m.status).toBe("NOT_STEP_FREE");
      }),
    );
  });
});
