import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import type { Alert, Facility, Station } from "@/lib/types";
import { clearCache } from "@/lib/data/cache";
import { createRateLimiter, explainAiLimiter } from "@/lib/api/rate-limit";
import type { PlanB } from "@/lib/engine/plan-b";
import type { UpcomingChange } from "@/lib/engine/later-today";
import { GET as health } from "@/app/api/health/route";
import { GET as stations } from "@/app/api/stations/route";
import { GET as alerts } from "@/app/api/alerts/route";
import { GET as facilities } from "@/app/api/facilities/route";
import { GET as status } from "@/app/api/status/route";
import { GET as alternatives } from "@/app/api/alternatives/route";
import { GET as demo } from "@/app/api/demo/route";
import { POST as explain } from "@/app/api/explain/route";

// All routes run against the committed REAL snapshot (FORCE_OFFLINE=1): deterministic, no network.
const get = (path: string) => new Request(`http://test.local${path}`);
const post = (body: unknown) =>
  new Request("http://test.local/api/explain", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "application/json" } });
// Union of every field the routes return. Tests only read fields that the route in question sets.
interface Body {
  ok: boolean;
  status: string;
  error: string;
  details: unknown;
  dataSource: string;
  fetchedAt: string;
  isStale: boolean;
  mbtaReachable: boolean;
  counts: { stations: number };
  stations: Station[];
  facilities: (Facility & { platformMapVerified: boolean | null })[];
  alternatives: Station[];
  alternative: Station;
  blockingAlerts: Alert[];
  infoAlerts: Alert[];
  trip: { origin: Station };
  explanations: { alertId: string; text: string }[];
  summary: string;
  usedAI: boolean;
  simulated: boolean;
  label: string;
  reasons: { code: string; message: string }[];
  planB: PlanB | null;
  laterToday: UpcomingChange[];
}
const json = async (res: Response): Promise<Body> => (await res.json()) as Body;

beforeEach(() => {
  clearCache();
  explainAiLimiter.reset();
  process.env.FORCE_OFFLINE = "1";
  delete process.env.ANTHROPIC_API_KEY;
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  delete process.env.FORCE_OFFLINE;
  delete process.env.ANTHROPIC_API_KEY;
});

describe("data routes (offline snapshot)", () => {
  it("/api/health reports the snapshot and counts", async () => {
    const body = await json(await health());
    expect(body).toMatchObject({ ok: true, mbtaReachable: false, dataSource: "snapshot" });
    expect(body.counts.stations).toBeGreaterThan(100);
    expect(typeof body.fetchedAt).toBe("string");
  });

  it("/api/stations lists stations sorted by name", async () => {
    const body = await json(await stations());
    const names = body.stations.map((s) => s.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    expect(body.stations.find((s) => s.id === "place-alfcl")).toMatchObject({ name: "Alewife", wheelchairBoarding: "accessible" });
  });

  it("/api/alerts and /api/facilities filter by station and 404 on unknown", async () => {
    const f = await json(await facilities(get("/api/facilities?stationId=place-alfcl")));
    expect(f.facilities.length).toBeGreaterThan(5);
    expect(f.facilities.every((x) => x.stationId === "place-alfcl")).toBe(true);
    const e813 = f.facilities.find((x) => x.id === "813");
    expect(e813).toMatchObject({ servesPlatforms: ["Platform"], platformMapVerified: true });
    expect((await alerts(get("/api/alerts?stationId=nope"))).status).toBe(404);
    expect((await alerts(get("/api/alerts"))).status).toBe(200);
  });

  // The committed snapshot is real but gets old. Move the clock one day past it so "stale" is deterministic.
  function ageSnapshotOneDay() {
    return vi.useFakeTimers({ toFake: ["Date"], now: new Date(Date.now() + 24 * 3_600_000) });
  }

  it("/api/status returns UNKNOWN + isStale for the old offline snapshot, labelled snapshot", async () => {
    ageSnapshotOneDay();
    const res = await status(get("/api/status?origin=place-alfcl&destination=place-pktrm&profile=wheelchair"));
    const body = await json(res);
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ status: "UNKNOWN", dataSource: "snapshot", isStale: true });
    expect(body.trip.origin.name).toBe("Alewife");
    // Stale data: no Plan B and no forecast.
    expect(body.planB).toBeNull();
    expect(body.laterToday).toEqual([]);
  });

  it("/api/alternatives returns [] for stale data and validates input", async () => {
    ageSnapshotOneDay();
    const body = await json(await alternatives(get("/api/alternatives?stationId=place-alfcl&profile=wheelchair")));
    expect(body).toMatchObject({ alternatives: [], isStale: true, dataSource: "snapshot" });
    expect((await alternatives(get("/api/alternatives?stationId=nope"))).status).toBe(404);
    expect((await alternatives(get("/api/alternatives"))).status).toBe(400);
  });
});

