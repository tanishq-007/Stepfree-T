// "Missing data is ALWAYS unknown, never yes." Checked on generated Google answers.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { normalizeAccessibility, triState } from "@/lib/google/accessibility";
import { toRestroomPlaces } from "@/lib/google/restrooms";
import type { GooglePlace } from "@/lib/google/schemas";

const RUNS = { numRuns: 400 };
const FIELDS = [
  ["wheelchairAccessibleRestroom", "restroom"],
  ["wheelchairAccessibleEntrance", "entrance"],
  ["wheelchairAccessibleParking", "parking"],
  ["wheelchairAccessibleSeating", "seating"],
] as const;

/** Any value Google (or a bug) could put in a field, including nonsense. */
const anyValueArb = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.boolean(),
  fc.constantFrom("true", "false", "yes", "", "1", "0"),
  fc.integer(),
  fc.constant({}),
  fc.constant([true]),
);

/** Each key may be missing, undefined, or hold anything. */
const optionsArb = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.string(),
  fc.integer(),
  fc.constant([]),
  fc.record(
    {
      wheelchairAccessibleRestroom: anyValueArb,
      wheelchairAccessibleEntrance: anyValueArb,
      wheelchairAccessibleParking: anyValueArb,
      wheelchairAccessibleSeating: anyValueArb,
    },
    { requiredKeys: [] },
  ),
);

describe("normalizeAccessibility", () => {
  it("never maps a missing or undefined field to 'yes'", () => {
    fc.assert(
      fc.property(optionsArb, (options) => {
        const result = normalizeAccessibility(options);
        const record = typeof options === "object" && options !== null && !Array.isArray(options) ? (options as Record<string, unknown>) : {};
        for (const [field, key] of FIELDS) {
          if (record[field] === undefined) expect(result[key]).toBe("unknown");
        }
      }),
      RUNS,
    );
  });

  it("says 'yes' only for a real true, 'no' only for a real false, and 'unknown' for everything else", () => {
    fc.assert(
      fc.property(optionsArb, (options) => {
        const result = normalizeAccessibility(options);
        const record = typeof options === "object" && options !== null && !Array.isArray(options) ? (options as Record<string, unknown>) : {};
        for (const [field, key] of FIELDS) {
          const raw = record[field];
          expect(result[key] === "yes").toBe(raw === true);
          expect(result[key] === "no").toBe(raw === false);
          expect(["yes", "no", "unknown"]).toContain(result[key]);
        }
      }),
      RUNS,
    );
  });

  it.each([undefined, null, {}, [], "x", 0, { wheelchairAccessibleEntrance: true }])("a missing restroom field is unknown: %j", (options) => {
    expect(normalizeAccessibility(options).restroom).toBe("unknown");
  });

  it("triState examples", () => {
    expect(triState(true)).toBe("yes");
    expect(triState(false)).toBe("no");
    expect(triState(undefined)).toBe("unknown");
    expect(triState("true")).toBe("unknown");
  });
});

const ORIGIN = { lat: 42.39583, lng: -71.141287 };

/** Places near the origin with random accessibility data. */
const placeArb: fc.Arbitrary<GooglePlace> = fc
  .record({
    id: fc.uuid(),
    name: fc.string({ minLength: 1, maxLength: 12 }).filter((s) => s.trim().length > 0),
    dLat: fc.double({ min: -0.006, max: 0.006, noNaN: true }),
    dLng: fc.double({ min: -0.006, max: 0.006, noNaN: true }),
    restroom: fc.constantFrom(true, false, undefined),
    entrance: fc.constantFrom(true, false, undefined),
    hasOptions: fc.boolean(),
    openNow: fc.constantFrom(true, false, undefined),
  })
  .map((p) => ({
    id: p.id,
    displayName: { text: p.name },
    location: { latitude: ORIGIN.lat + p.dLat, longitude: ORIGIN.lng + p.dLng },
    googleMapsUri: `https://maps.google.com/?cid=${p.id}`,
    ...(p.openNow === undefined ? {} : { currentOpeningHours: { openNow: p.openNow } }),
    ...(p.hasOptions
      ? {
          accessibilityOptions: {
            ...(p.restroom === undefined ? {} : { wheelchairAccessibleRestroom: p.restroom }),
            ...(p.entrance === undefined ? {} : { wheelchairAccessibleEntrance: p.entrance }),
          },
        }
      : {}),
  }));

describe("toRestroomPlaces", () => {
  it("keeps exactly the places Google says have an accessible restroom, nearest first", () => {
    fc.assert(
      fc.property(fc.array(placeArb, { maxLength: 25 }), (places) => {
        const out = toRestroomPlaces(places, ORIGIN);
        const expectedIds = new Set(places.filter((p) => p.accessibilityOptions?.wheelchairAccessibleRestroom === true).map((p) => p.id));
        expect(new Set(out.map((p) => p.id))).toEqual(expectedIds);
        for (const p of out) expect(p.wheelchairRestroom).toBe("yes");
        for (let i = 1; i < out.length; i += 1) expect(out[i]!.distanceMeters).toBeGreaterThanOrEqual(out[i - 1]!.distanceMeters);
      }),
      RUNS,
    );
  });

  it("reports hours as null when Google does not say, and the entrance as unknown when it is not reported", () => {
    const place: GooglePlace = {
      id: "p1",
      displayName: { text: "Cafe" },
      location: { latitude: ORIGIN.lat, longitude: ORIGIN.lng },
      accessibilityOptions: { wheelchairAccessibleRestroom: true },
    };
    const [out] = toRestroomPlaces([place], ORIGIN);
    expect(out?.openNow).toBeNull();
    expect(out?.wheelchairEntrance).toBe("unknown");
  });

  it("builds a documented Maps link when Google sends none, and ignores a non-https link", () => {
    const base: GooglePlace = { id: "abc", displayName: { text: "X" }, location: { latitude: 42.1, longitude: -71.2 }, accessibilityOptions: { wheelchairAccessibleRestroom: true } };
    const [none] = toRestroomPlaces([base], ORIGIN);
    expect(none?.mapsUrl).toBe("https://www.google.com/maps/search/?api=1&query=42.1%2C-71.2&query_place_id=abc");
    const [bad] = toRestroomPlaces([{ ...base, googleMapsUri: "javascript:alert(1)" }], ORIGIN);
    expect(bad?.mapsUrl.startsWith("https://www.google.com/maps/search/")).toBe(true);
  });

  it("drops a place with no name or no location (we could not tell the rider where it is)", () => {
    const ok = { wheelchairAccessibleRestroom: true };
    expect(toRestroomPlaces([{ id: "a", location: { latitude: 1, longitude: 1 }, accessibilityOptions: ok }], ORIGIN)).toEqual([]);
    expect(toRestroomPlaces([{ id: "b", displayName: { text: "B" }, accessibilityOptions: ok }], ORIGIN)).toEqual([]);
  });
});
