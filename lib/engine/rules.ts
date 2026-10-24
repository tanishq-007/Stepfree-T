// Profile rules and per-station evaluation. Pure functions: no I/O, no clock reads (callers pass `nowMs`).
import type { AccessStatus, Alert, DataSnapshot, Reason, Station, UserProfile } from "@/lib/types";
import { STALE_AFTER_MINUTES } from "@/lib/types";
import { PLATFORM_MAP, type PlatformMap } from "@/lib/data/platform-map";

// ---------------------------------------------------------------------------------------------
// Alert classification
// ---------------------------------------------------------------------------------------------

export type AlertKind =
  | "closure"
  | "access_issue"
  | "elevator_outage"
  | "escalator_outage"
  | "uneven_platform"
  | "other";

/** What an alert means for this rider. "elevator" needs the platform check before it can block. */
export type AlertImpact = "blocking" | "elevator" | "info";

const UNEVEN_PLATFORM_TEXT = /\b(uneven|unlevel|not level|mini-?high|raised platform)\b/i;

export function alertKind(alert: Alert): AlertKind {
  switch (alert.effect) {
    case "STATION_CLOSURE":
    case "STOP_CLOSURE":
      return "closure";
    case "ELEVATOR_CLOSURE":
      return "elevator_outage";
    case "ESCALATOR_CLOSURE":
      return "escalator_outage";
    case "ACCESS_ISSUE":
      return UNEVEN_PLATFORM_TEXT.test(`${alert.header} ${alert.description}`) ? "uneven_platform" : "access_issue";
    case "STATION_ISSUE":
      return UNEVEN_PLATFORM_TEXT.test(`${alert.header} ${alert.description}`) ? "uneven_platform" : "other";
    default:
      return "other";
  }
}

/**
 * Profile rules.
 *  wheelchair: strictest. Closures, access issues, uneven platforms and elevator outages all matter.
 *  stroller:   same as wheelchair for elevators; escalator outages are information only.
 *  no_stairs:  same elevator rules; uneven-platform alerts are reported but do not block.
 * Escalator outages are information only for every profile.
 */
export function impactFor(alert: Alert, profile: UserProfile): AlertImpact {
  switch (alertKind(alert)) {
    case "closure":
    case "access_issue":
      return "blocking";
    case "elevator_outage":
      return "elevator";
    case "uneven_platform":
      return profile === "no_stairs" ? "info" : "blocking";
    case "escalator_outage":
    case "other":
      return "info";
  }
}

// ---------------------------------------------------------------------------------------------
// Time
// ---------------------------------------------------------------------------------------------

/**
 * An alert is active when `nowMs` falls inside one of its periods. A period whose dates cannot be
 * parsed is treated as active: when we cannot rule an alert out, we must not drop it.
 */
export function isAlertActive(alert: Alert, nowMs: number): boolean {
  return alert.activePeriod.some((p) => {
    const start = Date.parse(p.start);
    if (Number.isNaN(start)) return true;
    if (start > nowMs) return false;
    if (p.end === null) return true;
    const end = Date.parse(p.end);
    if (Number.isNaN(end)) return true;
    return nowMs < end;
  });
}

/** Every active alert that names this station. Never drops one (see property test d). */
export function activeAlertsForStation(alerts: Alert[], stationId: string, nowMs: number): Alert[] {
  return alerts.filter((a) => a.stationIds.includes(stationId) && isAlertActive(a, nowMs));
}

export type FreshnessCode = "DATA_STALE" | "DATA_INVALID";

export interface Freshness {
  fresh: boolean;
  code?: FreshnessCode;
  ageMinutes?: number;
}

const FUTURE_SKEW_MINUTES = 2;

