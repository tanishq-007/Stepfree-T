// Presentation adapter for "Plan B" on the map and in the alternative card.
//
// It does NOT compute alternatives. Today its only source is the engine's `TripResult.alternative`
// (findAlternative in lib/engine/find-alternative.ts). A richer recommender (for example the teammate's
// lib/engine/plan-b.ts, whose no_backup elevators each carry an `alternative: Station | null`) can be
// mapped into the same AlternativeView shape with another `from...` function, without touching the UI.
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
