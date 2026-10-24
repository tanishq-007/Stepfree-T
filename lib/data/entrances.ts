import type { WheelchairBoarding } from "@/lib/types";
import type { LatLng } from "@/lib/engine/geo";
import { cached, primeCache } from "./cache";
import { fetchStationEntrances, fetchStop } from "./mbta-client";
import type { RawStop, RawStopWithChildren } from "./schemas";
import { wheelchairFromCode } from "./normalize";

/** A station entrance (MBTA location_type 2), as MBTA describes it. */
export interface Entrance {
  id: string;
  name: string;
  wheelchair: WheelchairBoarding;
  /** null when MBTA has no coordinates for it. */
  point: LatLng | null;
}

/** An entrance we are allowed to show: MBTA marks it accessible and gives its position. */
export interface AccessibleEntrance extends Entrance {
  wheelchair: "accessible";
  point: LatLng;
}

/** The most entrances shown for one station. Map labels are the digits 1 to 3. */
export const MAX_ENTRANCES = 3;
const ENTRANCE_LOCATION_TYPE = 2;
const ONE_HOUR_MS = 3_600_000;

function toEntrance(stop: RawStop): Entrance | null {
  if (stop.attributes.location_type !== ENTRANCE_LOCATION_TYPE) return null;
  const { latitude, longitude } = stop.attributes;
  return {
    id: stop.id,
    name: stop.attributes.name,
    wheelchair: wheelchairFromCode(stop.attributes.wheelchair_boarding),
    point: typeof latitude === "number" && typeof longitude === "number" ? { lat: latitude, lng: longitude } : null,
  };
}

/**
 * All entrances of a station, in MBTA's order: the order of the station's `child_stops` relationship.
 * (MBTA's `included` list is in a different order. If the relationship is missing we fall back to `included`.)
 */
export function normalizeEntrances(res: RawStopWithChildren): Entrance[] {
  const byId = new Map<string, Entrance>();
  for (const stop of res.included ?? []) {
    const entrance = toEntrance(stop);
    if (entrance) byId.set(entrance.id, entrance);
  }
  const order = res.data.relationships?.child_stops?.data?.map((c) => c.id) ?? [];
  const ordered: Entrance[] = [];
  for (const id of order) {
    const entrance = byId.get(id);
    if (entrance) {
      ordered.push(entrance);
      byId.delete(id);
    }
  }
  return [...ordered, ...byId.values()]; // anything not in the relationship keeps its `included` order, after the rest
}

/** True only for an entrance MBTA marks accessible (wheelchair_boarding = 1) that has coordinates. */
export function isAccessibleEntrance(e: Entrance): e is AccessibleEntrance {
  return e.wheelchair === "accessible" && e.point !== null;
}

/**
 * THE one filter between MBTA data and the rider. Keeps entrances marked accessible, in the order given,
 * and stops at `limit`. "No information" (0, null) is not accessible, even though GTFS lets an entrance
 * inherit its station's value: we would be guessing.
 */
export function accessibleEntrances(entrances: Entrance[], limit: number = MAX_ENTRANCES): AccessibleEntrance[] {
  return entrances.filter(isAccessibleEntrance).slice(0, limit);
}

/** Accessible entrances of a station (at most 3, MBTA order). Cached for an hour; also remembers each by id. */
export function getStationEntrances(stationId: string): Promise<AccessibleEntrance[]> {
  return cached(`mbta:entrances:${stationId}`, ONE_HOUR_MS, async () => {
    const all = normalizeEntrances(await fetchStationEntrances(stationId));
    for (const e of all) primeCache(`mbta:entrance:${e.id}`, ONE_HOUR_MS, e);
    return accessibleEntrances(all);
  });
}

/** One entrance by id, or null when the id is not an entrance. The caller must still check it is accessible. */
export function getEntrance(entranceId: string): Promise<Entrance | null> {
  return cached(`mbta:entrance:${entranceId}`, ONE_HOUR_MS, async () => toEntrance((await fetchStop(entranceId)).data));
}
