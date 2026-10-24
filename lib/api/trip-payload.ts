import type { DataSnapshot, Station, Trip, TripResult, UserProfile } from "@/lib/types";
import type { PlatformMap } from "@/lib/data/platform-map";
import { evaluateTrip } from "@/lib/engine/evaluate-trip";
import { laterToday, type UpcomingChange } from "@/lib/engine/later-today";
import { planB, type PlanB } from "@/lib/engine/plan-b";

/** What /api/status and /api/demo return: the engine result plus Plan B, later-today warnings and display fields. */
export interface TripPayload extends TripResult {
  planB: PlanB | null;
  laterToday: UpcomingChange[];
  trip: { profile: UserProfile; origin: Station | null; destination: Station | null };
}

export function buildTripPayload(trip: Trip, snapshot: DataSnapshot, now: Date, platformMap?: PlatformMap): TripPayload {
  const result = evaluateTrip(trip, snapshot, now, platformMap);
  return {
    ...result,
    planB: planB(trip, snapshot, now, platformMap),
    laterToday: laterToday(trip, snapshot, now, platformMap),
    trip: {
      profile: trip.profile,
      origin: snapshot.stations.find((s) => s.id === trip.originId) ?? null,
      destination: snapshot.stations.find((s) => s.id === trip.destinationId) ?? null,
    },
  };
}
