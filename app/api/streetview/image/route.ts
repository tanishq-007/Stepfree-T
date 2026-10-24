import { EntranceImageQuerySchema } from "@/lib/api/schemas";
import { parseQuery } from "@/lib/api/http";
import { getEntrance, isAccessibleEntrance } from "@/lib/data/entrances";
import { MbtaError } from "@/lib/data/mbta-client";
import { GOOGLE_UNAVAILABLE_MESSAGE, googleMapsKey, logGoogleFailure } from "@/lib/google/config";
import { fetchStreetViewImage, IMAGE_CACHE_CONTROL, resolvePhoto } from "@/lib/google/streetview";

export const dynamic = "force-dynamic";

/**
 * Streams the Street View picture for one accessible entrance. The browser asks us, we ask Google with the key,
 * and only the picture bytes go back: no Google URL, no key, no Google headers. Nothing is written to disk.
 * An id that MBTA does not mark as an accessible entrance gets a 404, so this cannot be used to look at anywhere else.
 */
export async function GET(request: Request): Promise<Response> {
  const query = parseQuery(EntranceImageQuerySchema, request.url);
  if (!query.ok) return query.response;

  const key = googleMapsKey();
  if (!key) return Response.json({ available: false }, { status: 404 });

  let entrance;
  try {
    entrance = await getEntrance(query.data.entranceId);
  } catch (err) {
    // MBTA says "no such stop" (a 4xx): that is a 404 for us too. Anything else is MBTA being unavailable.
    if (err instanceof MbtaError && !err.retryable) return Response.json({ available: false }, { status: 404 });
    return Response.json({ error: "We could not check this entrance with the MBTA right now. Try again in a few minutes." }, { status: 502 });
  }
  if (!entrance || !isAccessibleEntrance(entrance)) return Response.json({ available: false }, { status: 404 });

  try {
    const photo = await resolvePhoto(entrance, key);
    if (!photo.available) return Response.json({ available: false }, { status: 404 });
    const upstream = await fetchStreetViewImage(photo, key);
    return new Response(upstream.body, {
      status: 200,
      headers: {
        // Set by us, not copied from Google, so no Google header can reach the browser.
        "Content-Type": upstream.headers.get("content-type") ?? "image/jpeg",
        "Cache-Control": IMAGE_CACHE_CONTROL,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (err) {
    logGoogleFailure(err);
    return Response.json({ error: GOOGLE_UNAVAILABLE_MESSAGE }, { status: 502 });
  }
}
