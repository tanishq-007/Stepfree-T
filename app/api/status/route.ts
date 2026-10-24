import { StatusQuerySchema } from "@/lib/api/schemas";
import { loadSnapshot, parseQuery } from "@/lib/api/http";
import { journeyPayload } from "@/lib/api/journey-payload";
import { evaluateTrip } from "@/lib/engine/evaluate-trip";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const query = parseQuery(StatusQuerySchema, request.url);
  if (!query.ok) return query.response;
  const { origin, destination, profile } = query.data;

  const outcome = await loadSnapshot();
  if (!outcome.ok) return outcome.response;
  const { snapshot } = outcome;

  const now = new Date();
  const trip = { originId: origin, destinationId: destination, profile };
  const result = evaluateTrip(trip, snapshot, now);
  return Response.json({
    ...result,
    trip: {
      profile,
      origin: snapshot.stations.find((s) => s.id === origin) ?? null,
      destination: snapshot.stations.find((s) => s.id === destination) ?? null,
    },
    ...(await journeyPayload(trip, result, snapshot, now)),
  });
}
