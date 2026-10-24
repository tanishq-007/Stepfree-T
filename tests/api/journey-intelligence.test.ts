// Spec 05 route behaviour: additive journey fields, demo isolation (I5), and the grounded explainer.
import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCache } from "@/lib/data/cache";
import { buildDemoSnapshot } from "@/lib/data/demo-snapshot";
import { GET as status } from "@/app/api/status/route";
import { GET as demo } from "@/app/api/demo/route";
import { GET as network } from "@/app/api/network/route";
import { POST as explain } from "@/app/api/explain/route";
import { DEMO_SCENARIOS, DEMO_TRIP_LABEL } from "@/lib/client/types";

const get = (path: string) => new Request(`http://test.local${path}`);
const post = (body: unknown) => new Request("http://test.local/api/explain", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Json = any;
const json = async (res: Response): Promise<Json> => res.json();

beforeEach(() => {
  clearCache();
  process.env.FORCE_OFFLINE = "1";
  delete process.env.ANTHROPIC_API_KEY;
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  delete process.env.FORCE_OFFLINE;
  delete process.env.ANTHROPIC_API_KEY;
});

const SCENARIOS = DEMO_SCENARIOS;

describe("/api/network", () => {
  it("serves the committed MBTA geometry offline, labelled as reference snapshot data", async () => {
    const res = await network();
    const body = await json(res);
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ kind: "reference", dataSource: "snapshot" });
    expect(body.note).toContain("not a verified itinerary");
    expect(body.lines.length).toBeGreaterThanOrEqual(9);
    expect(typeof body.fetchedAt).toBe("string");
  });
});

describe("/api/status additive fields", () => {
  it("keeps the TripResult contract and adds journey, display, stations, profiles", async () => {
    const body = await json(await status(get("/api/status?origin=place-alfcl&destination=place-pktrm&profile=wheelchair")));
    for (const k of ["status", "reasons", "blockingAlerts", "infoAlerts", "alternative", "dataSource", "fetchedAt", "isStale", "trip"]) expect(body).toHaveProperty(k);
    expect(body.journey).toEqual({ kind: "direct", lines: ["Red"] });
    expect(body.stations.length).toBeGreaterThan(100);
    expect(body.profiles.map((p: Json) => p.profile)).toEqual(["wheelchair", "stroller", "no_stairs"]);
    expect(body.coverage.checked).toBe("endpoints-only");
  });

  it("names the transfer station for a two-line trip", async () => {
    const body = await json(await status(get("/api/status?origin=place-alfcl&destination=place-ogmnl&profile=wheelchair")));
    expect(body.journey.kind).toBe("transfer");
    expect(body.journey.transferStations.map((s: Json) => s.name)).toContain("Downtown Crossing");
    expect(body.display.status).not.toBe("STEP_FREE");
  });

  it("a real-data response is never labelled demo, and the stale snapshot makes every marker gray", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date(Date.now() + 24 * 3_600_000) });
    const body = await json(await status(get("/api/status?origin=place-alfcl&destination=place-pktrm&profile=wheelchair")));
    expect(body.dataSource).toBe("snapshot");
    expect(body.simulated).toBeUndefined();
    expect(body.stations.every((s: Json) => s.status === "UNKNOWN")).toBe(true);
  });
});

describe("/api/demo isolation (I5)", () => {
  it("every scenario and profile is labelled simulated, and markers are only demo stations", async () => {
    const demoIds = new Set(buildDemoSnapshot("all-clear", new Date()).stations.map((s) => s.id));
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...SCENARIOS), fc.constantFrom("wheelchair", "stroller", "no_stairs"), async (scenario, profile) => {
        const body = await json(await demo(get(`/api/demo?scenario=${scenario}&profile=${profile}`)));
        expect(body).toMatchObject({ dataSource: "demo", simulated: true, label: "Simulated demo data", scenario });
        expect(body.trip.profile).toBe(profile);
        expect(body.stations.every((s: Json) => demoIds.has(s.id))).toBe(true);
      }),
      { numRuns: 18 },
    );
  });

  it("the client's per-scenario trip label names the trip the route actually simulates", async () => {
    for (const scenario of SCENARIOS) {
      const body = await json(await demo(get(`/api/demo?scenario=${scenario}`)));
      expect(`${body.trip.origin.name} to ${body.trip.destination.name}`).toBe(DEMO_TRIP_LABEL[scenario]);
    }
  });

  it("every scenario carries Plan B, later-today and journey fields together", async () => {
    for (const scenario of SCENARIOS) {
      const body = await json(await demo(get(`/api/demo?scenario=${scenario}`)));
      expect(body).toHaveProperty("planB");
      expect(Array.isArray(body.laterToday)).toBe(true);
      expect(body.journey.kind).toBe("direct");
      // Plan B exists exactly when the engine says step-free now (never next to a current alternative).
      expect(body.planB !== null).toBe(body.status === "STEP_FREE");
      if (body.planB) expect(body.alternative).toBeNull();
    }
  });

  it("the outage scenario turns Alewife red on the map and keeps Davis as the alternative", async () => {
    const body = await json(await demo(get("/api/demo?scenario=elevator-outage-alewife")));
    expect(body.stations.find((s: Json) => s.id === "place-alfcl").status).toBe("NOT_STEP_FREE");
    expect(body.stations.find((s: Json) => s.id === "place-davis").status).toBe("STEP_FREE");
    expect(body.alternative.id).toBe("place-davis");
  });

  it("profile is optional (old clients still work) and validated", async () => {
    expect((await json(await demo(get("/api/demo?scenario=all-clear")))).trip.profile).toBe("wheelchair");
    expect((await demo(get("/api/demo?scenario=all-clear&profile=jetpack"))).status).toBe(400);
  });
});

