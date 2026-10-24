import type { AccessStatus, Alert, Reason, Station, TripResult, UserProfile } from "@/lib/types";
import type { ExplainResponse } from "@/lib/api/schemas";
import type { RouteRelationship } from "@/lib/engine/journey";
import type { StationMarker } from "@/lib/engine/station-map";
import type { ProfileOutcome } from "@/lib/engine/profiles";

export type { StationMarker, RouteRelationship, ProfileOutcome };

/** Additive fields that /api/status and /api/demo return next to the TripResult (spec 05). */
export interface JourneyFields {
  journey: RouteRelationship & { transferStations?: { id: string; name: string }[] };
  display: { status: AccessStatus; capped: boolean; capReasons: Reason[] };
  stations: StationMarker[];
  stationAlerts: Alert[];
  profiles: ProfileOutcome[];
  network: { available: boolean; dataSource: string | null; fetchedAt: string | null };
  coverage: { checked: "endpoints-only"; note: string };
}

/** /api/status and /api/demo answer with a TripResult plus display fields. Journey fields are optional for safety. */
export interface StatusResponse extends TripResult, Partial<JourneyFields> {
  trip: { profile: UserProfile; origin: Station | null; destination: Station | null };
  simulated?: boolean;
  label?: string;
  scenario?: string;
}

export type ExplainPayload = ExplainResponse & { dataSource?: string; fetchedAt?: string };

export type DemoScenarioId = "elevator-outage-alewife" | "all-clear" | "api-down";

export const DEMO_LABELS: Record<DemoScenarioId, string> = {
  "elevator-outage-alewife": "Elevator outage at Alewife (red)",
  "all-clear": "All clear (green)",
  "api-down": "MBTA data too old (gray)",
};

/** Short presenter labels, in demo-story order. */
export const DEMO_SHORT: Record<DemoScenarioId, string> = {
  "all-clear": "All clear",
  "elevator-outage-alewife": "Elevator outage",
  "api-down": "Data unavailable",
};
export const DEMO_ORDER: DemoScenarioId[] = ["all-clear", "elevator-outage-alewife", "api-down"];

/** The fixed simulated trip (from lib/data/demo-snapshot.ts DEMO_TRIP), shown so nobody mistakes it for their own. */
export const DEMO_TRIP_LABEL = "Alewife to Park Street";

/** The verdict to show: the capped one when the server sent it, else the engine verdict. Never more optimistic. */
export function shownStatus(r: Pick<StatusResponse, "status" | "display">): AccessStatus {
  return r.display?.status ?? r.status;
}
