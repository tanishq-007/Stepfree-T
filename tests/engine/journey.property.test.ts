// Route relationship and the display cap. The cap may only ever make a verdict MORE cautious.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { AccessStatus } from "@/lib/types";
import { presentableStatus, routeRelationship, type LineMembership, type RouteRelationship } from "@/lib/engine/journey";
import { readNetworkFile } from "@/lib/data/network";

const RANK: Record<AccessStatus, number> = { STEP_FREE: 0, UNKNOWN: 1, NOT_STEP_FREE: 2 };
const statusArb = fc.constantFrom<AccessStatus>("STEP_FREE", "NOT_STEP_FREE", "UNKNOWN");
const journeyArb: fc.Arbitrary<RouteRelationship> = fc.oneof(
  fc.record({ kind: fc.constant("direct" as const), lines: fc.array(fc.constantFrom("Red", "Blue"), { minLength: 1, maxLength: 2 }) }),
  fc.record({
    kind: fc.constant("transfer" as const),
    originLines: fc.constant<string[]>(["Red"]),
    destinationLines: fc.constant<string[]>(["Blue"]),
    transferStationIds: fc.array(fc.constantFrom("s1", "s2"), { minLength: 1 }),
  }),
  fc.record({ kind: fc.constant("unknown" as const), reason: fc.constantFrom("NO_NETWORK" as const, "STATION_NOT_IN_NETWORK" as const, "NO_SINGLE_TRANSFER" as const) }),
);

describe("presentableStatus (I1, I2)", () => {
  it("I1: never shows a verdict better than the engine's", () => {
    fc.assert(
      fc.property(statusArb, journeyArb, (status, journey) => {
        expect(RANK[presentableStatus({ status }, journey, "s0").status]).toBeGreaterThanOrEqual(RANK[status]);
      }),
    );
  });

  it("I2: a transfer or unknown connection never displays STEP_FREE", () => {
    fc.assert(
      fc.property(statusArb, journeyArb, (status, journey) => {
        const shown = presentableStatus({ status }, journey, "s0");
        if (journey.kind !== "direct") expect(shown.status).not.toBe("STEP_FREE");
        if (shown.capped) expect(shown.capReasons.length).toBeGreaterThan(0);
      }),
    );
  });

  it("leaves NOT_STEP_FREE and UNKNOWN untouched and only caps STEP_FREE", () => {
    fc.assert(
      fc.property(statusArb, journeyArb, (status, journey) => {
        const shown = presentableStatus({ status }, journey, "s0");
        expect(shown.capped).toBe(status === "STEP_FREE" && journey.kind !== "direct");
      }),
    );
  });
});

// Random networks: a list of lines over 8 stations.
const networkArb: fc.Arbitrary<LineMembership[]> = fc.array(
  fc.record({ line: fc.constantFrom("A", "B", "C", "D"), stationIds: fc.subarray(["s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7"], { minLength: 2 }) }),
  { maxLength: 6 },
);
const idArb = fc.constantFrom("s0", "s1", "s2", "s3", "s4", "s5", "s6", "s7", "nope");

describe("routeRelationship", () => {
  it("direct only when a line really contains both stations, and reports only those lines", () => {
    fc.assert(
      fc.property(networkArb, idArb, idArb, (net, a, b) => {
        const r = routeRelationship(a, b, net);
        if (r.kind === "direct") {
          for (const line of r.lines) {
            const members = new Set(net.filter((p) => p.line === line).flatMap((p) => p.stationIds));
            expect(members.has(a) && members.has(b)).toBe(true);
          }
        }
      }),
    );
  });

  it("transfer stations are on a line through each end", () => {
    fc.assert(
      fc.property(networkArb, idArb, idArb, (net, a, b) => {
        const r = routeRelationship(a, b, net);
        if (r.kind !== "transfer") return;
        const on = (line: string) => new Set(net.filter((p) => p.line === line).flatMap((p) => p.stationIds));
        for (const t of r.transferStationIds) {
          expect(r.originLines.some((l) => on(l).has(t))).toBe(true);
          expect(r.destinationLines.some((l) => on(l).has(t))).toBe(true);
        }
      }),
    );
  });

  it("no network or a station outside it is unknown, never direct", () => {
    expect(routeRelationship("s0", "s1", null)).toEqual({ kind: "unknown", reason: "NO_NETWORK" });
    expect(routeRelationship("s0", "zz", [{ line: "A", stationIds: ["s0", "s1"] }]).kind).toBe("unknown");
  });
});

describe("routeRelationship on the committed MBTA network (real data)", () => {
  it("knows real direct, transfer and unsupported trips", async () => {
    const net = await readNetworkFile();
    expect(routeRelationship("place-alfcl", "place-pktrm", net.patterns)).toEqual({ kind: "direct", lines: ["Red"] });
    const toOakGrove = routeRelationship("place-alfcl", "place-ogmnl", net.patterns);
    expect(toOakGrove.kind).toBe("transfer");
    if (toOakGrove.kind === "transfer") expect(toOakGrove.transferStationIds).toContain("place-dwnxg");
    // Red to Blue needs two changes: not supported, so it must not be called direct or a single transfer.
    expect(routeRelationship("place-alfcl", "place-wondl", net.patterns).kind).toBe("unknown");
  });
});