describe("/api/explain guide (Understand your journey)", () => {
  const ctx = { originName: "Alewife", destinationName: "Park Street", route: "direct", stationNames: ["Alewife", "Davis", "Porter", "Harvard", "Park Street"] };
  async function outage() {
    return json(await demo(get("/api/demo?scenario=elevator-outage-alewife")));
  }

  it("templates answer all three questions with only data-backed next steps", async () => {
    const body = await json(await explain(post({ tripResult: await outage(), profile: "wheelchair", context: ctx })));
    expect(body.usedAI).toBe(false);
    expect(body.guide.source).toBe("template");
    expect(body.guide.whatHappened).toContain("Alewife Elevator");
    expect(body.guide.whyItMatters).toMatch(/^With a wheelchair/);
    expect(body.guide.nextSteps.map((s: Json) => s.id)).toEqual(["use-alternative", "read-notice", "ask-staff"]);
    expect(body.guide.nextSteps[0].text).toContain("Davis");
  });

  it("a green result gets only 'recheck before leaving' (no invented actions)", async () => {
    const green = await json(await demo(get("/api/demo?scenario=all-clear")));
    const body = await json(await explain(post({ tripResult: green, profile: "wheelchair" })));
    expect(body.guide.nextSteps.map((s: Json) => s.id)).toEqual(["recheck-before-leaving"]);
  });

  function stubModel(payload: unknown) {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(payload) }] }), { status: 200 })));
  }
  const ALERTS = ["demo-elevator-813", "demo-elevator-961", "demo-escalator-356"];
  const good = (guide: Json) => ({
    summary: "Your trip is not step-free right now. Try Davis instead.",
    explanations: ALERTS.map((alertId) => ({ alertId, text: `Plain text for ${alertId}.` })),
    guide,
  });
  const steps = [
    { id: "use-alternative", text: "Go to Davis instead." },
    { id: "read-notice", text: "Read the MBTA notice." },
    { id: "ask-staff", text: "Ask staff." },
  ];

  it("accepts an AI guide that rewords the same steps, and labels it ai", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    stubModel(good({ whatHappened: "Two Alewife elevators are out.", whyItMatters: "You need an elevator to reach the train.", nextSteps: steps }));
    const body = await json(await explain(post({ tripResult: await outage(), profile: "wheelchair", context: ctx })));
    expect(body.usedAI).toBe(true);
    expect(body.guide.source).toBe("ai");
    expect(body.guide.nextSteps.map((s: Json) => s.id)).toEqual(["use-alternative", "read-notice", "ask-staff"]);
  });

  it.each([
    ["adds a next step", { whatHappened: "x", whyItMatters: "y", nextSteps: [...steps, { id: "refresh", text: "Refresh." }] }],
    ["drops a next step", { whatHappened: "x", whyItMatters: "y", nextSteps: steps.slice(0, 2) }],
    ["names a station the engine did not return", { whatHappened: "Elevators are out.", whyItMatters: "y", nextSteps: [{ id: "use-alternative", text: "Go to Harvard instead." }, ...steps.slice(1)] }],
    ["claims accessibility on a red result", { whatHappened: "Alewife is accessible.", whyItMatters: "y", nextSteps: steps }],
  ])("falls back to templates when the AI guide %s", async (_name, guide) => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    stubModel(good(guide));
    const body = await json(await explain(post({ tripResult: await outage(), profile: "wheelchair", context: ctx })));
    expect(body.usedAI).toBe(false);
    expect(body.guide.source).toBe("template");
  });

  it("rejects AI that contradicts a verified STEP_FREE result", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    stubModel({ summary: "This trip is not step-free.", explanations: [], guide: { whatHappened: "x", whyItMatters: "y", nextSteps: [{ id: "recheck-before-leaving", text: "Check again." }] } });
    const green = await json(await demo(get("/api/demo?scenario=all-clear")));
    expect((await json(await explain(post({ tripResult: green, profile: "wheelchair" })))).usedAI).toBe(false);
  });
});
