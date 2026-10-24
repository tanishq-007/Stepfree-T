import { DemoQuerySchema } from "@/lib/api/schemas";
import { parseQuery } from "@/lib/api/http";
import { buildTripPayload } from "@/lib/api/trip-payload";
import { buildDemoSnapshot, demoTrip } from "@/lib/data/demo-snapshot";

export const dynamic = "force-dynamic";

/** SIMULATED data only. The real routes never touch lib/data/demo-snapshot.ts. */
export async function GET(request: Request): Promise<Response> {
  const query = parseQuery(DemoQuerySchema, request.url);
  if (!query.ok) return query.response;
  const { scenario } = query.data;

  const now = new Date();
  const snapshot = buildDemoSnapshot(scenario, now);
  const trip = { ...demoTrip(scenario), profile: "wheelchair" as const };
  return Response.json({
    ...buildTripPayload(trip, snapshot, now),
    simulated: true,
    label: "Simulated demo data",
    scenario,
  });
}
