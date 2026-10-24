import { RestroomsQuerySchema } from "@/lib/api/schemas";
import { loadSnapshot, parseQuery } from "@/lib/api/http";
import { GOOGLE_UNAVAILABLE_MESSAGE, googleMapsKey, logGoogleFailure } from "@/lib/google/config";
import { getRestrooms, withinRadius } from "@/lib/google/restrooms";
import type { FeatureDisabled, RestroomsResponse } from "@/lib/google/types";

export const dynamic = "force-dynamic";

/** Wheelchair-accessible restrooms near a station, as reported by Google. Hidden (enabled:false) without a key. */
export async function GET(request: Request): Promise<Response> {
  const query = parseQuery(RestroomsQuerySchema, request.url);
  if (!query.ok) return query.response;

  const key = googleMapsKey();
  if (!key) return Response.json({ enabled: false } satisfies FeatureDisabled);

  const outcome = await loadSnapshot();
  if (!outcome.ok) return outcome.response;
  const { stationId, radius } = query.data;
  const station = outcome.snapshot.stations.find((s) => s.id === stationId);
  if (!station) return Response.json({ error: "Unknown station", details: { stationId } }, { status: 404 });

  try {
    const search = await getRestrooms(station, key);
    const body: RestroomsResponse = {
      stationId: station.id,
      places: withinRadius(search, radius),
      source: "google",
      fetchedAt: search.fetchedAt,
    };
    return Response.json(body);
  } catch (err) {
    logGoogleFailure(err);
    return Response.json({ error: GOOGLE_UNAVAILABLE_MESSAGE }, { status: 502 });
  }
}
