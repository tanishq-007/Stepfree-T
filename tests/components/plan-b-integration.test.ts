// One Plan B slot, two kinds: the engine's alternative for a problem now, and planB() backups for a step-free
// trip. Both are presented, never invented, and they never appear together. Also: a trip picked on the map is
// "Not checked yet" and never shown with the previous trip's verdict.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { buildDemoSnapshot, demoTrip, type DemoScenario } from "@/lib/data/demo-snapshot";
import { buildTripPayload } from "@/lib/api/trip-payload";
import { stationStatuses } from "@/lib/engine/station-map";
import { alternativeFromResult, backupsFromPlanB, backupStations, NO_ALTERNATIVE_MESSAGE } from "@/lib/client/alternative-view";
import { EMPTY_DRAFT, isPending } from "@/lib/client/trip-draft";
import type { StatusResponse } from "@/lib/client/types";
import type { DataSnapshot, Trip } from "@/lib/types";
import type { PlatformMap } from "@/lib/data/platform-map";
import PlanBPanel from "@/components/PlanBPanel";
import PendingTripCard from "@/components/PendingTripCard";
import { mixedAlertsArb, NOW, platformMapArb, snapshotArb, tripArb } from "../engine/arbitraries";

function response(trip: Trip, snap: DataSnapshot, now: Date, map?: PlatformMap): StatusResponse {
  return { ...buildTripPayload(trip, snap, now, map), stations: stationStatuses(snap, trip.profile, now, map) };
}

const now = new Date();
const demo = (scenario: DemoScenario) => response({ ...demoTrip(scenario), profile: "wheelchair" }, buildDemoSnapshot(scenario, now), now);
const panel = (r: StatusResponse) => renderToStaticMarkup(createElement(PlanBPanel, { result: r, interactive: true }));

describe("backupsFromPlanB only presents planB()", () => {
  it("plan-b-davis: Davis Elevator 816 is the single point of failure and Porter its backup", () => {
    const backups = backupsFromPlanB(demo("plan-b-davis"));
    expect(backups).toHaveLength(1);
    expect(backups[0]).toMatchObject({ facilityId: "816", at: { id: "place-davis", name: "Davis", role: "origin" }, backup: { id: "place-portr", name: "Porter", status: "STEP_FREE", sharedLines: ["Red"] } });
    expect([...backupStations(backups).keys()]).toEqual(["place-portr"]);
  });

  it("is empty for a trip with a problem now (the engine alternative applies instead)", () => {
    expect(backupsFromPlanB(demo("elevator-outage-alewife"))).toEqual([]);
    expect(backupsFromPlanB(demo("api-down"))).toEqual([]);
  });

  it("every backup is exactly a planB() station for a no-backup elevator at a trip end, never an endpoint", () => {
    fc.assert(
      fc.property(snapshotArb(mixedAlertsArb), tripArb, platformMapArb, (snap, trip, map) => {
        const r = response(trip, snap, NOW, map);
        const backups = backupsFromPlanB(r);
        const spofs = (r.planB?.elevators ?? []).filter((e) => e.role === "no_backup");
        expect(backups.map((b) => b.facilityId)).toEqual(spofs.map((e) => e.facilityId));
        backups.forEach((b, i) => {
          expect(b.backup?.id ?? null).toBe(spofs[i]?.alternative?.id ?? null);
          expect([trip.originId, trip.destinationId]).toContain(b.at.id);
          if (b.backup) expect([trip.originId, trip.destinationId]).not.toContain(b.backup.id);
        });
      }),
      { numRuns: 300 },
    );
  });

  it("the current alternative and Plan B backups never appear for the same result", () => {
    fc.assert(
      fc.property(snapshotArb(mixedAlertsArb), tripArb, platformMapArb, (snap, trip, map) => {
        const r = response(trip, snap, NOW, map);
        const now = alternativeFromResult(r).kind === "suggested";
        const later = backupsFromPlanB(r).some((b) => b.backup !== null);
        expect(now && later).toBe(false);
      }),
      { numRuns: 300 },
    );
  });
});

