// MBTA subway NETWORK geometry and stop order, from canonical /route_patterns.
// This is reference data (scheduled patterns), not live accessibility data and not a verified itinerary.
// One request returns every canonical subway pattern with its representative trip's shape and stops.
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { cached } from "./cache";
import { MBTA_BASE, REQUEST_TIMEOUT_MS } from "./mbta-client";
import { decodePolyline, type LngLat } from "./polyline";
import { lineLabel } from "./normalize";

export const NETWORK_ROUTES = ["Red", "Orange", "Blue", "Green-B", "Green-C", "Green-D", "Green-E", "Mattapan"];
export const NETWORK_TTL_MS = 24 * 60 * 60 * 1000;
export const NETWORK_FILE = path.join(process.cwd(), "lib", "data", "snapshots", "mbta-network.json");

// ---------- Raw MBTA schema (lenient, written from a real response) ----------

const ref = z.object({ id: z.string(), type: z.string() }).passthrough();
const one = z.object({ data: ref.nullable().optional() }).passthrough();
const many = z.object({ data: z.array(ref).optional() }).passthrough();

const RawPatternSchema = z
  .object({
    id: z.string(),
    type: z.literal("route_pattern"),
    attributes: z
      .object({ name: z.string().optional(), direction_id: z.number().optional(), canonical: z.boolean().optional() })
      .passthrough(),
    relationships: z.object({ route: one, representative_trip: one }).passthrough(),
  })
  .passthrough();

const RawIncludedSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    attributes: z.record(z.unknown()).optional(),
    relationships: z.object({ shape: one.optional(), stops: many.optional(), parent_station: one.optional() }).passthrough().optional(),
  })
  .passthrough();

export const RawNetworkResponseSchema = z
  .object({ data: z.array(RawPatternSchema), included: z.array(RawIncludedSchema).optional() })
  .passthrough();
export type RawNetworkResponse = z.infer<typeof RawNetworkResponseSchema>;

// ---------- Normalized shape (what the app uses) ----------

export interface NetworkPattern {
  id: string;
  routeId: string; // "Green-B"
  line: string; // "Green" (matches Station.lines)
  name: string; // "Alewife - Braintree"
  directionId: number;
  /** [lng, lat] points of the official shape. */
  coordinates: LngLat[];
  /** Parent station ids in stop order. */
  stationIds: string[];
}

export interface Network {
  patterns: NetworkPattern[];
  fetchedAt: string;
  source: "live" | "snapshot";
}

const NetworkSchema = z.object({
  patterns: z.array(
    z.object({
      id: z.string(),
      routeId: z.string(),
      line: z.string(),
      name: z.string(),
      directionId: z.number(),
      coordinates: z.array(z.tuple([z.number(), z.number()])),
      stationIds: z.array(z.string()),
    }),
  ),
  fetchedAt: z.string(),
  source: z.enum(["live", "snapshot"]),
});

/** Keep 1 decimal place more than needed at city zoom: 5 dp (~1 m). Halves the committed file size. */
const round = (n: number) => Math.round(n * 1e5) / 1e5;

export function normalizeNetwork(raw: RawNetworkResponse, fetchedAt: string, source: Network["source"]): Network {
  const included = new Map((raw.included ?? []).map((i) => [`${i.type}:${i.id}`, i] as const));
  const parentOf = (stopId: string): string => {
    const stop = included.get(`stop:${stopId}`);
    return stop?.relationships?.parent_station?.data?.id ?? stopId;
  };

  const patterns: NetworkPattern[] = [];
  for (const p of raw.data) {
    if (p.attributes.canonical === false) continue;
    const routeId = p.relationships.route.data?.id;
    const tripId = p.relationships.representative_trip.data?.id;
    if (!routeId || !tripId) continue;
    const trip = included.get(`trip:${tripId}`);
    const shapeId = trip?.relationships?.shape?.data?.id;
    const polyline = shapeId ? included.get(`shape:${shapeId}`)?.attributes?.polyline : undefined;
    if (typeof polyline !== "string") continue; // no geometry: skip rather than invent

    const stationIds: string[] = [];
    for (const s of trip?.relationships?.stops?.data ?? []) {
      const parent = parentOf(s.id);
      if (stationIds[stationIds.length - 1] !== parent) stationIds.push(parent);
    }
    patterns.push({
      id: p.id,
      routeId,
      line: lineLabel(routeId),
      name: p.attributes.name ?? p.id,
      directionId: p.attributes.direction_id ?? 0,
      coordinates: decodePolyline(polyline).map(([lng, lat]) => [round(lng), round(lat)] as LngLat),
      stationIds,
    });
  }
  patterns.sort((a, b) => a.id.localeCompare(b.id));
  return { patterns, fetchedAt, source };
}

/** One pattern per route+direction 0 is enough to draw a line (the reverse is the same track). */
export function drawablePatterns(network: Network): NetworkPattern[] {
  return network.patterns.filter((p) => p.directionId === 0);
}

// ---------- Fetch, cache, offline copy ----------

export function networkUrl(): string {
  const url = new URL("/route_patterns", MBTA_BASE);
  url.searchParams.set("filter[route]", NETWORK_ROUTES.join(","));
  url.searchParams.set("filter[canonical]", "true");
  url.searchParams.set("include", "representative_trip.shape,representative_trip.stops");
  return url.toString();
}

export async function fetchLiveNetwork(now: Date = new Date(), fetchImpl: typeof fetch = fetch): Promise<Network> {
  const controller = new AbortController();
  // The network payload is ~200 KB: allow longer than the 5 s alert/facility timeout.
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS * 3);
  try {
    const headers: Record<string, string> = { accept: "application/vnd.api+json" };
    if (process.env.MBTA_API_KEY) headers["x-api-key"] = process.env.MBTA_API_KEY;
    const res = await fetchImpl(networkUrl(), { headers, signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`MBTA responded ${res.status} for /route_patterns`);
    const parsed = RawNetworkResponseSchema.parse(await res.json());
    const network = normalizeNetwork(parsed, now.toISOString(), "live");
    if (network.patterns.length === 0) throw new Error("MBTA returned no subway route patterns");
    return network;
  } finally {
    clearTimeout(timer);
  }
}

export async function readNetworkFile(): Promise<Network> {
  const parsed = NetworkSchema.parse(JSON.parse(await fs.readFile(NETWORK_FILE, "utf8")));
  return { ...parsed, source: "snapshot" };
}

export async function writeNetworkFile(network: Network): Promise<boolean> {
  try {
    await fs.writeFile(NETWORK_FILE, `${JSON.stringify({ ...network, source: "snapshot" })}\n`, "utf8");
    return true;
  } catch {
    return false;
  }
}

/** Live (cached 24 h) -> committed copy -> null. Never throws: the map degrades, the verdict does not. */
export async function getNetwork(): Promise<Network | null> {
  try {
    if (process.env.FORCE_OFFLINE === "1") throw new Error("FORCE_OFFLINE=1");
    return await cached("mbta:network", NETWORK_TTL_MS, () => fetchLiveNetwork());
  } catch {
    try {
      return await readNetworkFile();
    } catch {
      return null;
    }
  }
}
