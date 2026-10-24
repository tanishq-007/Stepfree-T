// Network geometry adapter, tested against a REAL trimmed MBTA /route_patterns response.
import { describe, expect, it, vi } from "vitest";
import fixture from "../fixtures/route-patterns-red-blue.json";
import { decodePolyline } from "@/lib/data/polyline";
import { drawablePatterns, fetchLiveNetwork, normalizeNetwork, readNetworkFile, RawNetworkResponseSchema } from "@/lib/data/network";

const raw = RawNetworkResponseSchema.parse(fixture);

describe("decodePolyline", () => {
  it("decodes the Google reference example (lng, lat order)", () => {
    // From the Google polyline algorithm documentation.
    expect(decodePolyline("_p~iF~ps|U_ulLnnqC_mqNvxq`@")).toEqual([
      [-120.2, 38.5],
      [-120.95, 40.7],
      [-126.453, 43.252],
    ]);
  });

  it("rejects malformed input instead of drawing a wrong line", () => {
    expect(() => decodePolyline("_p~iF~ps|")).toThrow();
    expect(() => decodePolyline("\u0001")).toThrow();
  });
});

describe("normalizeNetwork (real MBTA fixture)", () => {
  const net = normalizeNetwork(raw, "2026-10-24T19:00:00Z", "live");
  const red = net.patterns.find((p) => p.routeId === "Red");
  const blue = net.patterns.find((p) => p.routeId === "Blue");

  it("keeps one pattern per canonical route pattern with real geometry", () => {
    expect(net.patterns.map((p) => p.id).sort()).toEqual(["Blue-6-0", "Red-3-0"]);
    expect(red?.coordinates.length).toBeGreaterThan(100);
  });

  it("folds platform stops into parent stations, in stop order", () => {
    expect(red?.stationIds[0]).toBe("place-alfcl");
    expect(red?.stationIds.at(-1)).toBe("place-brntn");
    expect(red?.stationIds).toContain("place-pktrm");
    expect(red?.stationIds.every((id) => id.startsWith("place-"))).toBe(true);
    expect(blue?.stationIds[0]).toBe("place-wondl");
  });

  it("starts the Red shape at Alewife and ends at Braintree (within ~300 m)", () => {
    const [lng0, lat0] = red?.coordinates[0] ?? [0, 0];
    const [lngN, latN] = red?.coordinates.at(-1) ?? [0, 0];
    expect(Math.abs(lat0 - 42.3961)).toBeLessThan(0.003);
    expect(Math.abs(lng0 - -71.1407)).toBeLessThan(0.003);
    expect(Math.abs(latN - 42.2074)).toBeLessThan(0.003);
    expect(Math.abs(lngN - -71.0016)).toBeLessThan(0.003);
  });

  it("maps Green branches to the single line used by Station.lines", () => {
    const g = normalizeNetwork({ ...raw, data: raw.data.map((p) => ({ ...p, relationships: { ...p.relationships, route: { data: { id: "Green-B", type: "route" } } } })) }, "x", "live");
    expect(g.patterns.every((p) => p.line === "Green")).toBe(true);
  });

  it("skips a pattern whose shape is missing rather than inventing geometry", () => {
    const noShapes = { ...raw, included: (raw.included ?? []).filter((i) => i.type !== "shape") };
    expect(normalizeNetwork(noShapes, "x", "live").patterns).toEqual([]);
  });

  it("drawablePatterns keeps direction 0 only", () => {
    expect(drawablePatterns(net).every((p) => p.directionId === 0)).toBe(true);
  });
});

describe("network fetch and committed copy", () => {
  it("fetchLiveNetwork sends one canonical request and labels the result live", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 }));
    const net = await fetchLiveNetwork(new Date("2026-10-24T19:00:00Z"), fetchMock as unknown as typeof fetch);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = decodeURIComponent(String((fetchMock.mock.calls[0] as unknown[])[0]));
    expect(url).toContain("filter[canonical]=true");
    expect(url).toContain("include=representative_trip.shape,representative_trip.stops");
    expect(net.source).toBe("live");
  });

  it("throws on an MBTA error so the caller falls back to the committed copy", async () => {
    const fetchMock = vi.fn(async () => new Response("rate limited", { status: 429 }));
    await expect(fetchLiveNetwork(new Date(), fetchMock as unknown as typeof fetch)).rejects.toThrow();
  });

  it("the committed copy covers every subway line and is labelled snapshot", async () => {
    const net = await readNetworkFile();
    expect(net.source).toBe("snapshot");
    expect(new Set(net.patterns.map((p) => p.line))).toEqual(new Set(["Red", "Orange", "Blue", "Green", "Mattapan"]));
  });
});
