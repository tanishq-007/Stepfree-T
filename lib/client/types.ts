import type { ExplainResponse } from "@/lib/api/schemas";
import type { TripPayload } from "@/lib/api/trip-payload";

/** /api/status and /api/demo answer with a TripResult plus Plan B, later-today warnings and display fields. */
export interface StatusResponse extends TripPayload {
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
