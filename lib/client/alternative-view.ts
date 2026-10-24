// Presentation adapter for "Plan B" on the map and in the Plan B cards.
//
// It does NOT compute alternatives. It reads two engine outputs, which never appear together:
//  - `TripResult.alternative` (findAlternative): the trip has a problem RIGHT NOW, and this verified
//    step-free station can replace the blocked end. -> alternativeFromResult()
//  - `planB` (lib/engine/plan-b.ts): the trip is step-free now; IF a single elevator breaks, this
//    station stays verified step-free without it. Hypothetical, not needed today. -> backupsFromPlanB()
import type { AccessStatus, Station } from "@/lib/types";
import type { StatusResponse } from "./types";
import { shownStatus } from "./types";
import type { DraftAction } from "./trip-draft";

export interface AlternativeOriginal {
  id: string;
  name: string;
  /** Which end of the trip the problem station is. */
  role: "origin" | "destination";
  status: AccessStatus;
  /** The engine's own reason text for this station's problem. */
  issue: string | null;
}

export interface AlternativeSuggestion {
  id: string;
  name: string;
  lines: string[];
  /** The alternative's own per-station verdict on the same data (from result.stations). */
  status: AccessStatus;
  /** Lines it shares with the original station (the rule findAlternative uses). */
  sharedLines: string[];
  /** Evidence lines, all taken from the engine result. */
  evidence: string[];
}

export type AlternativeView =
  | { kind: "suggested"; source: "engine-alternative"; original: AlternativeOriginal; alternative: AlternativeSuggestion; why: string }
  | { kind: "none"; message: string }
  | { kind: "not-needed" };

export const NO_ALTERNATIVE_MESSAGE = "No verified alternative station is available from the current data.";

const SKIP = (code: string) => code === "VERIFIED_STEP_FREE" || code.startsWith("ESCALATOR") || code.startsWith("ELEVATOR_ALTERNATIVE") || code === "ELEVATOR_NOT_ON_SUBWAY_PATH";

/** The trip end the engine found a problem at: the station of the first problem reason. */
function problemStation(result: StatusResponse): { station: Station; role: "origin" | "destination"; issue: string | null } | null {
  const { origin, destination } = result.trip;
  for (const r of result.reasons) {
    if (SKIP(r.code)) continue;
    if (origin && r.stationId === origin.id) return { station: origin, role: "origin", issue: r.message };
    if (destination && r.stationId === destination.id) return { station: destination, role: "destination", issue: r.message };
  }
  return null;
}

/** Build the view from today's engine output only. */
export function alternativeFromResult(result: StatusResponse): AlternativeView {
  if (shownStatus(result) === "STEP_FREE") return { kind: "not-needed" };
  const alt = result.alternative;
  const problem = problemStation(result);
  if (!alt || !problem) return { kind: "none", message: NO_ALTERNATIVE_MESSAGE };

  const markers = new Map((result.stations ?? []).map((m) => [m.id, m] as const));
  const originalMarker = markers.get(problem.station.id);
  const altMarker = markers.get(alt.id);
  const sharedLines = alt.lines.filter((l) => problem.station.lines.includes(l));
  const evidence = [
    alt.wheelchairBoarding === "accessible" ? "The MBTA lists it as wheelchair accessible." : `MBTA accessibility value: ${alt.wheelchairBoarding}.`,
    ...(altMarker?.reasons.map((r) => r.message) ?? []),
    altMarker && altMarker.blockingAlertIds.length === 0 ? "No active MBTA alert blocks it right now." : "",
  ].filter((s, i, all) => s !== "" && all.indexOf(s) === i);

  return {
    kind: "suggested",
    source: "engine-alternative",
    original: {
      id: problem.station.id,
      name: problem.station.name,
      role: problem.role,
      status: originalMarker?.status ?? result.status,
      issue: problem.issue,
    },
    alternative: {
      id: alt.id,
      name: alt.name,
      lines: alt.lines,
      // The engine only returns alternatives that evaluated STEP_FREE; show the marker's value if we have it.
      status: altMarker?.status ?? "STEP_FREE",
      sharedLines,
      evidence,
    },
    why: `It is the nearest station on the same line${sharedLines.length ? ` (${sharedLines.join(", ")})` : ""} that passed every check for this profile just now. "Nearest" is straight-line distance. We have not checked the trip between the two stations, or how you would get there.`,
  };
}

/** The draft change that puts the suggestion at the problem end. Does not save or evaluate anything. */
export function alternativeAction(view: AlternativeView): DraftAction | null {
  if (view.kind !== "suggested") return null;
  return view.original.role === "origin" ? { type: "setOrigin", id: view.alternative.id } : { type: "setDestination", id: view.alternative.id };
}

/** One single point of failure from planB(): a working elevator with no backup, and where to go if it breaks. */
export interface BackupView {
  facilityId: string;
  elevatorName: string;
  /** The trip station the elevator is at. */
  at: { id: string; name: string; role: "origin" | "destination" };
  /** planB()'s station that is verified step-free even with this elevator out, or null when it found none. */
  backup: { id: string; name: string; lines: string[]; sharedLines: string[]; status: AccessStatus } | null;
}

/**
 * Hypothetical backups from the engine's Plan B, in planB()'s order. Empty when there is no Plan B (the
 * trip is not step-free now, or the response has none). Nothing is added: a single point of failure
 * without a planB() station keeps `backup: null`.
 */
export function backupsFromPlanB(result: StatusResponse): BackupView[] {
  const plan = result.planB;
  if (!plan) return [];
  const { origin, destination } = result.trip;
  const markers = new Map((result.stations ?? []).map((m) => [m.id, m] as const));
  return plan.elevators
    .filter((e) => e.role === "no_backup")
    .map((e) => {
      const role = e.stationId === origin?.id ? "origin" : "destination";
      const at = (role === "origin" ? origin : destination) ?? null;
      const alt = e.alternative;
      return {
        facilityId: e.facilityId,
        elevatorName: e.name,
        at: { id: e.stationId, name: at?.name ?? e.stationName, role },
        backup: alt
          ? {
              id: alt.id,
              name: alt.name,
              lines: alt.lines,
              sharedLines: alt.lines.filter((l) => at?.lines.includes(l)),
              // Plan B only returns stations that evaluated STEP_FREE; show the marker's own value if we have it.
              status: markers.get(alt.id)?.status ?? "STEP_FREE",
            }
          : null,
      };
    });
}

/** Station id -> the trip stations it backs up, for map labels and the station panel. */
export function backupStations(backups: BackupView[]): Map<string, { name: string; forStations: string[]; elevators: string[] }> {
  const out = new Map<string, { name: string; forStations: string[]; elevators: string[] }>();
  for (const b of backups) {
    if (!b.backup) continue;
    const entry = out.get(b.backup.id) ?? { name: b.backup.name, forStations: [], elevators: [] };
    if (!entry.forStations.includes(b.at.name)) entry.forStations.push(b.at.name);
    entry.elevators.push(b.elevatorName);
    out.set(b.backup.id, entry);
  }
  return out;
}