export function checkFreshness(fetchedAt: string, nowMs: number): Freshness {
  const fetched = Date.parse(fetchedAt);
  if (Number.isNaN(fetched) || Number.isNaN(nowMs)) return { fresh: false, code: "DATA_INVALID" };
  const ageMinutes = (nowMs - fetched) / 60_000;
  if (ageMinutes < -FUTURE_SKEW_MINUTES) return { fresh: false, code: "DATA_INVALID", ageMinutes };
  if (ageMinutes > STALE_AFTER_MINUTES) return { fresh: false, code: "DATA_STALE", ageMinutes };
  return { fresh: true, ageMinutes };
}

// ---------------------------------------------------------------------------------------------
// Station verdict
// ---------------------------------------------------------------------------------------------

export interface StationVerdict {
  stationId: string;
  status: AccessStatus;
  reasons: Reason[];
  blocking: Alert[];
  info: Alert[];
}

const SEVERITY: Record<AccessStatus, number> = { STEP_FREE: 0, UNKNOWN: 1, NOT_STEP_FREE: 2 };

/** NOT_STEP_FREE beats UNKNOWN beats STEP_FREE. */
export function worst(a: AccessStatus, b: AccessStatus): AccessStatus {
  return SEVERITY[a] >= SEVERITY[b] ? a : b;
}

type ElevatorOutcome = "covered" | "uncovered" | "unverified" | "not_on_subway_path";

/** The outcome for one broken elevator, plus the verified working elevators that cover for it. */
interface ElevatorResolution {
  outcome: ElevatorOutcome;
  /** Facility ids of verified, working elevators that reach the same platform(s). Only set when covered. */
  backups: string[];
}

export function elevatorLabel(snapshot: DataSnapshot, facilityId: string): string {
  return snapshot.facilities.find((f) => f.id === facilityId)?.name ?? `Elevator ${facilityId}`;
}

/**
 * Is there another WORKING elevator on every platform the broken one serves?
 *  covered     every platform has a working, verified alternative (listed in `backups`)
 *  uncovered   some platform has no alternative and we know every working elevator at the station
 *  unverified  we cannot tell (unmapped elevator, unverified mapping, unverified alternative)
 */
function resolveElevator(
  facilityId: string,
  station: Station,
  outaged: Set<string>,
  snapshot: DataSnapshot,
  map: PlatformMap,
): ElevatorResolution {
  const own = map[facilityId];
  if (!own || own.stationId !== station.id || !own.verified) return { outcome: "unverified", backups: [] };
  if (own.platforms.length === 0) return { outcome: "not_on_subway_path", backups: [] };

  const working = snapshot.facilities.filter(
    (f) => f.type === "elevator" && f.stationId === station.id && !outaged.has(f.id),
  );
  let unverified = false;
  const backups: string[] = [];
  for (const platform of own.platforms) {
    const serving = working.filter((f) => map[f.id]?.platforms.includes(platform));
    const verifiedServing = serving.filter((f) => map[f.id]?.verified === true);
    if (verifiedServing.length > 0) {
      for (const f of verifiedServing) if (!backups.includes(f.id)) backups.push(f.id);
      continue;
    }
    if (serving.length > 0 || working.some((f) => !map[f.id])) {
      unverified = true;
      continue;
    }
    return { outcome: "uncovered", backups: [] };
  }
  return unverified ? { outcome: "unverified", backups: [] } : { outcome: "covered", backups };
}

function combineOutcomes(outcomes: ElevatorOutcome[]): ElevatorOutcome {
  if (outcomes.includes("uncovered")) return "uncovered";
  if (outcomes.length === 0 || outcomes.includes("unverified")) return "unverified";
  if (outcomes.every((o) => o === "not_on_subway_path")) return "not_on_subway_path";
  return "covered";
}

