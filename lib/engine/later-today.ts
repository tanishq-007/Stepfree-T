// Later today (Layer 3): will a planned MBTA outage make this trip worse in the next few hours?
// Pure: no I/O, no clock reads. It never changes the "now" verdict (property P14).
import type { AccessStatus, Alert, DataSnapshot, Station, Trip } from "@/lib/types";
import { PLATFORM_MAP, type PlatformMap } from "@/lib/data/platform-map";
import { LATER_TODAY_HOURS } from "./constants";
import { checkFreshness, evaluateStation, isAlertActive, worst } from "./rules";

export { LATER_TODAY_HOURS };

export interface UpcomingChange {
  /** When the planned outage starts (ISO). */
  startsAt: string;
  /** The trip result from that time on, if nothing else changes. Always worse than the result now. */
  status: Exclude<AccessStatus, "STEP_FREE">;
  stationIds: string[];
  /** The planned alerts that cause the change. */
  alerts: Alert[];
}

const SEVERITY: Record<AccessStatus, number> = { STEP_FREE: 0, UNKNOWN: 1, NOT_STEP_FREE: 2 };

function tripStatusAt(stations: Station[], trip: Trip, snapshot: DataSnapshot, atMs: number, map: PlatformMap): AccessStatus {
  return stations
    .map((s) => evaluateStation(s, trip.profile, snapshot, atMs, map).status)
    .reduce<AccessStatus>((acc, s) => worst(acc, s), "STEP_FREE");
}

/**
 * Planned outages at the two trip stations that start after `now` and within `hours`, and that would make
 * the trip result worse than it is now. Empty when the data is not fresh: we never forecast from old data.
 */
export function laterToday(
  trip: Trip,
  snapshot: DataSnapshot,
  now: Date,
  platformMap: PlatformMap = PLATFORM_MAP,
  hours: number = LATER_TODAY_HOURS,
): UpcomingChange[] {
  const nowMs = now.getTime();
  if (!checkFreshness(snapshot.fetchedAt, nowMs).fresh) return [];
  const stations = [trip.originId, trip.destinationId]
    .map((id) => snapshot.stations.find((s) => s.id === id))
    .filter((s): s is Station => s !== undefined);
  if (stations.length !== 2 || trip.originId === trip.destinationId) return [];

  const ids = new Set(stations.map((s) => s.id));
  const horizon = nowMs + hours * 3_600_000;
  const relevant = snapshot.alerts.filter((a) => a.stationIds.some((id) => ids.has(id)));
  const starts = [
    ...new Set(
      relevant
        .flatMap((a) => a.activePeriod.map((p) => Date.parse(p.start)))
        .filter((t) => Number.isFinite(t) && t > nowMs && t <= horizon),
    ),
  ].sort((a, b) => a - b);

  const statusNow = tripStatusAt(stations, trip, snapshot, nowMs, platformMap);
  const changes: UpcomingChange[] = [];
  for (const t of starts) {
    const status = tripStatusAt(stations, trip, snapshot, t, platformMap);
    if (status === "STEP_FREE" || SEVERITY[status] <= SEVERITY[statusNow]) continue;
    // Only warn when something that starts at t makes the trip worse than it was a moment before.
    const justBefore = tripStatusAt(stations, trip, snapshot, t - 1, platformMap);
    if (SEVERITY[status] <= SEVERITY[justBefore]) continue;
    const starting = relevant.filter((a) => isAlertActive(a, t) && a.activePeriod.some((p) => Date.parse(p.start) === t));
    changes.push({
      startsAt: new Date(t).toISOString(),
      status,
      stationIds: [...new Set(starting.flatMap((a) => a.stationIds.filter((id) => ids.has(id))))].sort(),
      alerts: starting,
    });
  }
  return changes;
}
