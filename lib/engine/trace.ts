// The evidence timeline is an ordered DECISION TRACE of what the engine actually did, built from the
// real TripResult. It is not a history of events. A step carries a time ONLY when the data has one:
// the MBTA data time (fetchedAt), the rider's check time, or an alert's updatedAt / active-period start.
// Pure: no clock reads (the caller passes checkedAt).
import type { AccessStatus, Alert, Station, TripResult, UserProfile } from "@/lib/types";
import { STALE_AFTER_MINUTES } from "@/lib/types";
import type { RouteRelationship } from "./journey";
import { PROFILE_LABEL, PROFILE_SUMMARY } from "./profiles";
import { alertKind } from "./rules";

export type TraceKind = "check" | "data" | "freshness" | "profile" | "station" | "alert" | "notices" | "route" | "decision" | "cap" | "alternative";

export interface TraceTime {
  iso: string;
  label: string;
}

export interface TraceEvidence {
  label: string;
  value: string;
}

export interface TraceStep {
  id: string;
  kind: TraceKind;
  title: string;
  detail: string;
  status?: AccessStatus;
  time?: TraceTime;
  evidence?: TraceEvidence[];
  /** Original MBTA text, when the step is about an MBTA alert. */
  mbtaText?: string;
}

export interface StationCheck {
  id: string;
  name: string;
  status: AccessStatus;
  wheelchairBoarding: Station["wheelchairBoarding"];
}

export interface TraceInput {
  result: TripResult;
  profile: UserProfile;
  journey: RouteRelationship;
  displayed: { status: AccessStatus; capped: boolean; capReasons: { code: string; message: string }[] };
  origin: StationCheck | null;
  destination: StationCheck | null;
  checkedAt: string;
  /** Names for transfer station ids, when known. */
  stationName?: (id: string) => string | undefined;
}

const SOURCE_TEXT: Record<TripResult["dataSource"], string> = {
  live: "Live MBTA V3 API",
  snapshot: "Offline snapshot of MBTA data (not live)",
  demo: "Simulated demo data (not real MBTA data)",
};

const BOARDING_TEXT: Record<Station["wheelchairBoarding"], string> = {
  accessible: "MBTA lists it as wheelchair accessible",
  not_accessible: "MBTA lists it as NOT wheelchair accessible",
  unknown: "MBTA has no accessibility information for it",
};

/** A time only if the string is a real, parseable date. Never fabricates one. */
export function realTime(iso: string | null | undefined, label: string): TraceTime | undefined {
  if (!iso) return undefined;
  return Number.isNaN(Date.parse(iso)) ? undefined : { iso, label };
}

function alertTime(a: Alert): TraceTime | undefined {
  return realTime(a.updatedAt, "MBTA alert last updated") ?? realTime(a.activePeriod[0]?.start, "MBTA alert active since");
}

const NOT_EVALUATED = new Set(["STATION_NOT_FOUND", "SAME_STATION"]);

