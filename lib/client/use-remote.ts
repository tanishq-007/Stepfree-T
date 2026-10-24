"use client";
import { useCallback, useEffect, useState } from "react";

export type RemoteState<T> = { phase: "loading" } | { phase: "error" } | { phase: "ready"; data: T };

/**
 * Loads one JSON route. Any failure becomes { phase: "error" } with no server text, so the card shows its own
 * plain-language message and a retry button.
 */
export function useRemote<T>(url: string): { state: RemoteState<T>; retry: () => void } {
  const [state, setState] = useState<RemoteState<T>>({ phase: "loading" });
  const [tick, setTick] = useState(0);
  const retry = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setState({ phase: "loading" });
    (async () => {
      try {
        const res = await fetch(url, { cache: "no-store", signal: controller.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as T;
        if (!controller.signal.aborted) setState({ phase: "ready", data });
      } catch {
        if (!controller.signal.aborted) setState({ phase: "error" });
      }
    })();
    return () => controller.abort();
  }, [url, tick]);

  return { state, retry };
}
