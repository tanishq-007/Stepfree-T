import { StatusQuerySchema } from "@/lib/api/schemas";
import { loadSnapshot, parseQuery } from "@/lib/api/http";
import { buildTripPayload } from "@/lib/api/trip-payload";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const query = parseQuery(StatusQuerySchema, request.url);
  if (!query.ok) return query.response;
  const { origin, destination, profile } = query.data;

  const outcome = await loadSnapshot();
  if (!outcome.ok) return outcome.response;

  return Response.json(buildTripPayload({ originId: origin, destinationId: destination, profile }, outcome.snapshot, new Date()));
}
