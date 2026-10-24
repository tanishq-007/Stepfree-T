import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import fc from "fast-check";
import { RawStopWithChildrenSchema, type RawStopWithChildren } from "@/lib/data/schemas";
import { MAX_ENTRANCES, accessibleEntrances, normalizeEntrances, type Entrance } from "@/lib/data/entrances";
import type { WheelchairBoarding } from "@/lib/types";

const fixture = (name: string): unknown => JSON.parse(readFileSync(path.join(__dirname, "..", "fixtures", name), "utf8"));
// Real answers from GET /stops/{station}?include=child_stops, trimmed to the entrances (see tests/fixtures).
const alewife = RawStopWithChildrenSchema.parse(fixture("mbta-stop-alewife-entrances.json"));
const backBay = RawStopWithChildrenSchema.parse(fixture("mbta-stop-backbay-entrances.json"));
const bowdoin = RawStopWithChildrenSchema.parse(fixture("mbta-stop-bowdoin-entrances.json"));

const ids = (list: Entrance[]) => list.map((e) => e.id);

describe("normalizeEntrances (real MBTA answers)", () => {
  it("lists entrances in MBTA's order, which is the child_stops relationship (not the order of `included`)", () => {
    // `included` starts with door-alfcl-steel; the relationship starts with door-alfcl-alewife.
    expect(alewife.included?.find((s) => s.attributes.location_type === 2)?.id).toBe("door-alfcl-steel");
    expect(ids(normalizeEntrances(alewife))).toEqual([
      "door-alfcl-alewife",
      "door-alfcl-alewifes",
      "door-alfcl-cambridgepark",
      "door-alfcl-pathbusway",
      "door-alfcl-russell",
      "door-alfcl-steel",
    ]);
  });

  it("keeps only location_type 2 (not the platform or node that are also children)", () => {
    expect(alewife.data.relationships?.child_stops?.data?.map((c) => c.id)).toContain("70061");
    expect(ids(normalizeEntrances(alewife))).not.toContain("70061");
    expect(ids(normalizeEntrances(alewife))).not.toContain("node-814-fourth");
  });

  it("reads MBTA's wheelchair_boarding: 1 is accessible, 2 is not", () => {
    const byId = new Map(normalizeEntrances(backBay).map((e) => [e.id, e.wheelchair]));
    expect(byId.get("door-bbsta-buswayn")).toBe("accessible");
    expect(byId.get("door-bbsta-clarendon1")).toBe("not_accessible");
  });

  it("falls back to the order of `included` when the relationship is missing", () => {
    const noRelationship: RawStopWithChildren = { ...alewife, data: { ...alewife.data, relationships: {} } };
    expect(ids(normalizeEntrances(noRelationship))[0]).toBe("door-alfcl-steel");
  });
});

describe("accessibleEntrances", () => {
  it("Alewife: the first three in MBTA order", () => {
    expect(ids(accessibleEntrances(normalizeEntrances(alewife)))).toEqual(["door-alfcl-alewife", "door-alfcl-alewifes", "door-alfcl-cambridgepark"]);
  });

  it("Back Bay (10 entrances, 4 not accessible): skips the not accessible ones, keeps MBTA order, stops at 3", () => {
    const all = normalizeEntrances(backBay);
    expect(all).toHaveLength(10);
    expect(ids(accessibleEntrances(all))).toEqual(["door-bbsta-buswayn", "door-bbsta-busways", "door-bbsta-dartmn"]);
  });

  it("Bowdoin (its only entrance is not accessible): none", () => {
    expect(normalizeEntrances(bowdoin)).toHaveLength(1);
    expect(accessibleEntrances(normalizeEntrances(bowdoin))).toEqual([]);
  });

  it("treats 'no information' (0, null, missing) as NOT accessible, and ignores an accessible entrance with no coordinates", () => {
    const base = { name: "Door", point: { lat: 42.3, lng: -71.1 } };
    const list: Entrance[] = [
      { id: "unknown", wheelchair: "unknown", ...base },
      { id: "no-coords", wheelchair: "accessible", name: "Door", point: null },
      { id: "no", wheelchair: "not_accessible", ...base },
      { id: "yes", wheelchair: "accessible", ...base },
    ];
    expect(ids(accessibleEntrances(list))).toEqual(["yes"]);
    expect(MAX_ENTRANCES).toBe(3);
  });

  const wheelchairArb = fc.constantFrom<WheelchairBoarding>("accessible", "not_accessible", "unknown");
  const entranceArb: fc.Arbitrary<Entrance> = fc.record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 10 }),
    wheelchair: wheelchairArb,
    point: fc.option(fc.record({ lat: fc.double({ min: 42.2, max: 42.5, noNaN: true }), lng: fc.double({ min: -71.3, max: -71.0, noNaN: true }) }), { nil: null }),
  });

  it("property: only entrances marked accessible with coordinates, at most 3, in the order given", () => {
    fc.assert(
      fc.property(fc.array(entranceArb, { maxLength: 15 }), (list) => {
        const out = accessibleEntrances(list);
        const expected = list.filter((e) => e.wheelchair === "accessible" && e.point !== null).slice(0, 3);
        expect(ids(out)).toEqual(ids(expected));
        for (const e of out) {
          expect(e.wheelchair).toBe("accessible");
          expect(e.point).not.toBeNull();
        }
        expect(out.length).toBeLessThanOrEqual(3);
      }),
      { numRuns: 400 },
    );
  });
});
