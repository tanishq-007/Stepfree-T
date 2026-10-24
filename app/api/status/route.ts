import { StatusQuerySchema } from "@/lib/api/schemas";
import { loadSnapshot, parseQuery } from "@/lib/api/http";
import { journeyPayload } from "@/lib/api/journey-payload";
import { buildTripPayload } from "@/lib/api/trip-payload";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const query = parseQuery(StatusQuerySchema, request.url);
  if (!query.ok) return query.response;
  const { origin, destination, profile } = query.data;

  const outcome = await loadSnapshot();
  if (!outcome.ok) return outcome.response;

  const now = new Date();
  const trip = { originId: origin, destinationId: destination, profile };
  const payload = buildTripPayload(trip, outcome.snapshot, now);
  // The journey fields are additive; the top-level TripResult stays exactly what evaluateTrip() returned.
  return Response.json({ ...payload, ...(await journeyPayload(trip, payload, outcome.snapshot, now)) });
}
