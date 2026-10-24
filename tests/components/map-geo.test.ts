// Map geometry on the REAL committed MBTA network: the highlighted segment is a slice of an official
// shape, only for direct trips, and the map never invents a route for transfers or unknown connections.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import snapshot from "@/lib/data/snapshots/mbta-snapshot.json";
import { readNetworkFile } from "@/lib/data/network";
import { routeRelationship } from "@/lib/engine/journey";
import { emphasisedLines, tripSegment } from "@/lib/client/map-geo";

const stations = (snapshot as { stations: { id: string; name: string; lat: number; lng: number }[] }).stations;
const st = (id: string) => stations.find((s) => s.id === id) ?? null;

describe("tripSegment (real MBTA geometry)", () => {
  it("Alewife to Park Street is a slice of the Red Line shape between the two stations", async () => {
    const net = await readNetworkFile();
    const journey = routeRelationship("place-alfcl", "place-pktrm", net.patterns);
    const seg = tripSegment(net.patterns, journey, st("place-alfcl"), st("place-pktrm"));
    expect(seg?.line).toBe("Red");
    const red = net.patterns.find((p) => p.line === "Red");
    const ends = [seg?.coordinates[0], seg?.coordinates.at(-1)];
    for (const [s, end] of [[st("place-alfcl"), ends[0]], [st("place-pktrm"), ends[1]]] as const) {
      expect(Math.abs((end?.[1] ?? 0) - (s?.lat ?? 0))).toBeLessThan(0.004);
    }
    // every point really comes from an official shape
    const official = new Set(net.patterns.flatMap((p) => p.coordinates.map((c) => c.join(","))));
    expect(seg?.coordinates.every((c) => official.has(c.join(",")))).toBe(true);
    expect(seg?.coordinates.length).toBeLessThan(red?.coordinates.length ?? 0);
  });

  it("never builds a segment for a transfer or unknown connection", async () => {
    const net = await readNetworkFile();
    const ids = stations.map((s) => s.id);
    fc.assert(
      fc.property(fc.constantFrom(...ids), fc.constantFrom(...ids), (a, b) => {
        const journey = routeRelationship(a, b, net.patterns);
        const seg = tripSegment(net.patterns, journey, st(a), st(b));
        if (journey.kind !== "direct") expect(seg).toBeNull();
        if (seg && journey.kind === "direct") expect(journey.lines).toContain(seg.line);
      }),
      { numRuns: 150 },
    );
  });

  it("emphasises no line for an unknown connection", () => {
    expect(emphasisedLines({ kind: "unknown", reason: "NO_SINGLE_TRANSFER" })).toEqual([]);
    expect(emphasisedLines({ kind: "direct", lines: ["Red"] })).toEqual(["Red"]);
    expect(emphasisedLines({ kind: "transfer", originLines: ["Red"], destinationLines: ["Orange"], transferStationIds: ["x"] }).sort()).toEqual(["Orange", "Red"]);
  });
});