describe("PlanBPanel shows exactly one kind of Plan B", () => {
  it("a problem now: the engine alternative, labelled for right now", () => {
    const html = panel(demo("elevator-outage-alewife"));
    expect(html).toContain("Plan B for right now");
    expect(html).toContain("Try Davis instead of Alewife");
    expect(html).toContain("Use this station for my trip");
    expect(html).not.toContain("Plan B if an elevator breaks");
  });

  it("step-free with a single point of failure: the hypothetical backup, with Show on map, and no Use button", () => {
    const html = panel(demo("plan-b-davis"));
    expect(html).toContain("Plan B if an elevator breaks");
    expect(html).toContain("Not needed right now");
    expect(html).toContain("Plan B: your trip depends on one elevator");
    expect(html).toContain("use Porter instead");
    expect(html).toContain('aria-label="Show on map: Porter, the backup for Davis"');
    expect(html).not.toContain("Plan B for right now");
    expect(html).not.toContain("Use this station for my trip");
  });

  it("stale data: no station is suggested, and the slot says so honestly", () => {
    const html = panel(demo("api-down"));
    expect(html).toContain("Plan B for right now");
    expect(html).toContain(NO_ALTERNATIVE_MESSAGE);
    expect(html).not.toContain("Plan B if an elevator breaks");
  });

  it("a transfer-capped trip says Plan B covers only the two end stations", () => {
    const r = demo("all-clear");
    const capped: StatusResponse = {
      ...r,
      display: { status: "UNKNOWN", capped: true, capReasons: [] },
      journey: { kind: "transfer", originLines: ["Red"], destinationLines: ["Orange"], transferStationIds: ["place-dwnxg"], transferStations: [{ id: "place-dwnxg", name: "Downtown Crossing" }] },
    };
    const html = panel(capped);
    expect(html).toContain("Plan B covers your start and end stations only. The change of line at Downtown Crossing is not checked.");
    expect(html).not.toContain(NO_ALTERNATIVE_MESSAGE);
  });
});

describe("a new map selection is 'Not checked yet'", () => {
  const evaluated = { originId: "place-alfcl", destinationId: "place-pktrm" };
  const base = { ...evaluated };

  it("is pending only after the rider changes the draft", () => {
    expect(isPending({ draft: base, base }, evaluated)).toBe(false);
    expect(isPending({ draft: { originId: "place-davis", destinationId: "place-pktrm" }, base }, evaluated)).toBe(true);
    expect(isPending({ draft: EMPTY_DRAFT, base }, evaluated)).toBe(true);
  });

  it("does not flash pending when a new result arrives before the map resets the draft", () => {
    // Switching scenario: the untouched draft still holds the old trip for one render.
    expect(isPending({ draft: base, base }, { originId: "place-davis", destinationId: "place-pktrm" })).toBe(false);
    // Checking the picked trip: the result is for the draft, so it is not pending either.
    const picked = { originId: "place-davis", destinationId: "place-pktrm" };
    expect(isPending({ draft: picked, base }, picked)).toBe(false);
  });

  it("the pending card never shows a verdict for the new trip, only for the last checked one", () => {
    const html = renderToStaticMarkup(
      createElement(PendingTripCard, {
        draft: { originId: "place-davis", destinationId: "place-pktrm" },
        nameOf: (id: string) => ({ "place-davis": "Davis", "place-pktrm": "Park Street" })[id],
        knownIds: new Set(["place-davis", "place-pktrm"]),
        profile: "wheelchair",
        simulated: false,
        checking: false,
        last: { label: "Alewife to Park Street", status: "STEP_FREE" },
        onCheck: () => undefined,
        onCancel: () => undefined,
      }),
    );
    expect(html).toContain("Not checked yet");
    expect(html).toContain("Davis to Park Street");
    expect(html).toContain("Check accessibility");
    const [beforeLast, lastLine] = html.split("Last checked:");
    expect(beforeLast).not.toMatch(/Step-free|Not step-free|Cannot confirm/);
    expect(lastLine).toContain("Alewife to Park Street");
    expect(lastLine).toContain("Step-free");
  });
});
