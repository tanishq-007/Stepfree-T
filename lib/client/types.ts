import type { AccessStatus, Alert, Reason, TripResult } from "@/lib/types";
import type { ExplainResponse } from "@/lib/api/schemas";
import type { TripPayload } from "@/lib/api/trip-payload";
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

/**
 * /api/status and /api/demo answer with a TripResult, the trip, Plan B and later-today warnings
 * (lib/api/trip-payload.ts) and the journey fields (lib/api/journey-payload.ts). Everything beyond the
 * TripResult and the trip is optional on the client, so an older or partial response still renders.
 */
export interface StatusResponse extends TripResult, Partial<Pick<TripPayload, "planB" | "laterToday">>, Partial<JourneyFields> {
  trip: TripPayload["trip"];
  simulated?: boolean;
  label?: string;
  scenario?: string;
}

export type ExplainPayload = ExplainResponse & { dataSource?: string; fetchedAt?: string };

export type DemoScenarioId =
  | "elevator-outage-alewife"
  | "backup-elevator-alewife"
  | "plan-b-davis"
  | "planned-outage"
  | "all-clear"
  | "api-down";

export const DEMO_LABELS: Record<DemoScenarioId, string> = {
  "elevator-outage-alewife": "Alewife to Park Street: both platform elevators out (red)",
  "backup-elevator-alewife": "Alewife to Park Street: one elevator out, backup works (green)",
  "plan-b-davis": "Davis to Park Street: one elevator, no backup (Plan B)",
  "planned-outage": "Alewife to Park Street: planned outage later today",
  "all-clear": "Alewife to Park Street: all clear (green)",
  "api-down": "Alewife to Park Street: MBTA data too old (gray)",
};

export const DEMO_SCENARIOS = Object.keys(DEMO_LABELS) as DemoScenarioId[];

/** Short presenter labels. */
export const DEMO_SHORT: Record<DemoScenarioId, string> = {
  "all-clear": "All clear",
  "elevator-outage-alewife": "Elevator outage",
  "backup-elevator-alewife": "Backup elevator",
  "plan-b-davis": "No backup elevator",
  "planned-outage": "Planned outage",
  "api-down": "Data unavailable",
};

/** Presenter order: the demo story, from a calm day to a data failure. */
export const DEMO_ORDER: DemoScenarioId[] = ["all-clear", "elevator-outage-alewife", "backup-elevator-alewife", "plan-b-davis", "planned-outage", "api-down"];

/**
 * The fixed simulated trip of each scenario (mirrors demoTrip() in lib/data/demo-snapshot.ts, which client
 * code must not import). Shown so nobody mistakes a simulated trip for their own.
 */
export const DEMO_TRIP_LABEL: Record<DemoScenarioId, string> = {
  "all-clear": "Alewife to Park Street",
  "elevator-outage-alewife": "Alewife to Park Street",
  "backup-elevator-alewife": "Alewife to Park Street",
  "plan-b-davis": "Davis to Park Street",
  "planned-outage": "Alewife to Park Street",
  "api-down": "Alewife to Park Street",
};

/** The verdict to show: the capped one when the server sent it, else the engine verdict. Never more optimistic. */
export function shownStatus(r: Pick<StatusResponse, "status" | "display">): AccessStatus {
  return r.display?.status ?? r.status;
}
