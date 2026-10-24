// The compass bearing used to point the Street View camera at the entrance.
import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { bearingDegrees } from "@/lib/engine/geo";

const RUNS = { numRuns: 500 };
const latArb = fc.double({ min: -90, max: 90, noNaN: true });
const lngArb = fc.double({ min: -180, max: 180, noNaN: true });
const pointArb = fc.record({ lat: latArb, lng: lngArb });

/** Smallest difference between two compass angles, in degrees (359.9 and 0.1 are 0.2 apart). */
function angleGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return Math.min(d, 360 - d);
}

describe("bearingDegrees", () => {
  it("always returns a value in [0, 360), for any two points", () => {
    fc.assert(
      fc.property(pointArb, pointArb, (a, b) => {
        const bearing = bearingDegrees(a, b);
        expect(Number.isFinite(bearing)).toBe(true);
        expect(bearing).toBeGreaterThanOrEqual(0);
        expect(bearing).toBeLessThan(360);
      }),
      RUNS,
    );
  });

  it("the bearing from A to A's exact eastward neighbour is about 90", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -80, max: 80, noNaN: true }),
        lngArb,
        fc.double({ min: 1e-5, max: 1e-3, noNaN: true }),
        (lat, lng, step) => {
          const east = { lat, lng: lng + step }; // same latitude, a little further east (may pass 180: sin/cos wrap)
          expect(Math.abs(bearingDegrees({ lat, lng }, east) - 90)).toBeLessThan(0.01);
        },
      ),
      RUNS,
    );
  });

  it("due west is about 270, due north about 0, due south about 180", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -70, max: 70, noNaN: true }),
        lngArb,
        fc.double({ min: 1e-5, max: 1e-3, noNaN: true }),
        (lat, lng, step) => {
          const from = { lat, lng };
          expect(Math.abs(bearingDegrees(from, { lat, lng: lng - step }) - 270)).toBeLessThan(0.01);
          expect(angleGap(bearingDegrees(from, { lat: lat + step, lng }), 0)).toBeLessThan(1e-6);
          expect(Math.abs(bearingDegrees(from, { lat: lat - step, lng }) - 180)).toBeLessThan(1e-6);
        },
      ),
      RUNS,
    );
  });

  it("is 0 when both points are the same (there is no direction)", () => {
    expect(bearingDegrees({ lat: 42.4, lng: -71.1 }, { lat: 42.4, lng: -71.1 })).toBe(0);
  });

  it("matches a known real pair: Alewife panorama to the Alewife Path South entrance", () => {
    // Values from tests/fixtures/streetview-metadata-ok.json and mbta-stop-alewife-entrances.json,
    // with the expected angle worked out separately in Python.
    const pano = { lat: 42.39582665961039, lng: -71.14120747526648 };
    const entrance = { lat: 42.395753, lng: -71.141256 };
    expect(bearingDegrees(pano, entrance)).toBeCloseTo(205.94, 1);
  });
});