/** "A", "A or B", "A, B or C". */
function orList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} or ${items[items.length - 1]}`;
}

export function evaluateStation(
  station: Station,
  profile: UserProfile,
  snapshot: DataSnapshot,
  nowMs: number,
  platformMap: PlatformMap = PLATFORM_MAP,
): StationVerdict {
  const reasons: Reason[] = [];
  const blocking: Alert[] = [];
  const info: Alert[] = [];
  let status: AccessStatus = "STEP_FREE";
  const add = (code: string, message: string, next: AccessStatus) => {
    reasons.push({ code, stationId: station.id, message });
    status = worst(status, next);
  };

  if (station.wheelchairBoarding === "not_accessible") {
    add("STATION_NOT_ACCESSIBLE", `${station.name} is not wheelchair accessible, according to the MBTA.`, "NOT_STEP_FREE");
  } else if (station.wheelchairBoarding === "unknown") {
    add("ACCESSIBILITY_UNKNOWN", `The MBTA has no accessibility information for ${station.name}.`, "UNKNOWN");
  }

  const alerts = activeAlertsForStation(snapshot.alerts, station.id, nowMs);
  const elevatorAlerts: Alert[] = [];
  let escalatorsOut = 0;
  for (const alert of alerts) {
    const impact = impactFor(alert, profile);
    if (impact === "blocking") {
      blocking.push(alert);
      add("BLOCKING_ALERT", `${station.name}: ${alert.header || alert.effect}`, "NOT_STEP_FREE");
    } else if (impact === "elevator") {
      elevatorAlerts.push(alert);
    } else {
      info.push(alert);
      if (alertKind(alert) === "escalator_outage") escalatorsOut += 1;
    }
  }
  if (escalatorsOut > 0) {
    const what = escalatorsOut === 1 ? "An escalator is" : `${escalatorsOut} escalators are`;
    reasons.push({ code: "ESCALATOR_OUT_INFO", stationId: station.id, message: `${what} out at ${station.name}. This does not stop step-free travel.` });
  }

  const facilityStation = new Map(snapshot.facilities.map((f) => [f.id, f.stationId] as const));
  const ownFacilityIds = (a: Alert) => a.facilityIds.filter((id) => facilityStation.get(id) === station.id);
  const outaged = new Set(elevatorAlerts.flatMap(ownFacilityIds));

  for (const alert of elevatorAlerts) {
    const ids = ownFacilityIds(alert);
    const resolutions = ids.map((id) => resolveElevator(id, station, outaged, snapshot, platformMap));
    const outcome = combineOutcomes(resolutions.map((r) => r.outcome));
    const backups = [...new Set(resolutions.flatMap((r) => r.backups))];
    const label = ids[0] ? elevatorLabel(snapshot, ids[0]) : `An elevator at ${station.name}`;
    if (ids.length === 0 || outcome === "unverified") {
      info.push(alert);
      add("PLATFORM_UNVERIFIED", `${label} is out and we cannot confirm that a working elevator reaches the same platform, so we cannot confirm a step-free route.`, "UNKNOWN");
    } else if (outcome === "uncovered") {
      blocking.push(alert);
      add("ELEVATOR_NO_ALTERNATIVE", `${label} is out and no other elevator serves the same platform.`, "NOT_STEP_FREE");
    } else if (outcome === "covered") {
      info.push(alert);
      const names = backups.map((id) => elevatorLabel(snapshot, id));
      const message =
        names.length > 0
          ? `${label} is out. Use ${orList(names)} instead. ${names.length > 1 ? "Each one reaches" : "It reaches"} the same platform.`
          : `${label} is out, but another working elevator serves the same platform.`;
      reasons.push({ code: "ELEVATOR_ALTERNATIVE_AVAILABLE", stationId: station.id, message });
    } else {
      info.push(alert);
      reasons.push({ code: "ELEVATOR_NOT_ON_SUBWAY_PATH", stationId: station.id, message: `${label} is out. It is not on the subway route.` });
    }
  }

  if (status === "STEP_FREE") {
    reasons.push({ code: "VERIFIED_STEP_FREE", stationId: station.id, message: `${station.name} is wheelchair accessible and has no active blocking alerts.` });
  }
  return { stationId: station.id, status, reasons, blocking, info };
}
