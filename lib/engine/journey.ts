// How the origin and destination connect on the subway network, and the display cap that keeps the
// verdict honest about what the engine did NOT check. Pure: no I/O, no clock.
//
// The decision engine (evaluate-trip.ts) checks ONLY the origin and destination stations. It does not
// check transfer stations. So a green verdict is only honest for a trip that stays on one line.
import type { AccessStatus, Reason, TripResult } from "@/lib/types";

/** Minimal view of the network this module needs (decoupled from the data layer's types). */
export interface LineMembership {
  line: string;
  stationIds: readonly string[];
}

export type RouteRelationship =
  | { kind: "direct"; lines: string[] }
  | { kind: "transfer"; originLines: string[]; destinationLines: string[]; transferStationIds: string[] }
  | { kind: "unknown"; reason: "NO_NETWORK" | "STATION_NOT_IN_NETWORK" | "NO_SINGLE_TRANSFER" };

/** line -> set of station ids, merged across all patterns and directions of that line. */
export function stationsByLine(patterns: readonly LineMembership[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const p of patterns) {
    const set = out.get(p.line) ?? new Set<string>();
    for (const id of p.stationIds) set.add(id);
    out.set(p.line, set);
  }
  return out;
}

export function routeRelationship(
  originId: string,
  destinationId: string,
  patterns: readonly LineMembership[] | null,
): RouteRelationship {
  if (!patterns || patterns.length === 0) return { kind: "unknown", reason: "NO_NETWORK" };
  const byLine = stationsByLine(patterns);
  const linesOf = (id: string) => [...byLine].filter(([, set]) => set.has(id)).map(([line]) => line).sort();
  const originLines = linesOf(originId);
  const destinationLines = linesOf(destinationId);
  if (originLines.length === 0 || destinationLines.length === 0) {
    return { kind: "unknown", reason: "STATION_NOT_IN_NETWORK" };
  }

  const shared = originLines.filter((l) => destinationLines.includes(l));
  if (shared.length > 0) return { kind: "direct", lines: shared };

  const transfer = new Set<string>();
  for (const a of originLines) {
    for (const b of destinationLines) {
      for (const id of byLine.get(a) ?? []) if (byLine.get(b)?.has(id)) transfer.add(id);
    }
  }
  if (transfer.size === 0) return { kind: "unknown", reason: "NO_SINGLE_TRANSFER" };
  return { kind: "transfer", originLines, destinationLines, transferStationIds: [...transfer].sort() };
}

export interface Presentable {
  status: AccessStatus;
  /** Extra reasons the cap added. Empty when the engine verdict is shown unchanged. */
  capReasons: Reason[];
  capped: boolean;
}

/**
 * The verdict the UI may show. It can only be the engine verdict or MORE cautious.
 * STEP_FREE is kept only for a direct (single-line) trip. A transfer or unknown connection means
 * part of the journey was not checked, so a green verdict becomes UNKNOWN.
 */
export function presentableStatus(
  result: Pick<TripResult, "status">,
  journey: RouteRelationship,
  originId: string,
): Presentable {
  if (result.status !== "STEP_FREE" || journey.kind === "direct") {
    return { status: result.status, capReasons: [], capped: false };
  }
  const message =
    journey.kind === "transfer"
      ? "This trip needs a change of line. We only check your start and end stations, not the transfer station, so we cannot confirm the whole trip is step-free."
      : "We could not work out how these two stations connect on the subway, so we cannot confirm the whole trip is step-free.";
  return {
    status: "UNKNOWN",
    capReasons: [{ code: journey.kind === "transfer" ? "TRANSFER_NOT_CHECKED" : "ROUTE_UNKNOWN", stationId: originId, message }],
    capped: true,
  };
}
