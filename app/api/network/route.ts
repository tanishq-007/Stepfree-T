import { drawablePatterns, getNetwork } from "@/lib/data/network";

export const dynamic = "force-dynamic";

/**
 * Official MBTA subway line geometry for the map. REFERENCE data (scheduled canonical patterns), not
 * live accessibility data and not a verified itinerary. Never throws: 502 if no copy is available.
 */
export async function GET(): Promise<Response> {
  const network = await getNetwork();
  if (!network) {
    return Response.json(
      { error: "MBTA line geometry is unavailable.", details: "No live response and no committed copy.", lines: [], dataSource: null, fetchedAt: null },
      { status: 502 },
    );
  }
  return Response.json({
    lines: drawablePatterns(network).map((p) => ({
      id: p.id,
      routeId: p.routeId,
      line: p.line,
      name: p.name,
      coordinates: p.coordinates,
      stationIds: p.stationIds,
    })),
    kind: "reference",
    note: "MBTA line geometry from canonical route patterns. A reference, not a verified itinerary.",
    dataSource: network.source,
    fetchedAt: network.fetchedAt,
  });
}