describe("input validation", () => {
  it("/api/status returns 400 {error, details} for bad input", async () => {
    for (const q of ["", "?origin=a&destination=b", "?origin=a&destination=b&profile=jetpack"]) {
      const res = await status(get(`/api/status${q}`));
      const body = await json(res);
      expect(res.status).toBe(400);
      expect(body.error).toBeTruthy();
      expect(body.details).toBeTruthy();
    }
  });

  it("/api/explain returns 400 for invalid JSON and wrong shapes", async () => {
    expect((await explain(post("{not json"))).status).toBe(400);
    const res = await explain(post({ profile: "wheelchair" }));
    expect(res.status).toBe(400);
    expect((await json(res)).details).toBeTruthy();
  });

  it("/api/demo returns 400 for an unknown scenario", async () => {
    expect((await demo(get("/api/demo?scenario=boom"))).status).toBe(400);
  });
});

describe("total data failure", () => {
  it("returns 502 (never crashes) when live and snapshot both fail", async () => {
    vi.spyOn(fs, "readFile").mockRejectedValue(new Error("ENOENT"));
    const res = await status(get("/api/status?origin=place-alfcl&destination=place-pktrm&profile=wheelchair"));
    const body = await json(res);
    expect(res.status).toBe(502);
    expect(body.status).toBe("UNKNOWN");
    expect(body.error).toBeTruthy();
    expect((await health()).status).toBe(502);
  });
});

describe("/api/demo (simulated)", () => {
  it("elevator-outage-alewife is red, labelled simulated, with a real alternative", async () => {
    const body = await json(await demo(get("/api/demo?scenario=elevator-outage-alewife")));
    expect(body).toMatchObject({ status: "NOT_STEP_FREE", dataSource: "demo", simulated: true, label: "Simulated demo data" });
    expect(body.blockingAlerts.map((a) => a.id).sort()).toEqual(["demo-elevator-813", "demo-elevator-961"]);
    expect(body.infoAlerts.map((a) => a.id)).toEqual(["demo-escalator-356"]);
    expect(body.alternative.id).toBe("place-davis");
  });

  it("all-clear is green and api-down is gray", async () => {
    expect((await json(await demo(get("/api/demo?scenario=all-clear")))).status).toBe("STEP_FREE");
    const down = await json(await demo(get("/api/demo?scenario=api-down")));
    expect(down).toMatchObject({ status: "UNKNOWN", isStale: true, dataSource: "demo", planB: null });
  });

  it("backup-elevator-alewife stays green and names the elevator to use", async () => {
    const body = await json(await demo(get("/api/demo?scenario=backup-elevator-alewife")));
    expect(body.status).toBe("STEP_FREE");
    const use = body.reasons.find((r) => r.code === "ELEVATOR_ALTERNATIVE_AVAILABLE");
    expect(use?.message).toContain("Use Alewife Elevator 961");
  });

  it("plan-b-davis shows Davis Elevator 816 as a single point of failure with Porter as Plan B", async () => {
    const body = await json(await demo(get("/api/demo?scenario=plan-b-davis")));
    expect(body.status).toBe("STEP_FREE");
    expect(body.trip.origin.name).toBe("Davis");
    expect(body.planB?.status).toBe("fragile");
    expect(body.planB?.elevators[0]).toMatchObject({ facilityId: "816", role: "no_backup" });
    expect(body.planB?.elevators[0]?.alternative?.name).toBe("Porter");
  });

  it("planned-outage is green now and warns about later today", async () => {
    const body = await json(await demo(get("/api/demo?scenario=planned-outage")));
    expect(body.status).toBe("STEP_FREE");
    expect(body.laterToday).toHaveLength(1);
    expect(body.laterToday[0]).toMatchObject({ status: "NOT_STEP_FREE", stationIds: ["place-alfcl"] });
  });
});

