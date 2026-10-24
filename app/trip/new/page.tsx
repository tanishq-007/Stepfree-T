"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, AlertTriangle, RefreshCw } from "lucide-react";
import TripForm from "@/components/TripForm";
import { setDemoScenario } from "@/lib/client/demo-store";
import { loadTrip, saveTrip } from "@/lib/client/storage";
import type { Station, Trip } from "@/lib/types";

type Load =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "ready"; stations: Station[] };

function FormSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-busy="true">
      <span className="sr-only">Loading stations…</span>
      <div className="skeleton h-64 rounded-2xl" />
      <div className="skeleton h-44 rounded-2xl" />
      <div className="skeleton h-14 rounded-xl" />
    </div>
  );
}

export default function NewTripPage() {
  const router = useRouter();
  const [load, setLoad] = useState<Load>({ phase: "loading" });
  const [initial, setInitial] = useState<Trip | null>(null);

  const fetchStations = useCallback(async () => {
    setLoad({ phase: "loading" });
    try {
      const res = await fetch("/api/stations", { cache: "no-store" });
      const body = (await res.json()) as { stations?: Station[]; error?: string };
      if (!res.ok || !body.stations) throw new Error(body.error ?? `Request failed (${res.status})`);
      setLoad(
        body.stations.length > 0
          ? { phase: "ready", stations: body.stations }
          : { phase: "error", message: "The station list is empty." },
      );
    } catch (err) {
      setLoad({ phase: "error", message: err instanceof Error ? err.message : "Could not load stations." });
    }
  }, []);

  useEffect(() => {
    setInitial(loadTrip());
    void fetchStations();
  }, [fetchStations]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-2">
        <Link href="/" className="btn-ghost -ml-3 inline-flex text-sm">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Back to home
        </Link>
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          Plan your accessible trip
        </h1>
        <p className="text-ink-soft">
          Save one trip. We check live MBTA data and tell you, in plain words, whether it is
          step-free right now.
        </p>
      </div>

      {load.phase === "loading" ? <FormSkeleton /> : null}

      {load.phase === "error" ? (
        <div className="space-y-3">
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border-2 border-status-blocked bg-status-blocked-tint p-3 text-base text-status-blocked"
          >
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <span>We could not load the station list. {load.message}</span>
          </p>
          <button type="button" onClick={() => void fetchStations()} className="btn-primary">
            <RefreshCw className="h-5 w-5" aria-hidden="true" />
            Try again
          </button>
        </div>
      ) : null}

      {load.phase === "ready" ? (
        <TripForm
          stations={load.stations}
          initial={initial}
          onSave={(trip) => {
            saveTrip(trip);
            // Saving a real trip leaves the simulator, so the rider sees their own trip, never simulated data.
            setDemoScenario(null);
            router.push("/");
          }}
        />
      ) : null}
    </div>
  );
}
