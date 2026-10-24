// /api/restrooms, /api/entrances, /api/streetview/image and /api/entrance-map with MOCKED Google and MBTA answers.
// The mocks return the real responses saved in tests/fixtures. No test calls the network.
// The image bytes are a made-up JPEG header (a real picture is 70 KB and adds nothing to what is tested).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs, readFileSync } from "node:fs";
import path from "node:path";
import fc from "fast-check";
import { clearCache } from "@/lib/data/cache";
import { GET as restrooms } from "@/app/api/restrooms/route";
import { GET as entrances } from "@/app/api/entrances/route";
import { GET as entranceMap } from "@/app/api/entrance-map/route";
import { GET as streetviewImage } from "@/app/api/streetview/image/route";
import { RESTROOM_FIELD_MASK, RESTROOM_PLACE_TYPES } from "@/lib/google/restrooms";
import type { EntrancesResponse, RestroomsResponse } from "@/lib/google/types";

const fixture = (name: string): unknown => JSON.parse(readFileSync(path.join(__dirname, "..", "fixtures", name), "utf8"));
const placesFixture = fixture("places-nearby-alewife.json") as { places: unknown[] };
const placesEmpty = fixture("places-nearby-empty.json");
const placesInvalidKey = fixture("places-error-invalid-key.json");
const metaOk = fixture("streetview-metadata-ok.json");
const metaZero = fixture("streetview-metadata-zero-results.json");
const metaDenied = fixture("streetview-metadata-denied.json");
interface MbtaStopFx {
  data: { id: string; attributes: Record<string, unknown>; relationships?: Record<string, unknown> };
  included: { id: string; attributes: Record<string, unknown> }[];
}
const mbtaAlewife = fixture("mbta-stop-alewife-entrances.json") as MbtaStopFx;
const mbtaBackBay = fixture("mbta-stop-backbay-entrances.json");
const mbtaBowdoin = fixture("mbta-stop-bowdoin-entrances.json") as MbtaStopFx;
const mbtaDoorSteel = fixture("mbta-stop-door-alfcl-steel.json");
/** A single-stop answer (GET /stops/{id}) built from one stop of a real station answer. */
const singleStop = (stop: unknown) => ({ data: stop, jsonapi: { version: "1.0" } });
const MBTA_STOPS: Record<string, unknown> = {
  "place-alfcl": mbtaAlewife,
  "place-bbsta": mbtaBackBay,
  "place-bomnl": mbtaBowdoin,
  "door-alfcl-steel": mbtaDoorSteel,
  "door-bomnl-main": singleStop(mbtaBowdoin.included.find((x) => x.id === "door-bomnl-main")), // a real entrance MBTA marks NOT accessible
  "70061": singleStop(mbtaAlewife.included.find((x) => x.id === "70061")), // a real platform (location_type 0), not an entrance
};

// Alewife from the committed snapshot, so the expected coordinates are not typed in by hand.
const snapshot = JSON.parse(readFileSync(path.join(process.cwd(), "lib", "data", "snapshots", "mbta-snapshot.json"), "utf8")) as {
  stations: { id: string; lat: number; lng: number }[];
};
const ALEWIFE = snapshot.stations.find((s) => s.id === "place-alfcl")!;

const KEY = "TEST-GOOGLE-KEY-do-not-leak-7f3a91";
const JPEG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00]);
const get = (p: string) => new Request(`http://test.local${p}`);
const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=UTF-8" } });
const png = (): Response => new Response(PNG, { status: 200, headers: { "content-type": "image/png", "x-debug-key": KEY } });
const jpeg = (): Response => new Response(JPEG, { status: 200, headers: { "content-type": "image/jpeg", "x-debug-key": KEY } });

interface Call {
  url: URL;
  init: RequestInit | undefined;
}
interface Handlers {
  places?: (c: Call) => Response | Promise<Response>;
  metadata?: (c: Call) => Response | Promise<Response>;
  image?: (c: Call) => Response | Promise<Response>;
  map?: (c: Call) => Response | Promise<Response>;
  mbta?: (c: Call) => Response | Promise<Response>;
}

/** Replaces fetch. Anything that is not one of the four stubbed calls answers 500, so a stray live call cannot pass. */
function installFetch(handlers: Handlers = {}) {
  const calls = { places: [] as Call[], metadata: [] as Call[], image: [] as Call[], map: [] as Call[], mbta: [] as Call[], other: [] as Call[] };
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const call = { url, init };
    if (url.origin === "https://places.googleapis.com") {
      calls.places.push(call);
      return (handlers.places ?? (() => json(placesFixture)))(call);
    }
    if (url.origin === "https://maps.googleapis.com" && url.pathname === "/maps/api/streetview/metadata") {
      calls.metadata.push(call);
      return (handlers.metadata ?? (() => json(metaOk)))(call);
    }
    if (url.origin === "https://maps.googleapis.com" && url.pathname === "/maps/api/streetview") {
      calls.image.push(call);
      return (handlers.image ?? jpeg)(call);
    }
    if (url.origin === "https://maps.googleapis.com" && url.pathname === "/maps/api/staticmap") {
      calls.map.push(call);
      return (handlers.map ?? png)(call);
    }
    if (url.origin === "https://api-v3.mbta.com" && url.pathname.startsWith("/stops/")) {
      calls.mbta.push(call);
      const defaultMbta = (c: Call) => {
        const body = MBTA_STOPS[decodeURIComponent(c.url.pathname.replace("/stops/", ""))];
        return body ? json(body) : json({ errors: [{ status: "404" }] }, 404);
      };
      return (handlers.mbta ?? defaultMbta)(call);
    }
    calls.other.push(call);
    return new Response("not stubbed", { status: 500 });
  });
  vi.stubGlobal("fetch", fetchMock);
  return { calls, fetchMock };
}

