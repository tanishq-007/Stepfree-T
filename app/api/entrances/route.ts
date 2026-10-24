import { EntrancesQuerySchema } from "@/lib/api/schemas";
import { loadSnapshot, parseQuery } from "@/lib/api/http";
import { getStationEntrances, type AccessibleEntrance } from "@/lib/data/entrances";
import { googleMapsKey, logGoogleFailure } from "@/lib/google/config";
import { resolvePhoto } from "@/lib/google/streetview";
import type { AccessibleEntranceInfo, EntrancePhotoInfo, EntrancesResponse } from "@/lib/google/types";

export const dynamic = "force-dynamic";

/** Needs no key. The label says nothing about which entrance, so it is safe to show. */
function googleMapsLink(e: AccessibleEntrance): string {
  return `https://www.google.com/maps/search/?api=1&query=${e.point.lat},${e.point.lng}`;
}

async function photoFor(e: AccessibleEntrance, key: string): Promise<EntrancePhotoInfo | null> {
  try {
    const photo = await resolvePhoto(e, key);
    if (!photo.available) return { available: false, captureDate: null, copyright: null, imageUrl: null };
    return {
      available: true,
      captureDate: photo.captureDate,
      copyright: photo.copyright,
      imageUrl: `/api/streetview/image?${new URLSearchParams({ entranceId: e.id }).toString()}`,
    };
  } catch (err) {
    logGoogleFailure(err); // one failed lookup never hides the other entrances or the names
    return null;
  }
}

/**
 * The entrances of a station that MBTA marks wheelchair accessible (at most 3, MBTA order), with a Street View
 * photo for each when a Google key is set. Names and Google Maps links come from MBTA and need no key.
 */
export async function GET(request: Request): Promise<Response> {
  const query = parseQuery(EntrancesQuerySchema, request.url);
  if (!query.ok) return query.response;

  const outcome = await loadSnapshot();
  if (!outcome.ok) return outcome.response;
  const { stationId } = query.data;
  const station = outcome.snapshot.stations.find((s) => s.id === stationId);
  if (!station) return Response.json({ error: "Unknown station", details: { stationId } }, { status: 404 });

  let found: AccessibleEntrance[];
  try {
    found = await getStationEntrances(station.id);
  } catch {
    return Response.json({ error: "We could not load entrance information from the MBTA right now. Try again in a few minutes." }, { status: 502 });
  }

  const key = googleMapsKey();
  const mapUrl = key && found.length > 0 ? `/api/entrance-map?${new URLSearchParams({ stationId: station.id }).toString()}` : null;
  const photos = await Promise.all(found.map((e) => (key ? photoFor(e, key) : Promise.resolve(null))));

  const entrances: AccessibleEntranceInfo[] = found.map((e, i) => ({
    id: e.id,
    name: e.name,
    lat: e.point.lat,
    lng: e.point.lng,
    photo: photos[i] ?? null,
    mapUrl,
    googleMapsLink: googleMapsLink(e),
  }));
  const body: EntrancesResponse = { stationId: station.id, stationName: station.name, entrances };
  return Response.json(body);
}
