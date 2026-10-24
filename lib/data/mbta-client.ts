import { z } from "zod";
import type { DataSnapshot } from "@/lib/types";
import {
  RawAlertsResponseSchema,
  RawFacilitiesResponseSchema,
  RawStopWithChildrenSchema,
  RawStopsResponseSchema,
  type RawAlertsResponse,
  type RawFacilitiesResponse,
  type RawStopWithChildren,
  type RawStopsResponse,
} from "./schemas";
import { buildSnapshot, type LineStops } from "./normalize";

export const MBTA_BASE = "https://api-v3.mbta.com";
export const REQUEST_TIMEOUT_MS = 5000;
const MAX_PAGES = 10;

export class MbtaError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown,
    /** A 4xx answer (rate limit, bad request) will not improve on retry. */
    readonly retryable: boolean = true,
  ) {
    super(message);
    this.name = "MbtaError";
  }
}

type Params = Record<string, string>;

function buildUrl(path: string, params: Params): string {
  const url = new URL(path, MBTA_BASE);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  return url.toString();
}

async function fetchOnce(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { accept: "application/vnd.api+json" };
    const key = process.env.MBTA_API_KEY;
    if (key) headers["x-api-key"] = key;
    const res = await fetch(url, { headers, signal: controller.signal, cache: "no-store" });
    if (!res.ok) throw new MbtaError(`MBTA responded ${res.status} for ${url}`, undefined, res.status >= 500);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** One request, one retry. Throws MbtaError if both attempts fail. */
async function fetchWithRetry(url: string): Promise<unknown> {
  try {
    return await fetchOnce(url);
  } catch (first) {
    if (first instanceof MbtaError && !first.retryable) throw first;
    try {
      return await fetchOnce(url);
    } catch (second) {
      const reason = second instanceof Error ? second.message : String(second);
      throw new MbtaError(`MBTA request failed after retry: ${reason}`, first);
    }
  }
}

async function get<S extends z.ZodTypeAny>(path: string, params: Params, schema: S): Promise<z.infer<S>> {
  const body = await fetchWithRetry(buildUrl(path, params));
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new MbtaError(`Unexpected MBTA response shape for ${path}: ${parsed.error.message}`);
  return parsed.data;
}

/** Follows JSON:API `links.next` so a paginated answer is never silently cut short. */
async function getAllPages<T extends { data: unknown[]; included?: unknown[]; links?: { next?: string } }>(
  path: string,
  params: Params,
  schema: z.ZodType<T>,
): Promise<T> {
  let page = await get(path, params, schema);
  const data = [...page.data];
  const included = [...(page.included ?? [])];
  for (let i = 0; i < MAX_PAGES && page.links?.next; i += 1) {
    const next = page.links.next;
    const raw = await fetchWithRetry(next);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new MbtaError(`Unexpected MBTA page shape: ${parsed.error.message}`);
    page = parsed.data;
    data.push(...page.data);
    included.push(...(page.included ?? []));
  }
  return { ...page, data, included } as T;
}

// Subway only: Red, Orange, Blue, Green (B/C/D/E) and Mattapan (route_type 0 and 1).
// NOTE: the MBTA API returns an empty list for `filter[route_type]=0,1&filter[location_type]=1` together,
// so stations come from per-line `filter[route]` queries, and platform->station links from route_type.
export const LINE_QUERIES: { line: string; routes: string }[] = [
  { line: "Red", routes: "Red" },
  { line: "Orange", routes: "Orange" },
  { line: "Blue", routes: "Blue" },
  { line: "Green", routes: "Green-B,Green-C,Green-D,Green-E" },
  { line: "Mattapan", routes: "Mattapan" },
];

export function fetchStationsForLine(routes: string): Promise<RawStopsResponse> {
  return getAllPages("/stops", { "filter[route]": routes, include: "parent_station" }, RawStopsResponseSchema);
}

export function fetchPlatforms(): Promise<RawStopsResponse> {
  return getAllPages("/stops", { "filter[route_type]": "0,1", include: "parent_station" }, RawStopsResponseSchema);
}

/**
 * One station with its child stops. Entrances are the children with location_type 2.
 * (A list query with `filter[location_type]=2` returns nothing, so we ask for the one station instead.)
 */
export function fetchStationEntrances(stationId: string): Promise<RawStopWithChildren> {
  return get(
    `/stops/${encodeURIComponent(stationId)}`,
    {
      include: "child_stops",
      "fields[stop]": "name,latitude,longitude,location_type,wheelchair_boarding",
    },
    RawStopWithChildrenSchema,
  );
}

/** One stop by id (used to check an entrance id the browser sent us). */
export function fetchStop(stopId: string): Promise<RawStopWithChildren> {
  return get(
    `/stops/${encodeURIComponent(stopId)}`,
    { "fields[stop]": "name,latitude,longitude,location_type,wheelchair_boarding" },
    RawStopWithChildrenSchema,
  );
}

export function fetchFacilities(): Promise<RawFacilitiesResponse> {
  return getAllPages(
    "/facilities",
    { "filter[type]": "ELEVATOR,ESCALATOR", include: "stop" },
    RawFacilitiesResponseSchema,
  );
}

export function fetchAlerts(): Promise<RawAlertsResponse> {
  return getAllPages(
    "/alerts",
    {
      "filter[route_type]": "0,1",
      "filter[activity]": "USING_WHEELCHAIR,USING_ESCALATOR,BOARD,EXIT,RIDE",
    },
    RawAlertsResponseSchema,
  );
}

/** Fetch everything from MBTA and normalize it. Throws MbtaError on any failure. */
export async function fetchLiveSnapshot(now: Date = new Date()): Promise<DataSnapshot> {
  try {
    const [lineResponses, platforms, facilities, alerts] = await Promise.all([
      Promise.all(
        LINE_QUERIES.map(async (q): Promise<LineStops> => ({ line: q.line, response: await fetchStationsForLine(q.routes) })),
      ),
      fetchPlatforms(),
      fetchFacilities(),
      fetchAlerts(),
    ]);
    return buildSnapshot({ lines: lineResponses, platforms, facilities, alerts, fetchedAt: now.toISOString(), source: "live" });
  } catch (err) {
    if (err instanceof MbtaError) throw err;
    throw new MbtaError(err instanceof Error ? err.message : "Unknown MBTA error", err);
  }
}