export function buildTrace(input: TraceInput): TraceStep[] {
  const { result, profile, journey, displayed, origin, destination, checkedAt } = input;
  const steps: TraceStep[] = [];
  const nameOf = (id: string) => input.stationName?.(id) ?? id;

  steps.push({
    id: "check",
    kind: "check",
    title: "You asked for a check",
    detail: `${origin?.name ?? "Start"} to ${destination?.name ?? "end"}.`,
    time: realTime(checkedAt, "Checked"),
  });

  steps.push({
    id: "data",
    kind: "data",
    title: "MBTA data loaded",
    detail: SOURCE_TEXT[result.dataSource],
    time: realTime(result.fetchedAt, "MBTA data time"),
    evidence: [{ label: "Source", value: result.dataSource }],
  });

  if (result.isStale) {
    const r = result.reasons[0];
    steps.push({
      id: "freshness",
      kind: "freshness",
      title: "Data too old to trust",
      detail: r?.message ?? `The data is older than ${STALE_AFTER_MINUTES} minutes.`,
      status: "UNKNOWN",
      evidence: [{ label: "Rule", value: `Data must be under ${STALE_AFTER_MINUTES} minutes old` }],
    });
  } else {
    steps.push({
      id: "freshness",
      kind: "freshness",
      title: "Data is fresh enough",
      detail: `Under the ${STALE_AFTER_MINUTES}-minute limit, so the stations can be checked.`,
    });
  }

  const evaluated = !result.isStale && !result.reasons.some((r) => NOT_EVALUATED.has(r.code));

  if (evaluated) {
    steps.push({
      id: "profile",
      kind: "profile",
      title: `Profile applied: ${PROFILE_LABEL[profile]}`,
      detail: PROFILE_SUMMARY[profile],
    });

    for (const [role, st] of [["Start", origin], ["End", destination]] as const) {
      if (!st) continue;
      const own = result.reasons.filter((r) => r.stationId === st.id);
      steps.push({
        id: `station-${role}`,
        kind: "station",
        title: `${role} station checked: ${st.name}`,
        detail: `${BOARDING_TEXT[st.wheelchairBoarding]}. ${own.map((r) => r.message).join(" ")}`.trim(),
        status: st.status,
        evidence: [{ label: "Station id", value: st.id }],
      });
    }

    for (const a of result.blockingAlerts) {
      steps.push({
        id: `alert-${a.id}`,
        kind: "alert",
        title: "MBTA alert blocks the trip",
        detail: `${a.effect.replace(/_/g, " ").toLowerCase()} (${alertKind(a).replace(/_/g, " ")}). For this profile it is a blocker.`,
        status: "NOT_STEP_FREE",
        time: alertTime(a),
        mbtaText: a.header,
        evidence: [
          { label: "Alert id", value: a.id },
          ...(a.facilityIds.length ? [{ label: "Facility ids", value: a.facilityIds.join(", ") }] : []),
          ...(a.stationIds.length ? [{ label: "Stations", value: a.stationIds.map(nameOf).join(", ") }] : []),
        ],
      });
    }

    if (result.infoAlerts.length > 0) {
      steps.push({
        id: "notices",
        kind: "notices",
        title: `${result.infoAlerts.length} other MBTA ${result.infoAlerts.length === 1 ? "notice" : "notices"} considered`,
        detail: "Read and checked, but they do not block this trip on their own (for example escalator outages, or an elevator outage with another working elevator).",
        evidence: result.infoAlerts.map((a) => ({ label: a.id, value: a.header || a.effect })),
      });
    }

    const route =
      journey.kind === "direct"
        ? { title: `Route: same line (${journey.lines.join(", ")})`, detail: "Both stations are on this line in the MBTA's scheduled route patterns. No transfer needed." }
        : journey.kind === "transfer"
          ? {
              title: "Route: change of line needed",
              detail: `Likely transfer at ${journey.transferStationIds.map(nameOf).join(" or ")}. Transfer stations are not checked.`,
            }
          : { title: "Route: connection unknown", detail: "We could not work out how these stations connect from the MBTA route patterns." };
    steps.push({ id: "route", kind: "route", ...route, status: journey.kind === "direct" ? undefined : "UNKNOWN" });
  }

  steps.push({
    id: "decision",
    kind: "decision",
    title: `Engine decision: ${result.status}`,
    detail:
      result.status === "STEP_FREE"
        ? "Both stations passed every rule for this profile."
        : result.status === "NOT_STEP_FREE"
          ? "At least one verified problem blocks a station on this trip."
          : "Something could not be verified, so the engine will not say step-free.",
    status: result.status,
    evidence: [{ label: "Rules", value: "lib/engine/rules.ts (deterministic, no AI)" }],
  });

  if (displayed.capped) {
    steps.push({
      id: "cap",
      kind: "cap",
      title: `Shown as ${displayed.status}`,
      detail: displayed.capReasons.map((r) => r.message).join(" "),
      status: displayed.status,
    });
  }

  const searched = evaluated && result.status !== "STEP_FREE";
  if (searched) {
    steps.push(
      result.alternative
        ? {
            id: "alternative",
            kind: "alternative",
            title: `Alternative found: ${result.alternative.name}`,
            detail: `Nearest station on the same line (${result.alternative.lines.join(", ")}) that passed every rule just now. Straight-line distance, not walking time.`,
            status: "STEP_FREE",
            evidence: [{ label: "Station id", value: result.alternative.id }],
          }
        : {
            id: "alternative",
            kind: "alternative",
            title: "No verified alternative found",
            detail: "No station on the same line passed every rule just now.",
          },
    );
  }
  return steps;
}

/** Every time a trace may legally contain. Used by the property test (I8). */
export function allowedTraceTimes(input: Pick<TraceInput, "result" | "checkedAt">): Set<string> {
  const out = new Set<string>([input.checkedAt, input.result.fetchedAt]);
  for (const a of [...input.result.blockingAlerts, ...input.result.infoAlerts]) {
    out.add(a.updatedAt);
    if (a.activePeriod[0]) out.add(a.activePeriod[0].start);
  }
  return out;
}
