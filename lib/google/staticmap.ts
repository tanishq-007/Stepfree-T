import type { LatLng } from "@/lib/engine/geo";
import { googleFetch } from "./config";
import { requireImage } from "./streetview";

export const STATICMAP_URL = "https://maps.googleapis.com/maps/api/staticmap";
export const MAP_SIZE = "640x320";
export const MAP_SCALE = 2;
export const STATION_MARKER_COLOR = "blue";
export const ENTRANCE_MARKER_COLOR = "green";
export const STATION_MARKER_LABEL = "S";

export interface MapMarker {
  /** One uppercase letter or digit, the only labels the Maps Static API allows. */
  label: string;
  color: string;
  point: LatLng;
}

/**
 * Pure. One marker per entrance, labelled "1", "2", "3" in the same order as the list the rider reads, and a
 * differently coloured "S" marker for the station. The list and the map both number from this order.
 */
export function buildMapMarkers(station: LatLng, entrances: { point: LatLng }[]): MapMarker[] {
  return [
    { label: STATION_MARKER_LABEL, color: STATION_MARKER_COLOR, point: station },
    ...entrances.map((e, i) => ({ label: String(i + 1), color: ENTRANCE_MARKER_COLOR, point: e.point })),
  ];
}

/**
 * The Maps Static API URL. No center and no zoom, so Google fits the view to all the markers.
 * It contains the key: it must never leave the server.
 */
export function buildMapUrl(markers: MapMarker[], key: string): string {
  const url = new URL(STATICMAP_URL);
  url.searchParams.set("size", MAP_SIZE);
  url.searchParams.set("scale", String(MAP_SCALE));
  // Entrance markers first, the station last, so the station never hides a numbered pin.
  const ordered = [...markers.filter((m) => m.label !== STATION_MARKER_LABEL), ...markers.filter((m) => m.label === STATION_MARKER_LABEL)];
  for (const m of ordered) url.searchParams.append("markers", `color:${m.color}|label:${m.label}|${m.point.lat},${m.point.lng}`);
  url.searchParams.set("key", key);
  return url.toString();
}

/** Throws GoogleApiError unless Google answered with an image. */
export async function fetchStaticMap(markers: MapMarker[], key: string): Promise<Response> {
  return requireImage(await googleFetch(buildMapUrl(markers, key)), "Google Static Maps image");
}
