"use client";
import { useCallback, useEffect, useState } from "react";
import type { Trip, UserProfile } from "@/lib/types";
import type { ExplainContext } from "@/lib/api/schemas";
import type { DemoScenarioId, ExplainPayload, StatusResponse } from "./types";

export type StatusState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | {
      phase: "ready";
      result: StatusResponse;
      explanation: ExplainPayload | null;
      checkedAt: string;
      /** A new check is in flight; the previous result stays on screen (no flash). */
      refreshing: boolean;
      /** The explanation for THIS result is still loading. */
      explaining: boolean;
    };

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message = body && typeof body === "object" && "error" in body ? String((body as { error: unknown }).error) : `Request failed (${res.status})`;
    throw new Error(message);
  }
  return body as T;
}

/** What the explainer is told about the journey. Only names the rider can already see. */
export function explainContext(result: StatusResponse): ExplainContext {
  const j = result.journey;
  return {
    originName: result.trip.origin?.name,
    destinationName: result.trip.destination?.name,
    route: j?.kind,
    transferStationNames: j?.kind === "transfer" ? (j.transferStations ?? []).map((s) => s.name).slice(0, 10) : undefined,
    stationNames: result.stations?.map((s) => s.name).slice(0, 300),
  };
}

/**
 * Loads the trip status (real or demo), then the plain-language explanation.
 * The verdict is shown as soon as it arrives; the explanation fills in after. Explanation failure never
 * hides the status. While a new check runs, the previous result stays visible with `refreshing: true`.
 */
export function useStatus(
  trip: Trip | null,
  demo: DemoScenarioId | null,
  demoProfile: UserProfile = "wheelchair",
): { state: StatusState; refresh: () => void } {
  const [state, setState] = useState<StatusState>({ phase: "idle" });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  const originId = trip?.originId;
  const destinationId = trip?.destinationId;
  const profile = trip?.profile;

  useEffect(() => {
    const controller = new AbortController();
    const url = demo
      ? `/api/demo?${new URLSearchParams({ scenario: demo, profile: demoProfile }).toString()}`
      : originId && destinationId && profile
        ? `/api/status?${new URLSearchParams({ origin: originId, destination: destinationId, profile }).toString()}`
        : null;
    if (!url) {
      setState({ phase: "idle" });
      return () => controller.abort();
    }
    // Keep the previous result on screen ONLY when it is the same kind of data (simulated vs real).
    // Switching demo off must never leave a simulated verdict under the real "Your trip" heading.
    setState((prev) =>
      prev.phase === "ready" && (prev.result.dataSource === "demo") === Boolean(demo) ? { ...prev, refreshing: true } : { phase: "loading" },
    );
    (async () => {
      try {
        const result = await getJson<StatusResponse>(url, { signal: controller.signal });
        if (controller.signal.aborted) return;
        setState({ phase: "ready", result, explanation: null, checkedAt: new Date().toISOString(), refreshing: false, explaining: true });

        const explainProfile = result.trip.profile;
        let explanation: ExplainPayload | null = null;
        try {
          explanation = await getJson<ExplainPayload>("/api/explain", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ tripResult: stripForExplain(result), profile: explainProfile, context: explainContext(result) }),
            signal: controller.signal,
          });
        } catch {
          explanation = null;
        }
        if (controller.signal.aborted) return;
        setState((prev) => (prev.phase === "ready" && prev.result === result ? { ...prev, explanation, explaining: false } : prev));
      } catch (err) {
        if (controller.signal.aborted) return;
        setState({ phase: "error", message: err instanceof Error ? err.message : "Something went wrong." });
      }
    })();
    return () => controller.abort();
  }, [originId, destinationId, profile, demo, demoProfile, tick]);

  return { state, refresh };
}

/** /api/explain validates a plain TripResult. Send only those fields (keeps the request small). */
function stripForExplain(r: StatusResponse) {
  const { status, reasons, blockingAlerts, infoAlerts, alternative, dataSource, fetchedAt, isStale } = r;
  // The UI shows the capped verdict; the explainer must explain the same verdict and reasons.
  const shown = r.display?.status ?? status;
  return { status: shown, reasons: [...reasons, ...(r.display?.capReasons ?? [])], blockingAlerts, infoAlerts, alternative, dataSource, fetchedAt, isStale };
}

/** Station network geometry for the map, fetched once per page load. */
export interface NetworkLine {
  id: string;
  routeId: string;
  line: string;
  name: string;
  coordinates: [number, number][];
  stationIds: string[];
}
export type NetworkState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; lines: NetworkLine[]; dataSource: string; fetchedAt: string };

let networkPromise: Promise<NetworkState> | null = null;

export function useNetwork(): NetworkState {
  const [state, setState] = useState<NetworkState>({ phase: "loading" });
  useEffect(() => {
    let alive = true;
    networkPromise ??= getJson<{ lines: NetworkLine[]; dataSource: string; fetchedAt: string }>("/api/network")
      .then((b): NetworkState => ({ phase: "ready", lines: b.lines, dataSource: b.dataSource, fetchedAt: b.fetchedAt }))
      .catch((e: unknown): NetworkState => {
        networkPromise = null; // allow a retry on the next mount
        return { phase: "error", message: e instanceof Error ? e.message : "Line geometry unavailable" };
      });
    void networkPromise.then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);
  return state;
}