/** Everything the browser would see, as text, plus the header lines. Call this BEFORE reading the body yourself. */
async function everythingSent(res: Response): Promise<string> {
  const body = Buffer.from(await res.clone().arrayBuffer()).toString("latin1");
  const headers: string[] = [];
  res.headers.forEach((value, name) => headers.push(`${name}: ${value}`));
  return `${headers.join("\n")}\n\n${body}`;
}

async function expectNoKeyAnywhere(res: Response): Promise<void> {
  const sent = await everythingSent(res);
  expect(sent).not.toContain(KEY);
  expect(sent).not.toMatch(/googleapis\.com/);
}

beforeEach(() => {
  clearCache();
  process.env.FORCE_OFFLINE = "1"; // station data comes from the committed snapshot, as in routes.test.ts
  process.env.GOOGLE_MAPS_API_KEY = KEY;
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.FORCE_OFFLINE;
  delete process.env.GOOGLE_MAPS_API_KEY;
});

describe("GET /api/restrooms", () => {
  it("returns the accessible-restroom places from the real Alewife answer, nearest first", async () => {
    installFetch();
    const res = await restrooms(get("/api/restrooms?stationId=place-alfcl"));
    const body = (await res.json()) as RestroomsResponse;
    expect(res.status).toBe(200);
    expect(body.stationId).toBe("place-alfcl");
    expect(body.source).toBe("google");
    expect(Date.parse(body.fetchedAt)).not.toBeNaN();
    // Worked out separately from the fixture: 6 places have wheelchairAccessibleRestroom === true, all within 400 m, so 5 are returned.
    expect(body.places.map((p) => p.name)).toEqual([
      "Alewife",
      "Craft Food Halls - Cambridge",
      "Summer Shack",
      "Top Mix Bar & Kitchen Cambridge",
      "Mothership Event Space",
    ]);
    expect(body.places.map((p) => p.distanceMeters)).toEqual([15, 179, 233, 266, 373]); // meters, from an independent calculation
    expect(body.places.map((p) => p.openNow)).toEqual([null, true, true, true, null]);
    for (const p of body.places) {
      expect(p.wheelchairRestroom).toBe("yes");
      expect(p.wheelchairEntrance).toBe("yes");
      expect(p.mapsUrl.startsWith("https://maps.google.com/")).toBe(true);
    }
  });

  it("applies the rider's radius to the cached list, and one Google search serves every radius", async () => {
    const { calls } = installFetch();
    const near = (await (await restrooms(get("/api/restrooms?stationId=place-alfcl&radius=200"))).json()) as RestroomsResponse;
    expect(near.places.map((p) => p.name)).toEqual(["Alewife", "Craft Food Halls - Cambridge"]); // 15 m and 179 m
    const wide = (await (await restrooms(get("/api/restrooms?stationId=place-alfcl&radius=800"))).json()) as RestroomsResponse;
    expect(wide.places).toHaveLength(5); // 6 qualify, 5 is the limit
    const tiny = (await (await restrooms(get("/api/restrooms?stationId=place-alfcl&radius=10"))).json()) as RestroomsResponse;
    expect(tiny.places).toEqual([]); // nothing within 10 m
    expect(calls.places).toHaveLength(1);
  });

  it("reports a closed place as openNow:false and a place with no hours as null", async () => {
    // Drop the nearest place so the 6th (Revival Cafe, closed in the real answer) fits inside the limit of 5.
    const places = placesFixture.places.filter((p) => (p as { id: string }).id !== "ChIJGbIk1wd344kR1I_Sb_OWIZs");
    installFetch({ places: () => json({ places }) });
    const body = (await (await restrooms(get("/api/restrooms?stationId=place-alfcl"))).json()) as RestroomsResponse;
    expect(body.places.at(-1)).toMatchObject({ name: "Revival Cafe+Kitchen", openNow: false });
    expect(body.places.find((p) => p.name === "Mothership Event Space")?.openNow).toBeNull();
  });

  it("calls Places API (New) the documented way: POST, key and field mask headers, types, 800 m circle on the station", async () => {
    const { calls } = installFetch();
    await restrooms(get("/api/restrooms?stationId=place-alfcl&radius=100"));
    expect(calls.places).toHaveLength(1);
    const call = calls.places[0]!;
    expect(call.url.toString()).toBe("https://places.googleapis.com/v1/places:searchNearby");
    expect(call.init?.method).toBe("POST");
    const headers = call.init?.headers as Record<string, string>;
    expect(headers["X-Goog-Api-Key"]).toBe(KEY);
    expect(headers["X-Goog-FieldMask"]).toBe(RESTROOM_FIELD_MASK);
    // Exactly the six fields from the brief and nothing else.
    expect(RESTROOM_FIELD_MASK.split(",")).toEqual([
      "places.id",
      "places.displayName",
      "places.location",
      "places.accessibilityOptions",
      "places.currentOpeningHours.openNow",
      "places.googleMapsUri",
    ]);
    const sent = JSON.parse(String(call.init?.body)) as Record<string, unknown>;
    expect(sent.includedTypes).toEqual(["library", "cafe", "restaurant", "shopping_mall", "transit_station"]);
    expect(sent.includedTypes).toEqual([...RESTROOM_PLACE_TYPES]);
    expect(sent.maxResultCount).toBe(20);
    expect(sent.rankPreference).toBe("DISTANCE");
    expect(sent.locationRestriction).toEqual({
      circle: { center: { latitude: ALEWIFE.lat, longitude: ALEWIFE.lng }, radius: 800 }, // 800 whatever radius the rider asked for
    });
    expect(call.url.search).toBe(""); // the key goes in a header, never in the URL
  });

  it("takes the location from our station data, not from the request", async () => {
    const { calls } = installFetch();
    await restrooms(get("/api/restrooms?stationId=place-alfcl&lat=1&lng=2&latitude=3"));
    const sent = JSON.parse(String(calls.places[0]!.init?.body)) as { locationRestriction: { circle: { center: unknown } } };
    expect(sent.locationRestriction.circle.center).toEqual({ latitude: ALEWIFE.lat, longitude: ALEWIFE.lng });
  });

  it("answers with an empty list when Google finds nothing (the answer is just {})", async () => {
    installFetch({ places: () => json(placesEmpty) });
    const res = await restrooms(get("/api/restrooms?stationId=place-alfcl"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ stationId: "place-alfcl", places: [], source: "google" });
  });

  it("answers with an empty list when places exist but none is reported to have an accessible restroom", async () => {
    const none = { places: placesFixture.places.map((p) => ({ ...(p as object), accessibilityOptions: { wheelchairAccessibleRestroom: false } })) };
    installFetch({ places: () => json(none) });
    expect(((await (await restrooms(get("/api/restrooms?stationId=place-alfcl"))).json()) as RestroomsResponse).places).toEqual([]);
  });

  it.each([
    ["Google says the key is invalid (400)", () => json(placesInvalidKey, 400)],
    ["Google says no permission (403)", () => json({ error: { code: 403, status: "PERMISSION_DENIED" } }, 403)],
    ["Google is down (500, not JSON)", () => new Response("<html>oops</html>", { status: 500 })],
    ["Google answers 200 with a body that is not JSON", () => new Response("not json", { status: 200 })],
  ])("returns 502 {error} when %s, with fixed text", async (_name, reply) => {
    installFetch({ places: reply });
    const res = await restrooms(get("/api/restrooms?stationId=place-alfcl"));
    await expectNoKeyAnywhere(res);
    expect(res.status).toBe(502);
    const body = (await res.json()) as { error: string };
    expect(body.error).toBe("Google Maps is not available right now. Try again in a few minutes.");
  });

  it("returns 502 and never repeats a network error that contains the key", async () => {
    installFetch({
      places: () => {
        throw new TypeError(`fetch failed: https://places.googleapis.com/v1/places:searchNearby?key=${KEY}`);
      },
    });
    const res = await restrooms(get("/api/restrooms?stationId=place-alfcl"));
    expect(res.status).toBe(502);
    await expectNoKeyAnywhere(res);
    // The operator's log line is ours, with no key either.
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(KEY);
  });

  it("hides the feature without a key: 200 {enabled:false}, and no Google or MBTA call at all", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const { fetchMock } = installFetch();
    const res = await restrooms(get("/api/restrooms?stationId=place-alfcl"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a blank key as missing", async () => {
    process.env.GOOGLE_MAPS_API_KEY = "   ";
    const { fetchMock } = installFetch();
    expect(await (await restrooms(get("/api/restrooms?stationId=place-alfcl"))).json()).toEqual({ enabled: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ["no stationId", ""],
    ["empty stationId", "?stationId="],
    ["radius 0", "?stationId=place-alfcl&radius=0"],
    ["radius over 800", "?stationId=place-alfcl&radius=801"],
    ["negative radius", "?stationId=place-alfcl&radius=-5"],
    ["radius that is not a number", "?stationId=place-alfcl&radius=abc"],
    ["radius with decimals", "?stationId=place-alfcl&radius=12.5"],
    ["empty radius", "?stationId=place-alfcl&radius="],
    ["a very long stationId", `?stationId=${"a".repeat(65)}`],
  ])("returns 400 {error, details} for bad input: %s", async (_name, query) => {
    const { fetchMock } = installFetch();
    const res = await restrooms(get(`/api/restrooms${query}`));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details: unknown };
    expect(body.error).toBe("Invalid request");
    expect(body.details).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts the largest radius (800) and the smallest (1)", async () => {
    installFetch();
    expect((await restrooms(get("/api/restrooms?stationId=place-alfcl&radius=800"))).status).toBe(200);
    expect((await restrooms(get("/api/restrooms?stationId=place-alfcl&radius=1"))).status).toBe(200);
  });

  it("returns 404 for a station we do not know and never asks Google", async () => {
    const { calls } = installFetch();
    expect((await restrooms(get("/api/restrooms?stationId=place-nowhere"))).status).toBe(404);
    expect(calls.places).toHaveLength(0);
  });

  it("caches a station's answer for one hour, then asks Google again", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-10-24T12:00:00Z") });
    const { calls } = installFetch();
    await restrooms(get("/api/restrooms?stationId=place-alfcl"));
    vi.setSystemTime(new Date("2026-10-24T12:59:00Z"));
    await restrooms(get("/api/restrooms?stationId=place-alfcl&radius=300"));
    expect(calls.places).toHaveLength(1);
    vi.setSystemTime(new Date("2026-10-24T13:01:00Z"));
    await restrooms(get("/api/restrooms?stationId=place-alfcl"));
    expect(calls.places).toHaveLength(2);
  });

  it("does not cache a failure", async () => {
    let n = 0;
    const { calls } = installFetch({ places: () => (++n === 1 ? new Response("down", { status: 503 }) : json(placesFixture)) });
    expect((await restrooms(get("/api/restrooms?stationId=place-alfcl"))).status).toBe(502);
    expect((await restrooms(get("/api/restrooms?stationId=place-alfcl"))).status).toBe(200);
    expect(calls.places).toHaveLength(2);
  });

  it("property: never returns a place whose wheelchairRestroom is not 'yes'", async () => {
    const optionValue = fc.oneof(fc.boolean(), fc.constant(undefined), fc.constantFrom("true", 1, null, "yes"));
    const rawPlace = fc.record({
      id: fc.uuid(),
      name: fc.constantFrom("Cafe", "Library", "Mall", "Diner"),
      dLat: fc.double({ min: -0.007, max: 0.007, noNaN: true }),
      dLng: fc.double({ min: -0.007, max: 0.007, noNaN: true }),
      shape: fc.constantFrom("full", "no-options", "empty-options", "no-location", "no-name"),
      restroom: optionValue,
      entrance: optionValue,
      openNow: fc.constantFrom(true, false, undefined),
    });
    await fc.assert(
      fc.asyncProperty(fc.array(rawPlace, { maxLength: 25 }), fc.integer({ min: 1, max: 800 }), async (rawPlaces, radius) => {
        clearCache();
        const places = rawPlaces.map((p) => ({
          id: p.id,
          ...(p.shape === "no-name" ? {} : { displayName: { text: p.name, languageCode: "en" } }),
          ...(p.shape === "no-location" ? {} : { location: { latitude: ALEWIFE.lat + p.dLat, longitude: ALEWIFE.lng + p.dLng } }),
          googleMapsUri: `https://maps.google.com/?cid=${p.id}`,
          ...(p.openNow === undefined ? {} : { currentOpeningHours: { openNow: p.openNow } }),
          ...(p.shape === "no-options"
            ? {}
            : p.shape === "empty-options"
              ? { accessibilityOptions: {} }
              : { accessibilityOptions: { ...(p.restroom === undefined ? {} : { wheelchairAccessibleRestroom: p.restroom }), ...(p.entrance === undefined ? {} : { wheelchairAccessibleEntrance: p.entrance }) } }),
        }));
        installFetch({ places: () => json({ places }) });
        const res = await restrooms(get(`/api/restrooms?stationId=place-alfcl&radius=${radius}`));
        expect(res.status).toBe(200);
        const body = (await res.json()) as RestroomsResponse;
        const reallyAccessible = new Set(rawPlaces.filter((p) => p.shape === "full" && p.restroom === true).map((p) => p.id));
        expect(body.places.length).toBeLessThanOrEqual(5);
        for (const p of body.places) {
          expect(p.wheelchairRestroom).toBe("yes");
          expect(reallyAccessible.has(p.id)).toBe(true);
          expect(p.distanceMeters).toBeLessThanOrEqual(radius);
          expect(["yes", "no", "unknown"]).toContain(p.wheelchairEntrance);
        }
        for (let i = 1; i < body.places.length; i += 1) {
          expect(body.places[i]!.distanceMeters).toBeGreaterThanOrEqual(body.places[i - 1]!.distanceMeters);
        }
      }),
      { numRuns: 60 },
    );
  });
});


const ALEWIFE_FIRST_THREE = ["door-alfcl-alewife", "door-alfcl-alewifes", "door-alfcl-cambridgepark"];
const BAD_ID_MESSAGE = "Google Maps is not available right now. Try again in a few minutes.";

describe("GET /api/entrances", () => {
  it("returns the first three accessible entrances in MBTA order, with MBTA's names and positions", async () => {
    const { calls } = installFetch();
    const res = await entrances(get("/api/entrances?stationId=place-alfcl"));
    await expectNoKeyAnywhere(res);
    expect(res.status).toBe(200);
    const body = (await res.json()) as EntrancesResponse;
    expect(body.stationId).toBe("place-alfcl");
    expect(body.stationName).toBe("Alewife");
    expect(body.entrances.map((e) => e.id)).toEqual(ALEWIFE_FIRST_THREE);
    expect(body.entrances.map((e) => e.name)).toEqual(["Alewife Path East", "Alewife Path South", "Cambridgepark Dr, Alewife Brook Pkwy"]);
    expect(body.entrances.map((e) => [e.lat, e.lng])).toEqual([
      [42.395862, -71.140929],
      [42.395753, -71.141256],
      [42.394893, -71.141516],
    ]);
    for (const e of body.entrances) {
      expect(e.mapUrl).toBe("/api/entrance-map?stationId=place-alfcl");
      expect(e.googleMapsLink).toBe(`https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lng}`);
      expect(e.photo).toMatchObject({ available: true, captureDate: "2020-07", copyright: "© RoadTrip NewEngland" });
      expect(e.photo?.imageUrl).toBe(`/api/streetview/image?entranceId=${e.id}`);
    }
    // MBTA: one call for the station, asking for its children.
    expect(calls.mbta).toHaveLength(1);
    expect(calls.mbta[0]!.url.pathname).toBe("/stops/place-alfcl");
    expect(calls.mbta[0]!.url.searchParams.get("include")).toBe("child_stops");
    // Street View metadata: one call per entrance, outdoor only, key in the URL (the endpoint has no header option).
    expect(calls.metadata.map((c) => c.url.searchParams.get("location"))).toEqual(["42.395862,-71.140929", "42.395753,-71.141256", "42.394893,-71.141516"]);
    for (const c of calls.metadata) {
      expect(c.url.searchParams.get("source")).toBe("outdoor");
      expect(c.url.searchParams.get("key")).toBe(KEY);
    }
  });

  it("Back Bay: skips the entrances MBTA does not mark accessible, keeps MBTA's order, stops at three", async () => {
    installFetch();
    const body = (await (await entrances(get("/api/entrances?stationId=place-bbsta"))).json()) as EntrancesResponse;
    expect(body.stationName).toBe("Back Bay");
    expect(body.entrances.map((e) => e.id)).toEqual(["door-bbsta-buswayn", "door-bbsta-busways", "door-bbsta-dartmn"]);
    // Four of the ten are not accessible; none of them may appear, and neither may the accessible ones after the third.
    const shown = JSON.stringify(body);
    for (const id of ["door-bbsta-clarcolum", "door-bbsta-clarendon1", "door-bbsta-clarendon2", "door-bbsta-dartmw", "door-bbsta-underpass", "door-bbsta-dartms", "door-bbsta-garage"]) {
      expect(shown).not.toContain(id);
    }
  });

  it("returns an empty list, and asks Google for nothing, when no entrance is marked accessible", async () => {
    const { calls } = installFetch();
    const res = await entrances(get("/api/entrances?stationId=place-bomnl"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ stationId: "place-bomnl", stationName: "Bowdoin", entrances: [] });
    expect(calls.metadata).toHaveLength(0);
  });

  it("returns an empty list for a station where MBTA lists no entrances at all", async () => {
    const noDoors = { ...mbtaAlewife, included: [] };
    installFetch({ mbta: () => json(noDoors) });
    expect(((await (await entrances(get("/api/entrances?stationId=place-alfcl"))).json()) as EntrancesResponse).entrances).toEqual([]);
  });

  it("says 'no photo' for one entrance when Street View has none there, and still shows the others", async () => {
    installFetch({ metadata: (c) => (c.url.searchParams.get("location") === "42.395753,-71.141256" ? json(metaZero) : json(metaOk)) });
    const body = (await (await entrances(get("/api/entrances?stationId=place-alfcl"))).json()) as EntrancesResponse;
    expect(body.entrances.map((e) => e.photo?.available)).toEqual([true, false, true]);
    expect(body.entrances[1]!.photo).toEqual({ available: false, captureDate: null, copyright: null, imageUrl: null });
    expect(body.entrances[1]!.name).toBe("Alewife Path South"); // the entrance is still listed, with its Google Maps link
    expect(body.entrances[1]!.googleMapsLink).toContain("query=42.395753,-71.141256");
  });

  it.each([
    ["Google cannot be reached (the error names the key)", () => { throw new TypeError(`fetch failed: https://maps.googleapis.com/maps/api/streetview/metadata?key=${KEY}`); }],
    ["Google answers 500", () => new Response("oops", { status: 500 })],
    ["Google answers 200 with something that is not JSON", () => new Response("<html>", { status: 200 })],
  ])("keeps the entrances and says photo:null when %s, with no key in the answer", async (_name, metadata) => {
    installFetch({ metadata });
    const res = await entrances(get("/api/entrances?stationId=place-alfcl"));
    await expectNoKeyAnywhere(res);
    expect(res.status).toBe(200);
    const body = (await res.json()) as EntrancesResponse;
    expect(body.entrances.map((e) => e.id)).toEqual(ALEWIFE_FIRST_THREE);
    expect(body.entrances.every((e) => e.photo === null)).toBe(true);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(KEY);
  });

  it("treats a refused key (REQUEST_DENIED) as 'no photo', and does not remember it", async () => {
    let n = 0;
    const { calls } = installFetch({ metadata: () => (++n <= 3 ? json(metaDenied) : json(metaOk)) });
    const first = (await (await entrances(get("/api/entrances?stationId=place-alfcl"))).json()) as EntrancesResponse;
    expect(first.entrances.every((e) => e.photo?.available === false)).toBe(true);
    clearCache(); // a new hour would do the same; here it only drops the entrance list so the photos are asked for again
    const second = (await (await entrances(get("/api/entrances?stationId=place-alfcl"))).json()) as EntrancesResponse;
    expect(second.entrances.every((e) => e.photo?.available === true)).toBe(true);
    expect(calls.metadata).toHaveLength(6);
  });

  it("without a Google key: still returns names and Google Maps links, with photo:null and mapUrl:null, and calls only MBTA", async () => {
    delete process.env.GOOGLE_MAPS_API_KEY;
    const { calls, fetchMock } = installFetch();
    const res = await entrances(get("/api/entrances?stationId=place-alfcl"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as EntrancesResponse;
    expect(body.entrances.map((e) => e.name)).toEqual(["Alewife Path East", "Alewife Path South", "Cambridgepark Dr, Alewife Brook Pkwy"]);
    for (const e of body.entrances) {
      expect(e.photo).toBeNull();
      expect(e.mapUrl).toBeNull();
      expect(e.googleMapsLink).toMatch(/^https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=42\./);
    }
    expect(calls.metadata).toHaveLength(0);
    expect(calls.places).toHaveLength(0);
    expect(fetchMock.mock.calls.every(([u]) => new URL(String(u)).origin === "https://api-v3.mbta.com")).toBe(true);
  });

  it("returns 502 with fixed text when MBTA cannot give the entrances", async () => {
    installFetch({ mbta: () => new Response("down", { status: 503 }) });
    const res = await entrances(get("/api/entrances?stationId=place-alfcl"));
    expect(res.status).toBe(502);
    expect(((await res.json()) as { error: string }).error).toContain("MBTA");
  });

  it.each([
    ["no stationId", ""],
    ["empty stationId", "?stationId="],
    ["a very long stationId", `?stationId=${"a".repeat(65)}`],
  ])("returns 400 {error, details} for bad input: %s", async (_name, query) => {
    const { fetchMock } = installFetch();
    const res = await entrances(get(`/api/entrances${query}`));
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string; details: unknown };
    expect(body.error).toBe("Invalid request");
    expect(body.details).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns 404 for a station we do not know", async () => {
    const { fetchMock } = installFetch();
    expect((await entrances(get("/api/entrances?stationId=place-nowhere"))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("property: never returns an entrance that MBTA does not mark accessible, never more than 3, always in MBTA order", async () => {
    const wheelchair = fc.constantFrom<number | null | undefined>(0, 1, 2, null, undefined);
    const stopArb = fc.record({
      locationType: fc.constantFrom(0, 2, 2, 2, 3),
      wheelchair,
      hasCoords: fc.boolean(),
      dLat: fc.double({ min: -0.003, max: 0.003, noNaN: true }),
      dLng: fc.double({ min: -0.003, max: 0.003, noNaN: true }),
    });
    await fc.assert(
      fc.asyncProperty(fc.array(stopArb, { maxLength: 14 }), fc.boolean(), async (stops, withKey) => {
        clearCache();
        if (withKey) process.env.GOOGLE_MAPS_API_KEY = KEY;
        else delete process.env.GOOGLE_MAPS_API_KEY;
        const children = stops.map((st, i) => ({
          id: `stop-${i}`,
          type: "stop",
          attributes: {
            name: `Door ${i}`,
            location_type: st.locationType,
            ...(st.wheelchair === undefined ? {} : { wheelchair_boarding: st.wheelchair }),
            ...(st.hasCoords ? { latitude: ALEWIFE.lat + st.dLat, longitude: ALEWIFE.lng + st.dLng } : { latitude: null, longitude: null }),
          },
          relationships: {},
        }));
        const reversed = [...children].reverse(); // `included` in a different order than the relationship
        const answer = {
          data: { id: "place-alfcl", type: "stop", attributes: { name: "Alewife", location_type: 1 }, relationships: { child_stops: { data: children.map((c) => ({ id: c.id, type: "stop" })) } } },
          included: reversed,
        };
        installFetch({ mbta: () => json(answer) });
        const res = await entrances(get("/api/entrances?stationId=place-alfcl"));
        expect(res.status).toBe(200);
        const body = (await res.json()) as EntrancesResponse;
        const qualifying = stops
          .map((st, i) => ({ st, id: `stop-${i}` }))
          .filter(({ st }) => st.locationType === 2 && st.wheelchair === 1 && st.hasCoords)
          .map(({ id }) => id);
        expect(body.entrances.map((e) => e.id)).toEqual(qualifying.slice(0, 3)); // exactly the accessible ones, MBTA order, max 3
        for (const e of body.entrances) expect(qualifying).toContain(e.id);
      }),
      { numRuns: 60 },
    );
  });

  it("property: the map's pin labels and the list's numbers match in count and order", async () => {
    const doorArb = fc.record({ accessible: fc.boolean(), dLat: fc.double({ min: -0.003, max: 0.003, noNaN: true }), dLng: fc.double({ min: -0.003, max: 0.003, noNaN: true }) });
    await fc.assert(
      fc.asyncProperty(fc.array(doorArb, { maxLength: 8 }), async (doors) => {
        clearCache();
        const children = doors.map((d, i) => ({
          id: `door-${i}`,
          type: "stop",
          attributes: { name: `Door ${i}`, location_type: 2, wheelchair_boarding: d.accessible ? 1 : 2, latitude: ALEWIFE.lat + d.dLat, longitude: ALEWIFE.lng + d.dLng },
          relationships: {},
        }));
        const answer = {
          data: { id: "place-alfcl", type: "stop", attributes: { name: "Alewife", location_type: 1 }, relationships: { child_stops: { data: children.map((c) => ({ id: c.id, type: "stop" })) } } },
          included: children,
        };
        const { calls } = installFetch({ mbta: () => json(answer) });
        const list = (await (await entrances(get("/api/entrances?stationId=place-alfcl"))).json()) as EntrancesResponse;
        const map = await entranceMap(get("/api/entrance-map?stationId=place-alfcl"));
        if (list.entrances.length === 0) {
          expect(map.status).toBe(404); // no accessible entrance, no map
          expect(calls.map).toHaveLength(0);
          return;
        }
        expect(map.status).toBe(200);
        const markers = calls.map[0]!.url.searchParams.getAll("markers").map((m) => {
          const [color, label, point] = m.split("|");
          return { color, label, point };
        });
        const pins = markers.filter((m) => m.label !== "label:S");
        // Same count, labels 1..n in order, and each pin sits on the entrance with that number.
        expect(pins.map((m) => m.label)).toEqual(list.entrances.map((_, i) => `label:${i + 1}`));
        expect(pins.map((m) => m.point)).toEqual(list.entrances.map((e) => `${e.lat},${e.lng}`));
        expect(markers.filter((m) => m.label === "label:S")).toHaveLength(1); // exactly one station marker
      }),
      { numRuns: 40 },
    );
  });
});

describe("GET /api/streetview/image?entranceId=", () => {
  it("streams the picture for an accessible entrance, with a one-hour cache header and none of Google's headers", async () => {
    const { calls } = installFetch();
    const res = await streetviewImage(get("/api/streetview/image?entranceId=door-alfcl-steel"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(Array.from(new Uint8Array(await res.clone().arrayBuffer()))).toEqual(Array.from(JPEG));
    expect(res.headers.get("x-debug-key")).toBeNull(); // Google's response carried the key in a header: it must not be passed on
    await expectNoKeyAnywhere(res);

    // MBTA is asked about the id first; the picture is only fetched because MBTA says it is an accessible entrance.
    expect(calls.mbta.map((c) => c.url.pathname)).toEqual(["/stops/door-alfcl-steel"]);
    expect(calls.image).toHaveLength(1);
    const url = calls.image[0]!.url;
    expect(url.origin + url.pathname).toBe("https://maps.googleapis.com/maps/api/streetview");
    expect(url.searchParams.get("size")).toBe("640x400");
    expect(url.searchParams.get("fov")).toBe("80");
    expect(url.searchParams.get("pitch")).toBe("0");
    expect(url.searchParams.get("source")).toBe("outdoor");
    expect(url.searchParams.get("return_error_code")).toBe("true");
    expect(url.searchParams.get("location")).toBe("42.395504,-71.142506");
    expect(Number(url.searchParams.get("heading"))).toBeCloseTo(251.4, 2); // bearing from the real panorama to the entrance, worked out separately
    expect(url.searchParams.get("key")).toBe(KEY);
  });

  it("uses the entrance list's answer from MBTA instead of asking again", async () => {
    const { calls } = installFetch();
    await entrances(get("/api/entrances?stationId=place-alfcl"));
    const res = await streetviewImage(get("/api/streetview/image?entranceId=door-alfcl-alewifes"));
    expect(res.status).toBe(200);
    expect(calls.mbta.map((c) => c.url.pathname)).toEqual(["/stops/place-alfcl"]); // no second MBTA call
    expect(Number(calls.image[0]!.url.searchParams.get("heading"))).toBeCloseTo(205.94, 2);
  });

  it("refuses an entrance that MBTA does not mark accessible, and a stop that is not an entrance, without asking Google", async () => {
    const { calls } = installFetch();
    for (const id of ["door-bomnl-main", "70061"]) {
      const res = await streetviewImage(get(`/api/streetview/image?entranceId=${id}`));
      expect(res.status, id).toBe(404);
      expect(await res.json()).toEqual({ available: false });
    }
    expect(calls.metadata).toHaveLength(0);
    expect(calls.image).toHaveLength(0);
  });

  it("returns 404 for an id MBTA does not know, and 502 when MBTA is down", async () => {
    installFetch();
    expect((await streetviewImage(get("/api/streetview/image?entranceId=door-nowhere"))).status).toBe(404);
    clearCache();
    installFetch({ mbta: () => new Response("down", { status: 503 }) });
    const res = await streetviewImage(get("/api/streetview/image?entranceId=door-alfcl-steel"));
    expect(res.status).toBe(502);
  });

  it("returns 404 {available:false} when Street View has no picture there, without asking for a picture", async () => {
    const { calls } = installFetch({ metadata: () => json(metaZero) });
    const res = await streetviewImage(get("/api/streetview/image?entranceId=door-alfcl-steel"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ available: false });
    expect(calls.image).toHaveLength(0);
  });

  it.each([
    ["Google has no picture (404)", () => new Response("none", { status: 404, headers: { "content-type": "text/html" } })],
    ["Google refuses the key (403)", () => new Response("The Google Maps Platform server rejected your request.", { status: 403 })],
    ["Google answers 200 but not with an image", () => new Response("<html>hi</html>", { status: 200, headers: { "content-type": "text/html" } })],
  ])("returns 502 when %s", async (_name, reply) => {
    installFetch({ image: reply });
    const res = await streetviewImage(get("/api/streetview/image?entranceId=door-alfcl-steel"));
    await expectNoKeyAnywhere(res);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: BAD_ID_MESSAGE });
  });

  it("never writes the picture to disk", async () => {
    const write = vi.spyOn(fs, "writeFile");
    const append = vi.spyOn(fs, "appendFile");
    installFetch();
    await (await streetviewImage(get("/api/streetview/image?entranceId=door-alfcl-steel"))).arrayBuffer();
    expect(write).not.toHaveBeenCalled();
    expect(append).not.toHaveBeenCalled();
  });

  it("returns 404 without a key (and calls nothing), and 400 for bad input", async () => {
    const { fetchMock } = installFetch();
    for (const q of ["", "?entranceId=", "?entranceId=../etc/passwd", "?entranceId=a%20b", "?entranceId=a%3Fb%3Dc", `?entranceId=${"a".repeat(101)}`]) {
      const res = await streetviewImage(get(`/api/streetview/image${q}`));
      expect(res.status, q).toBe(400);
      expect(((await res.json()) as { error: string }).error).toBe("Invalid request");
    }
    expect(fetchMock).not.toHaveBeenCalled();
    delete process.env.GOOGLE_MAPS_API_KEY;
    const res = await streetviewImage(get("/api/streetview/image?entranceId=door-alfcl-steel"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ available: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/entrance-map?stationId=", () => {
  it("streams a map with one numbered marker per accessible entrance, in list order, and a differently coloured station marker", async () => {
    const { calls } = installFetch();
    const res = await entranceMap(get("/api/entrance-map?stationId=place-alfcl"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    expect(res.headers.get("x-debug-key")).toBeNull();
    await expectNoKeyAnywhere(res);

    expect(calls.map).toHaveLength(1);
    const url = calls.map[0]!.url;
    expect(url.origin + url.pathname).toBe("https://maps.googleapis.com/maps/api/staticmap");
    expect(url.searchParams.get("size")).toBe("640x320");
    expect(url.searchParams.get("scale")).toBe("2");
    expect(url.searchParams.get("key")).toBe(KEY);
    // No centre, zoom or visible: Google fits the view to all the markers.
    for (const p of ["center", "zoom", "visible"]) expect(url.searchParams.has(p)).toBe(false);
    expect(url.searchParams.getAll("markers")).toEqual([
      "color:green|label:1|42.395862,-71.140929",
      "color:green|label:2|42.395753,-71.141256",
      "color:green|label:3|42.394893,-71.141516",
      `color:blue|label:S|${ALEWIFE.lat},${ALEWIFE.lng}`,
    ]);
    // The same entrances, in the same order, as the list.
    expect(calls.mbta).toHaveLength(1);
  });

  it("returns 404 and calls Google for nothing when no entrance is marked accessible (never a map of a station area)", async () => {
    const { calls } = installFetch();
    const res = await entranceMap(get("/api/entrance-map?stationId=place-bomnl"));
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ available: false });
    expect(calls.map).toHaveLength(0);
  });

  it.each([
    ["Google refuses the key (403)", () => new Response(`rejected ${KEY}`, { status: 403 })],
    ["Google answers 200 but not with an image", () => new Response("<html>", { status: 200, headers: { "content-type": "text/html" } })],
    ["the network fails with the key in the message", () => { throw new Error(`failed ${KEY}`); }],
  ])("returns 502 with fixed text when %s", async (_name, map) => {
    installFetch({ map });
    const res = await entranceMap(get("/api/entrance-map?stationId=place-alfcl"));
    await expectNoKeyAnywhere(res);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: BAD_ID_MESSAGE });
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(KEY);
  });

  it("returns 404 without a key (and calls nothing), 400 for bad input, 404 for an unknown station", async () => {
    const { fetchMock } = installFetch();
    for (const q of ["", "?stationId=", `?stationId=${"a".repeat(65)}`]) expect((await entranceMap(get(`/api/entrance-map${q}`))).status).toBe(400);
    expect((await entranceMap(get("/api/entrance-map?stationId=place-nowhere"))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
    delete process.env.GOOGLE_MAPS_API_KEY;
    expect((await entranceMap(get("/api/entrance-map?stationId=place-alfcl"))).status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("the Google key never reaches the browser", () => {
  it("is in no body and no header of any route, in any outcome", async () => {
    const throwing = () => {
      throw new Error(`failed ${KEY}`);
    };
    const outcomes: [string, Handlers][] = [
      ["success", {}],
      ["empty", { places: () => json(placesEmpty), metadata: () => json(metaZero) }],
      ["Google 403", { places: () => json({ error: { status: "PERMISSION_DENIED", message: `key ${KEY} denied` } }, 403), metadata: () => json({ status: "REQUEST_DENIED", error_message: `bad key ${KEY}` }), image: () => new Response(`rejected ${KEY}`, { status: 403 }), map: () => new Response(`rejected ${KEY}`, { status: 403 }) }],
      ["Google 500 with the key in the body", { places: () => new Response(KEY, { status: 500 }), metadata: () => new Response(KEY, { status: 500 }), image: () => new Response(KEY, { status: 500 }), map: () => new Response(KEY, { status: 500 }) }],
      ["network error that names the key", { places: throwing, metadata: throwing, image: throwing, map: throwing }],
    ];
    for (const [name, handlers] of outcomes) {
      clearCache();
      installFetch(handlers);
      for (const url of [
        "/api/restrooms?stationId=place-alfcl",
        "/api/entrances?stationId=place-alfcl",
        "/api/entrances?stationId=place-bomnl",
        "/api/streetview/image?entranceId=door-alfcl-steel",
        "/api/entrance-map?stationId=place-alfcl",
        "/api/restrooms?stationId=place-nowhere",
        "/api/entrances?stationId=",
        "/api/streetview/image?entranceId=",
      ]) {
        const handler = url.startsWith("/api/restrooms") ? restrooms : url.startsWith("/api/entrances") ? entrances : url.startsWith("/api/entrance-map") ? entranceMap : streetviewImage;
        const sent = await everythingSent(await handler(get(url)));
        expect(sent, `${name}: ${url}`).not.toContain(KEY);
      }
    }
  });

  it("is not in the browser code: client files import only the types file, never a file that reads the key", () => {
    const clientFiles = ["components/RestroomCard.tsx", "components/AccessibleEntranceCard.tsx", "lib/client/use-remote.ts", "lib/client/format.ts"];
    for (const file of clientFiles) {
      const text = readFileSync(path.join(process.cwd(), file), "utf8");
      expect(text, file).not.toMatch(/GOOGLE_MAPS_API_KEY/);
      expect(text, file).not.toMatch(/from "@\/lib\/google\/(config|restrooms|streetview|staticmap|schemas)"/);
      expect(text, file).not.toMatch(/from "@\/lib\/data\/(entrances|mbta-client)"/); // server code, which imports fetch helpers and the key reader
    }
  });
});
