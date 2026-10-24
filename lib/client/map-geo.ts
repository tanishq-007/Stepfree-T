// Pure geometry helpers for the map. No routing: we only cut a piece out of an OFFICIAL MBTA shape,
// and only for a direct (single-line) trip where one pattern contains both stations.
import type { RouteRelationship } from "@/lib/engine/journey";

export type LngLat = [number, number];

export interface GeoLine {
  id: string;
  line: string;
  coordinates: LngLat[];
  stationIds: string[];
}

export interface GeoStation {
  id: string;
  lat: number;
  lng: number;
}

/** Squared distance in a local equirectangular frame (good enough to find the nearest vertex in Boston). */
function d2(a: LngLat, lng: number, lat: number): number {
  const k = Math.cos((lat * Math.PI) / 180);
  const dx = (a[0] - lng) * k;
  const dy = a[1] - lat;
  return dx * dx + dy * dy;
}

export function nearestIndex(coords: readonly LngLat[], s: GeoStation): number {
  let best = -1;
  let bestD = Infinity;
  coords.forEach((c, i) => {
    const d = d2(c, s.lng, s.lat);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  });
  return best;
}

/** ~400 m in degrees of latitude: a station further than this from the shape is not on it. */
const MAX_SNAP_DEG = 0.0036;

/**
 * The part of the official line geometry between origin and destination, for a DIRECT trip only.
 * Returns null for transfers or unknown connections, or when the stations do not sit on the shape.
 */
export function tripSegment(
  lines: readonly GeoLine[],
  journey: RouteRelationship | undefined,
  origin: GeoStation | null | undefined,
  destination: GeoStation | null | undefined,
): { line: string; coordinates: LngLat[] } | null {
  if (!journey || journey.kind !== "direct" || !origin || !destination) return null;
  const candidates = lines.filter((l) => journey.lines.includes(l.line) && l.stationIds.includes(origin.id) && l.stationIds.includes(destination.id));
  for (const l of candidates) {
    const a = nearestIndex(l.coordinates, origin);
    const b = nearestIndex(l.coordinates, destination);
    if (a < 0 || b < 0 || a === b) continue;
    const pa = l.coordinates[a];
    const pb = l.coordinates[b];
    if (!pa || !pb) continue;
    if (Math.sqrt(d2(pa, origin.lng, origin.lat)) > MAX_SNAP_DEG || Math.sqrt(d2(pb, destination.lng, destination.lat)) > MAX_SNAP_DEG) continue;
    const [lo, hi] = a < b ? [a, b] : [b, a];
    return { line: l.line, coordinates: l.coordinates.slice(lo, hi + 1) };
  }
  return null;
}

/** Lines to emphasise: the trip's line for a direct trip, both ends' lines for a transfer, none if unknown. */
export function emphasisedLines(journey: RouteRelationship | undefined): string[] {
  if (!journey) return [];
  if (journey.kind === "direct") return journey.lines;
  if (journey.kind === "transfer") return [...new Set([...journey.originLines, ...journey.destinationLines])];
  return [];
}

export function boundsOf(points: readonly (GeoStation | null | undefined)[]): [LngLat, LngLat] | null {
  const ps = points.filter((p): p is GeoStation => Boolean(p));
  if (ps.length === 0) return null;
  const lngs = ps.map((p) => p.lng);
  const lats = ps.map((p) => p.lat);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}
