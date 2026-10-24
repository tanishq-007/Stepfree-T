import { EntrancesQuerySchema } from "@/lib/api/schemas";
import { loadSnapshot, parseQuery } from "@/lib/api/http";
import { getStationEntrances, type AccessibleEntrance } from "@/lib/data/entrances";
import { GOOGLE_UNAVAILABLE_MESSAGE, googleMapsKey, logGoogleFailure } from "@/lib/google/config";
import { buildMapMarkers, fetchStaticMap } from "@/lib/google/staticmap";
import { IMAGE_CACHE_CONTROL } from "@/lib/google/streetview";

export const dynamic = "force-dynamic";

/**
 * Streams a map of a station: the station, and one numbered marker per accessible entrance (same numbers and
 * order as the list in /api/entrances). Only the picture goes back: no Google URL, no key. Nothing is stored on disk.
 */
export async function GET(request: Request): Promise<Response> {
  const query = parseQuery(EntrancesQuerySchema, request.url);
  if (!query.ok) return query.response;

  const key = googleMapsKey();
  if (!key) return Response.json({ available: false }, { status: 404 });

  const outcome = await loadSnapshot();
  if (!outcome.ok) return outcome.response;
  const { stationId } = query.data;
  const station = outcome.snapshot.stations.find((s) => s.id === stationId);
  if (!station) return Response.json({ error: "Unknown station", details: { stationId } }, { status: 404 });

  let entrances: AccessibleEntrance[];
  try {
    entrances = await getStationEntrances(station.id);
  } catch {
    return Response.json({ error: "We could not load entrance information from the MBTA right now. Try again in a few minutes." }, { status: 502 });
  }
  // No accessible entrance means no map: we never draw a map for a station area.
  if (entrances.length === 0) return Response.json({ available: false }, { status: 404 });

  try {
    const upstream = await fetchStaticMap(buildMapMarkers({ lat: station.lat, lng: station.lng }, entrances), key);
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "image/png",
        "Cache-Control": IMAGE_CACHE_CONTROL,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    logGoogleFailure(err);
    return Response.json({ error: GOOGLE_UNAVAILABLE_MESSAGE }, { status: 502 });
  }
}
