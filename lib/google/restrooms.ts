import type { Station } from "@/lib/types";
import { cached } from "@/lib/data/cache";
import { haversineKm, type LatLng } from "@/lib/engine/geo";
import { normalizeAccessibility } from "./accessibility";
import { assertGoogleOk, GoogleApiError, googleFetch, ONE_HOUR_MS } from "./config";
import { GooglePlaceSchema, NearbySearchResponseSchema, type GooglePlace } from "./schemas";
import type { RestroomPlace } from "./types";

export const PLACES_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";

/** Place types (Places API New, Table A) that often have a restroom the public can use. */
export const RESTROOM_PLACE_TYPES = ["library", "cafe", "restaurant", "shopping_mall", "transit_station"] as const;

/**
 * Only what we show. Billing: Google charges the highest tier among the fields. Everything here is the Pro tier
 * except `places.currentOpeningHours`, which is Enterprise. Remove that one entry to lower the price of each search.
 */
export const RESTROOM_FIELD_MASK = [
  "places.id",
  "places.displayName",
  "places.location",
  "places.accessibilityOptions",
  "places.currentOpeningHours.openNow",
  "places.googleMapsUri",
].join(",");

export const MAX_RADIUS_METERS = 800;
export const DEFAULT_RADIUS_METERS = 400;
export const MAX_PLACES = 5;
/** Nearby Search allows 1 to 20 results. We ask for the most it allows. */
const MAX_RESULTS = 20;

/** Google's own Maps link when it gave us one over https, else the documented Maps URL for a place id. */
function mapsUrlFor(place: GooglePlace, at: LatLng): string {
  const given = place.googleMapsUri;
  if (given) {
    try {
      if (new URL(given).protocol === "https:") return given;
    } catch {
      // fall through to the built link
    }
  }
  const query = new URLSearchParams({ api: "1", query: `${at.lat},${at.lng}`, query_place_id: place.id });
  return `https://www.google.com/maps/search/?${query.toString()}`;
}

/**
 * Pure. Keeps only places Google says have a wheelchair-accessible restroom (exactly `true`), drops places we
 * cannot locate or name, and sorts nearest first by straight-line distance from `origin`.
 */
export function toRestroomPlaces(places: GooglePlace[], origin: LatLng): RestroomPlace[] {
  const out: RestroomPlace[] = [];
  for (const place of places) {
    const access = normalizeAccessibility(place.accessibilityOptions);
    if (access.restroom !== "yes") continue;
    const name = place.displayName?.text.trim();
    if (!name || !place.location) continue;
    const at = { lat: place.location.latitude, lng: place.location.longitude };
    out.push({
      id: place.id,
      name,
      distanceMeters: Math.round(haversineKm(origin, at) * 1000),
      openNow: place.currentOpeningHours?.openNow ?? null,
      wheelchairRestroom: "yes",
      wheelchairEntrance: access.entrance,
      mapsUrl: mapsUrlFor(place, at),
    });
  }
  return out.sort((a, b) => a.distanceMeters - b.distanceMeters || a.id.localeCompare(b.id));
}

/** Parses each place on its own, so one odd place never discards the rest. */
export function parsePlaces(body: unknown): GooglePlace[] {
  const parsed = NearbySearchResponseSchema.safeParse(body);
  if (!parsed.success) return [];
  const out: GooglePlace[] = [];
  for (const raw of parsed.data.places ?? []) {
    const place = GooglePlaceSchema.safeParse(raw);
    if (place.success) out.push(place.data);
  }
  return out;
}

/** One Nearby Search (New) call. Throws GoogleApiError on any failure. */
export async function searchNearbyRestroomPlaces(origin: LatLng, key: string): Promise<GooglePlace[]> {
  const res = await googleFetch(PLACES_NEARBY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": RESTROOM_FIELD_MASK,
    },
    body: JSON.stringify({
      includedTypes: [...RESTROOM_PLACE_TYPES],
      maxResultCount: MAX_RESULTS,
      rankPreference: "DISTANCE",
      locationRestriction: {
        circle: { center: { latitude: origin.lat, longitude: origin.lng }, radius: MAX_RADIUS_METERS },
      },
    }),
  });
  await assertGoogleOk(res, "Google Places");
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new GoogleApiError("Google Places sent a body that is not JSON", res.status);
  }
  return parsePlaces(body);
}

export interface RestroomSearch {
  places: RestroomPlace[];
  fetchedAt: string;
}

/**
 * Restrooms for one station: one Google search per hour, always at the largest radius. The caller's radius only
 * filters this list, so the cost stays at one search per station per hour whatever radius riders ask for.
 */
export function getRestrooms(station: Station, key: string): Promise<RestroomSearch> {
  return cached(`google:restrooms:${station.id}`, ONE_HOUR_MS, async () => {
    const found = await searchNearbyRestroomPlaces({ lat: station.lat, lng: station.lng }, key);
    return { places: toRestroomPlaces(found, { lat: station.lat, lng: station.lng }), fetchedAt: new Date().toISOString() };
  });
}

/** Applies the rider's radius and the limit of 5 to a cached search. */
export function withinRadius(search: RestroomSearch, radiusMeters: number): RestroomPlace[] {
  return search.places.filter((p) => p.distanceMeters <= radiusMeters).slice(0, MAX_PLACES);
}
