"use client";
// Trip selection made on the map ("Start here" / "Go here"), before the rider applies it.
// The pure reducer is the contract (tested); the tiny store lets the map, the station panel and the
// alternative card share one draft without threading props through the page.
// Nothing here evaluates accessibility and nothing here saves a trip.
import { useSyncExternalStore } from "react";
import type { Trip, UserProfile } from "@/lib/types";

export interface TripDraft {
  originId: string | null;
  destinationId: string | null;
}

export type DraftAction =
  | { type: "reset"; originId: string | null; destinationId: string | null }
  | { type: "setOrigin"; id: string }
  | { type: "setDestination"; id: string }
  | { type: "swap" }
  | { type: "clear" };

export const EMPTY_DRAFT: TripDraft = { originId: null, destinationId: null };

/**
 * Picking a station for one end that is already the other end moves it (the other end becomes empty),
 * so origin and destination can never be the same station.
 */
export function draftReducer(d: TripDraft, a: DraftAction): TripDraft {
  switch (a.type) {
    case "reset":
      return { originId: a.originId, destinationId: a.originId !== null && a.originId === a.destinationId ? null : a.destinationId };
    case "setOrigin":
      return { originId: a.id, destinationId: d.destinationId === a.id ? null : d.destinationId };
    case "setDestination":
      return { originId: d.originId === a.id ? null : d.originId, destinationId: a.id };
    case "swap":
      return { originId: d.destinationId, destinationId: d.originId };
    case "clear":
      return EMPTY_DRAFT;
  }
}

export type DraftProblem = "MISSING_ORIGIN" | "MISSING_DESTINATION" | "SAME_STATION" | "UNKNOWN_STATION";

/** Why the draft cannot be checked yet, or null when it can. */
export function draftProblem(d: TripDraft, knownIds: ReadonlySet<string>): DraftProblem | null {
  if (!d.originId) return "MISSING_ORIGIN";
  if (!d.destinationId) return "MISSING_DESTINATION";
  if (d.originId === d.destinationId) return "SAME_STATION";
  if (!knownIds.has(d.originId) || !knownIds.has(d.destinationId)) return "UNKNOWN_STATION";
  return null;
}

export const PROBLEM_TEXT: Record<DraftProblem, string> = {
  MISSING_ORIGIN: "Choose a start station on the map or in the station list.",
  MISSING_DESTINATION: "Now choose where you are going.",
  SAME_STATION: "The start and end must be different stations.",
  UNKNOWN_STATION: "One of these stations is not in the current data.",
};

/** The trip to apply. Uses the existing Trip contract and keeps the rider's profile. */
export function draftToTrip(d: TripDraft, profile: UserProfile, knownIds: ReadonlySet<string>): Trip | null {
  if (draftProblem(d, knownIds) !== null || !d.originId || !d.destinationId) return null;
  return { originId: d.originId, destinationId: d.destinationId, profile };
}

/** True when the draft is not the trip that was last evaluated. */
export function isDirty(d: TripDraft, evaluated: { originId?: string | null; destinationId?: string | null }): boolean {
  return d.originId !== (evaluated.originId ?? null) || d.destinationId !== (evaluated.destinationId ?? null);
}

// ---------------------------------------------------------------------------------------------
// Shared store (module memory, per tab). Map focus requests ride along so the alternative card can
// ask the map to frame stations without the page knowing about it.
// ---------------------------------------------------------------------------------------------

export interface MapFocusRequest {
  /** Stations to frame. */
  ids: string[];
  /** Station whose details to open. */
  openId: string | null;
  /** Element to move keyboard focus to afterwards. */
  focus: "detail" | "check";
  nonce: number;
}

interface State {
  draft: TripDraft;
  /** The evaluated trip the draft was last reset to. */
  base: TripDraft;
  focus: MapFocusRequest | null;
  /** Last change, for the planner's polite live region. */
  announcement: string;
}

let state: State = { draft: EMPTY_DRAFT, base: EMPTY_DRAFT, focus: null, announcement: "" };
const listeners = new Set<() => void>();
let nonce = 0;

function set(next: Partial<State>): void {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

export function dispatchDraft(action: DraftAction, announcement = ""): void {
  const draft = draftReducer(state.draft, action);
  if (action.type === "reset") return set({ draft, base: draft, announcement });
  if (draft === state.draft && !announcement) return;
  set({ draft, announcement });
}

/**
 * True when the rider has picked a trip that is not the one on screen. The draft must differ from both
 * the evaluated trip and the last reset: right after a new result arrives (before the map resets the
 * draft to it) an untouched draft is not a new selection, so nothing flashes "Not checked yet".
 */
export function isPending(s: Pick<State, "draft" | "base">, evaluated: { originId?: string | null; destinationId?: string | null }): boolean {
  return isDirty(s.draft, evaluated) && isDirty(s.draft, s.base);
}

export function requestMapFocus(ids: string[], openId: string | null, focus: MapFocusRequest["focus"] = "detail"): void {
  nonce += 1;
  set({ focus: { ids, openId, focus, nonce } });
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useTripDraft(): State {
  return useSyncExternalStore(subscribe, () => state, () => state);
}
