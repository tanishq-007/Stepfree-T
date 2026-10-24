import { DemoQuerySchema } from "@/lib/api/schemas";
import { parseQuery } from "@/lib/api/http";
import { journeyPayload } from "@/lib/api/journey-payload";
import { buildDemoSnapshot, DEMO_TRIP } from "@/lib/data/demo-snapshot";
import { evaluateTrip } from "@/lib/engine/evaluate-trip";

export const dynamic = "force-dynamic";

/**
 * SIMULATED data only. The real routes never touch lib/data/demo-snapshot.ts.
 * `profile` is optional (default wheelchair) so the presenter can show profile switching; the
 * scenario's stations, alerts and trip stay fixed.
 */
export async function GET(request: Request): Promise<Response> {
  const query = parseQuery(DemoQuerySchema, request.url);
  if (!query.ok) return query.response;
  const { scenario, profile } = query.data;

  const now = new Date();
  const snapshot = buildDemoSnapshot(scenario, now);
  const trip = { ...DEMO_TRIP, profile };
  const result = evaluateTrip(trip, snapshot, now);
  return Response.json({
    ...result,
    simulated: true,
    label: "Simulated demo data",
    scenario,
    trip: {
      profile: trip.profile,
      origin: snapshot.stations.find((s) => s.id === trip.originId) ?? null,
      destination: snapshot.stations.find((s) => s.id === trip.destinationId) ?? null,
    },
    // Markers come only from the simulated snapshot. Line geometry is MBTA reference data.
    ...(await journeyPayload(trip, result, snapshot, now)),
  });
}
