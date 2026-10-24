// Example-based tests for Plan B, later today, and naming the working elevator.
import { describe, expect, it } from "vitest";
import type { Alert, DataSnapshot, Facility, Station } from "@/lib/types";
import type { PlatformMap } from "@/lib/data/platform-map";
import { evaluateTrip } from "@/lib/engine/evaluate-trip";
import { laterToday } from "@/lib/engine/later-today";
import { planB } from "@/lib/engine/plan-b";

const NOW = new Date("2026-10-24T16:00:00Z");
const st = (id: string, lat: number): Station => ({ id, name: id.toUpperCase(), lines: ["Red"], wheelchairBoarding: "accessible", lat, lng: -71.1 });
const elev = (id: string, stationId: string): Facility => ({ id, stationId, type: "elevator", name: `Elevator ${id}`, servesPlatforms: "unknown" });
const entry = (stationId: string, platforms: string[], verified = true) => ({ stationId, platforms, verified });
const outage = (id: string, stationId: string, facilityId: string, start = "2026-10-24T10:00:00Z", end: string | null = null): Alert => ({
  id, effect: "ELEVATOR_CLOSURE", header: `Elevator ${facilityId} is unavailable`, description: "", stationIds: [stationId],
  facilityIds: [facilityId], activePeriod: [{ start, end }], severity: 3, updatedAt: start,
});
const snap = (facilities: Facility[], alerts: Alert[] = []): DataSnapshot => ({
  stations: [st("a", 42.3), st("b", 42.31), st("c", 42.32), st("d", 42.29)],
  facilities, alerts, fetchedAt: "2026-10-24T15:58:00Z", source: "live",
});
const trip = { originId: "a", destinationId: "b", profile: "wheelchair" as const };

describe("naming the working elevator", () => {
  it("says which elevator to use instead", () => {
    const map: PlatformMap = { a1: entry("a", ["P1"]), a2: entry("a", ["P1"]) };
    const r = evaluateTrip(trip, snap([elev("a1", "a"), elev("a2", "a")], [outage("o", "a", "a1")]), NOW, map);
    expect(r.status).toBe("STEP_FREE");
    const reason = r.reasons.find((x) => x.code === "ELEVATOR_ALTERNATIVE_AVAILABLE");
    expect(reason?.message).toBe("Elevator a1 is out. Use Elevator a2 instead. It reaches the same platform.");
  });

  it("lists every backup when there is more than one", () => {
    const map: PlatformMap = { a1: entry("a", ["P1"]), a2: entry("a", ["P1"]), a3: entry("a", ["P1"]) };
    const r = evaluateTrip(trip, snap([elev("a1", "a"), elev("a2", "a"), elev("a3", "a")], [outage("o", "a", "a1")]), NOW, map);
    expect(r.reasons.find((x) => x.code === "ELEVATOR_ALTERNATIVE_AVAILABLE")?.message).toContain("Use Elevator a2 or Elevator a3 instead. Each one reaches");
  });

  it("never names an unverified elevator as the one to use", () => {
    const map: PlatformMap = { a1: entry("a", ["P1"]), a2: entry("a", ["P1"]), a3: entry("a", ["P1"], false) };
    const r = evaluateTrip(trip, snap([elev("a1", "a"), elev("a2", "a"), elev("a3", "a")], [outage("o", "a", "a1")]), NOW, map);
    const message = r.reasons.find((x) => x.code === "ELEVATOR_ALTERNATIVE_AVAILABLE")?.message ?? "";
    expect(message).toContain("Elevator a2");
    expect(message).not.toContain("Elevator a3");
  });
});

