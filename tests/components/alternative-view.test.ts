// Visual Plan B adapter: it only ever presents the engine's own alternative, never invents one.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { buildDemoSnapshot, DEMO_TRIP } from "@/lib/data/demo-snapshot";
import { evaluateTrip } from "@/lib/engine/evaluate-trip";
import { stationStatuses } from "@/lib/engine/station-map";
import { alternativeAction, alternativeFromResult, NO_ALTERNATIVE_MESSAGE } from "@/lib/client/alternative-view";
import type { StatusResponse } from "@/lib/client/types";
import type { DataSnapshot, Trip } from "@/lib/types";
import type { PlatformMap } from "@/lib/data/platform-map";
import { AlternativePanel } from "@/components/AlternativeCard";
import { mixedAlertsArb, NOW, platformMapArb, snapshotArb, tripArb } from "../engine/arbitraries";

function response(trip: Trip, snap: DataSnapshot, now: Date, map?: PlatformMap): StatusResponse {
  const r = evaluateTrip(trip, snap, now, map);
  return {
    ...r,
    trip: { profile: trip.profile, origin: snap.stations.find((s) => s.id === trip.originId) ?? null, destination: snap.stations.find((s) => s.id === trip.destinationId) ?? null },
    stations: stationStatuses(snap, trip.profile, now, map),
  };
}

const now = new Date();
const demo = (scenario: "elevator-outage-alewife" | "all-clear" | "api-down") => response({ ...DEMO_TRIP, profile: "wheelchair" }, buildDemoSnapshot(scenario, now), now);

describe("alternativeFromResult on the demo scenarios", () => {
  it("elevator outage: Alewife is the original, Davis the engine's alternative", () => {
    const v = alternativeFromResult(demo("elevator-outage-alewife"));
    expect(v.kind).toBe("suggested");
    if (v.kind !== "suggested") return;
    expect(v.original).toMatchObject({ id: "place-alfcl", name: "Alewife", role: "origin", status: "NOT_STEP_FREE" });
    expect(v.original.issue).toContain("Elevator");
    expect(v.alternative).toMatchObject({ id: "place-davis", name: "Davis", status: "STEP_FREE", sharedLines: ["Red"] });
    expect(v.why).toContain("straight-line");
    expect(v.why).toContain("not checked the trip between");
    expect(alternativeAction(v)).toEqual({ type: "setOrigin", id: "place-davis" });
  });

  it("all clear needs no Plan B; stale data gets the honest no-alternative message", () => {
    expect(alternativeFromResult(demo("all-clear")).kind).toBe("not-needed");
    expect(alternativeFromResult(demo("api-down"))).toEqual({ kind: "none", message: NO_ALTERNATIVE_MESSAGE });
  });

  it("a transfer-capped trip is not called step-free, and no alternative is invented for it", () => {
    const r = demo("all-clear");
    const capped = { ...r, display: { status: "UNKNOWN" as const, capped: true, capReasons: [] } };
    expect(alternativeFromResult(capped)).toEqual({ kind: "none", message: NO_ALTERNATIVE_MESSAGE });
  });
});

describe("alternativeFromResult never invents a Plan B", () => {
  it("suggests a station only when the engine returned it, and it is exactly that station", () => {
    fc.assert(
      fc.property(snapshotArb(mixedAlertsArb), tripArb, platformMapArb, (snap, trip, map) => {
        const r = response(trip, snap, NOW, map);
        const v = alternativeFromResult(r);
        if (v.kind === "suggested") {
          expect(r.alternative?.id).toBe(v.alternative.id);
          expect([trip.originId, trip.destinationId]).toContain(v.original.id);
          expect([trip.originId, trip.destinationId]).not.toContain(v.alternative.id);
        }
        if (!r.alternative && r.status !== "STEP_FREE") expect(v.kind).toBe("none");
      }),
    );
  });
});

describe("AlternativePanel markup", () => {
  it("shows the comparison and both actions with descriptive names", () => {
    const html = renderToStaticMarkup(createElement(AlternativePanel, { result: demo("elevator-outage-alewife"), interactive: true }));
    expect(html).toContain("Suggested alternative");
    expect(html).toContain("instead of Alewife");
    expect(html).toContain('aria-label="Show on map: Davis and Alewife"');
    expect(html).toContain("Use this station for my trip");
    expect(html).toContain("You will need to check the new trip");
  });

  it("renders the honest message when there is no alternative, and nothing when all clear", () => {
    expect(renderToStaticMarkup(createElement(AlternativePanel, { result: demo("api-down"), interactive: true }))).toContain(NO_ALTERNATIVE_MESSAGE);
    expect(renderToStaticMarkup(createElement(AlternativePanel, { result: demo("all-clear"), interactive: true }))).toBe("");
  });
});
