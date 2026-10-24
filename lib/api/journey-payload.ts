// Additive fields shared by /api/status and /api/demo. The top-level TripResult in those responses is
// left exactly as evaluateTrip() returned it (API contract unchanged). Everything here is extra.
import type { Alert, DataSnapshot, Trip, TripResult } from "@/lib/types";
import { getNetwork } from "@/lib/data/network";
import { presentableStatus, routeRelationship, type RouteRelationship } from "@/lib/engine/journey";
import { compareProfiles } from "@/lib/engine/profiles";
import { stationStatuses } from "@/lib/engine/station-map";

export interface JourneyPayload {
  journey: RouteRelationship & { transferStations?: { id: string; name: string }[] };
  display: ReturnType<typeof presentableStatus>;
  stations: ReturnType<typeof stationStatuses>;
  /** Active alerts referenced by any station marker, for the station detail panel. */
  stationAlerts: Alert[];
  profiles: ReturnType<typeof compareProfiles>;
  network: { available: boolean; dataSource: string | null; fetchedAt: string | null };
  coverage: { checked: "endpoints-only"; note: string };
}

export async function journeyPayload(trip: Trip, result: TripResult, snapshot: DataSnapshot, now: Date): Promise<JourneyPayload> {
  const network = await getNetwork();
  const journey = routeRelationship(trip.originId, trip.destinationId, network?.patterns ?? null);
  const stations = stationStatuses(snapshot, trip.profile, now);
  const referenced = new Set(stations.flatMap((s) => [...s.blockingAlertIds, ...s.infoAlertIds]));
  const nameOf = new Map(snapshot.stations.map((s) => [s.id, s.name] as const));
  return {
    journey:
      journey.kind === "transfer"
        ? { ...journey, transferStations: journey.transferStationIds.map((id) => ({ id, name: nameOf.get(id) ?? id })) }
        : journey,
    display: presentableStatus(result, journey, trip.originId),
    stations,
    stationAlerts: snapshot.alerts.filter((a) => referenced.has(a.id)),
    profiles: compareProfiles(trip, snapshot, now, journey),
    network: { available: network !== null, dataSource: network?.source ?? null, fetchedAt: network?.fetchedAt ?? null },
    coverage: {
      checked: "endpoints-only",
      note: "Only the start and end stations are checked. Transfer stations and the path between stations are not.",
    },
  };
}