describe("Plan B", () => {
  it("is fragile when a station has one elevator to its platform, and offers a checked station", () => {
    // Like Davis: a1 is the only elevator to the platform. Station d (same line, nearest, no elevators listed) is the Plan B.
    const map: PlatformMap = { a1: entry("a", ["Platform"]), b1: entry("b", ["P"]), b2: entry("b", ["P"]) };
    const plan = planB(trip, snap([elev("a1", "a"), elev("b1", "b"), elev("b2", "b")]), NOW, map);
    expect(plan?.status).toBe("fragile");
    expect(plan?.elevators[0]).toMatchObject({ facilityId: "a1", role: "no_backup" });
    expect(plan?.elevators[0]?.alternative?.id).toBe("d");
    expect(plan?.elevators.filter((e) => e.role === "has_backup").map((e) => e.facilityId)).toEqual(["b1", "b2"]);
  });

  it("is resilient when every elevator has a verified backup", () => {
    const map: PlatformMap = { a1: entry("a", ["P"]), a2: entry("a", ["P"]), b1: entry("b", [], true) };
    const plan = planB(trip, snap([elev("a1", "a"), elev("a2", "a"), elev("b1", "b")]), NOW, map);
    expect(plan?.status).toBe("resilient");
    expect(plan?.elevators.find((e) => e.facilityId === "b1")?.role).toBe("not_on_route");
  });

  it("cannot confirm when an elevator is unmapped, and never calls it a single point of failure", () => {
    const map: PlatformMap = { a1: entry("a", ["P"]), a2: entry("a", ["P"]) };
    const plan = planB(trip, snap([elev("a1", "a"), elev("a2", "a"), elev("b1", "b")]), NOW, map);
    expect(plan?.status).toBe("cannot_confirm");
    expect(plan?.elevators.find((e) => e.facilityId === "b1")?.role).toBe("cannot_check");
  });

  it("counts an elevator that is already out: the remaining one becomes the single point of failure", () => {
    const map: PlatformMap = { a1: entry("a", ["P"]), a2: entry("a", ["P"]) };
    const plan = planB(trip, snap([elev("a1", "a"), elev("a2", "a")], [outage("o", "a", "a1")]), NOW, map);
    expect(plan?.elevators.map((e) => [e.facilityId, e.role])).toEqual([["a2", "no_backup"]]);
  });

  it("is not shown when the trip is not step-free right now", () => {
    const map: PlatformMap = { a1: entry("a", ["P"]) };
    expect(planB(trip, snap([elev("a1", "a")], [outage("o", "a", "a1")]), NOW, map)).toBeNull();
  });
});

describe("later today", () => {
  const map: PlatformMap = { a1: entry("a", ["P"]), a2: entry("a", ["P"]) };
  const facilities = [elev("a1", "a"), elev("a2", "a")];

  it("warns about planned work that will block the trip in a few hours", () => {
    const planned = [outage("p1", "a", "a1", "2026-10-24T19:00:00Z", "2026-10-24T23:00:00Z"), outage("p2", "a", "a2", "2026-10-24T19:00:00Z", "2026-10-24T23:00:00Z")];
    const s = snap(facilities, planned);
    expect(evaluateTrip(trip, s, NOW, map).status).toBe("STEP_FREE");
    const w = laterToday(trip, s, NOW, map);
    expect(w).toHaveLength(1);
    expect(w[0]).toMatchObject({ startsAt: "2026-10-24T19:00:00.000Z", status: "NOT_STEP_FREE", stationIds: ["a"] });
    expect(w[0]?.alerts.map((a) => a.id).sort()).toEqual(["p1", "p2"]);
  });

  it("stays quiet when a backup elevator covers the planned outage", () => {
    const s = snap(facilities, [outage("p1", "a", "a1", "2026-10-24T19:00:00Z")]);
    expect(laterToday(trip, s, NOW, map)).toEqual([]);
  });

  it("ignores work that starts after the 12 hour window", () => {
    const late = [outage("p1", "a", "a1", "2026-10-25T06:00:00Z"), outage("p2", "a", "a2", "2026-10-25T06:00:00Z")];
    expect(laterToday(trip, snap(facilities, late), NOW, map)).toEqual([]);
  });
});