describe("rate limiting", () => {
  it("the limiter allows `limit` requests per key per window, then resets", () => {
    const limiter = createRateLimiter(2, 1000);
    expect([limiter.take("a", 0), limiter.take("a", 10), limiter.take("a", 20)]).toEqual([true, true, false]);
    expect(limiter.take("b", 20)).toBe(true);
    expect(limiter.take("a", 1000)).toBe(true);
  });

  it("/api/explain stops calling the AI after 10 requests a minute from one client, and still answers with templates", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const tripResult = await json(await demo(get("/api/demo?scenario=elevator-outage-alewife")));
    const ids = ["demo-elevator-813", "demo-elevator-961", "demo-escalator-356"];
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ summary: "Not step-free.", explanations: ids.map((alertId) => ({ alertId, text: "x" })) }) }] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const call = () =>
      explain(new Request("http://test.local/api/explain", { method: "POST", body: JSON.stringify({ tripResult, profile: "wheelchair" }), headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.7" } }));
    for (let i = 0; i < 10; i += 1) expect((await json(await call())).usedAI).toBe(true);
    const limited = await call();
    const body = await json(limited);
    expect(limited.status).toBe(200);
    expect(limited.headers.get("x-ai-rate-limited")).toBe("1");
    expect(body.usedAI).toBe(false);
    expect(body.explanations).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });
});

describe("/api/explain", () => {
  async function demoResult(): Promise<Body> {
    return json(await demo(get("/api/demo?scenario=elevator-outage-alewife")));
  }

  it("uses templates without a key and never claims accessibility", async () => {
    const tripResult = await demoResult();
    const body = await json(await explain(post({ tripResult, profile: "wheelchair" })));
    expect(body.usedAI).toBe(false);
    expect(body.explanations).toHaveLength(3);
    expect(body.summary).toContain("not step-free");
    expect(body.dataSource).toBe("demo");
  });

  function anthropicReply(payload: unknown) {
    return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(payload) }] }), { status: 200 });
  }

  it("uses the model when a key is set and the output validates", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const tripResult = await demoResult();
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body)) as { system: string; messages: { content: string }[] };
      expect(sent.system).toContain("grade 6");
      expect(sent.system).toContain("Never invent facts");
      expect((init?.headers as Record<string, string>)["x-api-key"]).toBe("test-key");
      return anthropicReply({
        summary: "Your trip is not step-free right now. Try Davis instead.",
        explanations: ["demo-elevator-813", "demo-elevator-961", "demo-escalator-356"].map((alertId) => ({ alertId, text: `Plain text for ${alertId}.` })),
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const body = await json(await explain(post({ tripResult, profile: "wheelchair" })));
    expect(body.usedAI).toBe(true);
    expect(body.explanations[0]?.text).toBe("Plain text for demo-elevator-813.");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["HTTP error", () => new Response("bad", { status: 401 })],
    ["non-JSON text", () => new Response(JSON.stringify({ content: [{ type: "text", text: "sorry, no" }] }), { status: 200 })],
    ["missing an alert", () => anthropicReply({ summary: "ok.", explanations: [{ alertId: "demo-elevator-813", text: "x" }] })],
    [
      "claims accessibility on a red result",
      () =>
        anthropicReply({
          summary: "Alewife is accessible and your trip is fine.",
          explanations: ["demo-elevator-813", "demo-elevator-961", "demo-escalator-356"].map((alertId) => ({ alertId, text: "ok" })),
        }),
    ],
  ])("falls back to templates when the model gives %s", async (_name, reply) => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => reply()));
    const body = await json(await explain(post({ tripResult: await demoResult(), profile: "stroller" })));
    expect(body.usedAI).toBe(false);
    expect(body.explanations).toHaveLength(3);
  });

  it("falls back when the request times out (8s)", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.useFakeTimers();
    vi.stubGlobal("fetch", (_u: string, init?: RequestInit) => new Promise<Response>((_res, rej) => init?.signal?.addEventListener("abort", () => rej(new Error("aborted")))));
    const tripResult = await demoResult();
    const pending = explain(post({ tripResult, profile: "wheelchair" }));
    await vi.advanceTimersByTimeAsync(8100);
    const body = await json(await pending);
    vi.useRealTimers();
    expect(body.usedAI).toBe(false);
  });

  it("falls back when fetch itself throws", async () => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const body = await json(await explain(post({ tripResult: await demoResult(), profile: "wheelchair" })));
    expect(body.usedAI).toBe(false);
  });
});
