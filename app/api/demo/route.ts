import { DemoQuerySchema } from "@/lib/api/schemas";
import { parseQuery } from "@/lib/api/http";
import { journeyPayload } from "@/lib/api/journey-payload";
import { buildTripPayload } from "@/lib/api/trip-payload";
import { buildDemoSnapshot, demoTrip } from "@/lib/data/demo-snapshot";

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
  const trip = { ...demoTrip(scenario), profile };
  const payload = buildTripPayload(trip, snapshot, now);
  return Response.json({
    ...payload,
    simulated: true,
    label: "Simulated demo data",
    scenario,
    // Markers come only from the simulated snapshot. Line geometry is MBTA reference data.
    ...(await journeyPayload(trip, payload, snapshot, now)),
  });
}
