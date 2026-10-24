// Plan B (Layer 2): which single elevator does this trip depend on, and what is the backup?
// Pure: no I/O, no clock reads. It never changes the "now" verdict; it only re-runs the same engine
// on a copy of the snapshot where one more elevator is out.
import type { Alert, DataSnapshot, Station, Trip } from "@/lib/types";
import { PLATFORM_MAP, type PlatformMap } from "@/lib/data/platform-map";
import { evaluateTrip } from "./evaluate-trip";
import { findAlternative } from "./find-alternative";
import { activeAlertsForStation, elevatorLabel, evaluateStation } from "./rules";

/**
 * has_backup    if it breaks, the station is still verified step-free (another verified elevator covers it)
 * not_on_route  if it breaks, nothing changes for subway riders (Commuter Rail, bus terminal)
 * no_backup     if it breaks, the station is NOT step-free: a single point of failure
 * cannot_check  if it breaks, we could not tell (unmapped or unverified elevator, unverified backup)
 */
export type ElevatorRole = "has_backup" | "not_on_route" | "no_backup" | "cannot_check";

export interface PlanBElevator {
  facilityId: string;
  name: string;
  stationId: string;
  stationName: string;
  role: ElevatorRole;
  /** Only for no_backup: a station that is verified step-free even with this elevator out. */
  alternative: Station | null;
}

/**
 * resilient       no single working elevator at either station can break the trip
 * fragile         at least one elevator has no backup (listed, with a Plan B station where we found one)
 * cannot_confirm  no elevator is known to have no backup, but at least one could not be checked
 */
export type PlanBStatus = "resilient" | "fragile" | "cannot_confirm";

export interface PlanB {
  status: PlanBStatus;
  /** Every working elevator at the two stations, single points of failure first. */
  elevators: PlanBElevator[];
}

const ROLE_ORDER: Record<ElevatorRole, number> = { no_backup: 0, cannot_check: 1, has_backup: 2, not_on_route: 3 };

/** A simulated outage. It exists only inside this function and is never shown to riders. */
function simulatedOutage(stationId: string, facilityId: string, nowMs: number): Alert {
  const since = new Date(nowMs - 60_000).toISOString();
  return {
    id: `planb-simulated-${facilityId}`,
    effect: "ELEVATOR_CLOSURE",
    header: "Simulated outage for Plan B",
    description: "",
    stationIds: [stationId],
    facilityIds: [facilityId],
    activePeriod: [{ start: since, end: null }],
    severity: 0,
    updatedAt: since,
  };
}

/** Snapshot copy with one more elevator out. The input snapshot is not changed. */
export function withElevatorOut(snapshot: DataSnapshot, stationId: string, facilityId: string, nowMs: number): DataSnapshot {
  return { ...snapshot, alerts: [...snapshot.alerts, simulatedOutage(stationId, facilityId, nowMs)] };
}

/** Elevators at this station that no active alert already marks as out. */
export function workingElevators(station: Station, snapshot: DataSnapshot, nowMs: number): string[] {
  const out = new Set(
    activeAlertsForStation(snapshot.alerts, station.id, nowMs)
      .filter((a) => a.effect === "ELEVATOR_CLOSURE")
      .flatMap((a) => a.facilityIds),
  );
  return snapshot.facilities
    .filter((f) => f.type === "elevator" && f.stationId === station.id && !out.has(f.id))
    .map((f) => f.id);
}

/**
 * Plan B for a trip. Returns null unless the trip is verified STEP_FREE right now: when it is not,
 * the main result already shows the problem and the alternative.
 */
export function planB(trip: Trip, snapshot: DataSnapshot, now: Date, platformMap: PlatformMap = PLATFORM_MAP): PlanB | null {
  const current = evaluateTrip(trip, snapshot, now, platformMap);
  if (current.status !== "STEP_FREE") return null;
  const nowMs = now.getTime();
  const endpoints = [trip.originId, trip.destinationId]
    .map((id) => snapshot.stations.find((s) => s.id === id))
    .filter((s): s is Station => s !== undefined);
  const exclude = new Set(endpoints.map((s) => s.id));

  const elevators: PlanBElevator[] = [];
  for (const station of endpoints) {
    for (const facilityId of workingElevators(station, snapshot, nowMs)) {
      const simulated = withElevatorOut(snapshot, station.id, facilityId, nowMs);
      const status = evaluateStation(station, trip.profile, simulated, nowMs, platformMap).status;
      let role: ElevatorRole;
      if (status === "NOT_STEP_FREE") role = "no_backup";
      else if (status === "UNKNOWN") role = "cannot_check";
      else role = platformMap[facilityId]?.platforms.length === 0 ? "not_on_route" : "has_backup";
      elevators.push({
        facilityId,
        name: elevatorLabel(snapshot, facilityId),
        stationId: station.id,
        stationName: station.name,
        role,
        alternative: role === "no_backup" ? findAlternative(station, exclude, trip.profile, simulated, nowMs, platformMap) : null,
      });
    }
  }
  elevators.sort(
    (a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || a.stationName.localeCompare(b.stationName) || a.facilityId.localeCompare(b.facilityId, undefined, { numeric: true }),
  );

  const status: PlanBStatus = elevators.some((e) => e.role === "no_backup")
    ? "fragile"
    : elevators.some((e) => e.role === "cannot_check")
      ? "cannot_confirm"
      : "resilient";
  return { status, elevators };
}
