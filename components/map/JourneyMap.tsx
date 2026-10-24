"use client";
// The map panel: interactive map + legend + accessible station list + station details, with a
// schematic fallback. Everything shown here is also available as text (StationList / StationDetail).
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { FlaskConical, List, MapIcon } from "lucide-react";
import type { StatusResponse } from "@/lib/client/types";
import { shownStatus } from "@/lib/client/types";
import { useNetwork } from "@/lib/client/use-status";
import MapLegend from "./MapLegend";
import StationDetail from "./StationDetail";
import StationList from "./StationList";
import RouteSchematic from "../RouteSchematic";

const TransitMap = dynamic(() => import("./TransitMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-surface-sunken" role="status" aria-busy="true">
      <span className="text-sm font-semibold text-ink-soft">Loading map…</span>
    </div>
  ),
});

export default function JourneyMap({ result, checkedAt }: { result: StatusResponse; checkedAt: string }) {
  const network = useNetwork();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);

  const markers = useMemo(() => result.stations ?? [], [result.stations]);
  const origin = result.trip.origin;
  const destination = result.trip.destination;
  const alternative = result.alternative;
  const transferIds = useMemo(() => (result.journey?.kind === "transfer" ? result.journey.transferStationIds : []), [result.journey]);
  const simulated = result.dataSource === "demo";

  // The station worth looking at first: the problem station when there is one.
  const problemId = useMemo(() => {
    const blocked = [origin, destination].find((s) => s && markers.find((m) => m.id === s.id)?.status === "NOT_STEP_FREE");
    return blocked?.id ?? null;
  }, [origin, destination, markers]);
  useEffect(() => setSelectedId(problemId), [problemId, result.scenario, result.trip.profile]);

  const pinned = [
    ...(origin ? [{ id: origin.id, role: "Your start" }] : []),
    ...(destination ? [{ id: destination.id, role: "Your end" }] : []),
    ...(alternative ? [{ id: alternative.id, role: "Suggested alternative" }] : []),
    ...transferIds.map((id) => ({ id, role: "Possible transfer (not checked)" })),
  ];
  const roleOf = new Map(pinned.map((p) => [p.id, p.role] as const));
  const selected = markers.find((m) => m.id === selectedId) ?? null;
  const geometry = network.phase === "ready" ? network.lines : [];
  const lineNote =
    network.phase === "error"
      ? "MBTA line geometry is unavailable right now. Stations are still shown."
      : network.phase === "ready" && network.dataSource !== "live"
        ? "Line geometry from a saved copy of MBTA route data."
        : null;

  if (markers.length === 0) {
    return <RouteSchematic origin={origin} destination={destination} status={shownStatus(result)} alternative={alternative} journey={result.journey} />;
  }

  return (
    <section aria-labelledby="map-h" className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-3">
        <div className="flex items-center gap-2">
          <MapIcon className="h-5 w-5 text-brand-700" aria-hidden="true" />
          <h2 id="map-h" className="text-base font-bold text-ink">
            Journey map
          </h2>
          {simulated ? (
            <span className="chip bg-violet-100 px-2 py-0 text-xs font-extrabold uppercase tracking-wider text-violet-900">
              <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
              Simulated scenario
            </span>
          ) : null}
        </div>
        <button type="button" onClick={() => setShowList((v) => !v)} aria-expanded={showList} aria-controls="station-list-panel" className="btn-ghost px-3 text-sm">
          <List className="h-4 w-4" aria-hidden="true" />
          {showList ? "Hide station list" : "Station list"}
        </button>
      </div>

      {mapError ? (
        <div className="p-4">
          <RouteSchematic
            origin={origin}
            destination={destination}
            status={shownStatus(result)}
            alternative={alternative}
            journey={result.journey}
            note={`${mapError} Showing a simple route diagram instead. Every station is in the station list.`}
          />
        </div>
      ) : (
        <div className="relative h-[22rem] sm:h-[26rem] lg:h-[30rem]">
          <TransitMap
            markers={markers}
            lines={geometry}
            journey={result.journey}
            originId={origin?.id}
            destinationId={destination?.id}
            alternativeId={alternative?.id}
            transferIds={transferIds}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setShowList(true);
            }}
            onFail={setMapError}
            fitKey={`${origin?.id}-${destination?.id}-${result.scenario ?? "real"}-${checkedAt}`}
          />
          <p className="pointer-events-none absolute left-2 top-2 max-w-[15rem] rounded-lg bg-white/95 px-2.5 py-1.5 text-[11px] font-medium leading-tight text-ink-soft shadow-card">
            MBTA line geometry is a reference, not a verified itinerary.
          </p>
        </div>
      )}

      <div className="space-y-3 border-t border-hairline p-4">
        <MapLegend simulated={simulated} />
        {lineNote ? <p className="text-xs text-ink-muted">{lineNote}</p> : null}
        {result.journey?.kind === "transfer" ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This trip needs a change of line{result.journey.transferStations?.length ? ` (likely at ${result.journey.transferStations.map((s) => s.name).join(" or ")})` : ""}. Transfer stations are shown but not checked.
          </p>
        ) : result.journey?.kind === "unknown" ? (
          <p className="rounded-lg bg-surface-sunken px-3 py-2 text-sm text-ink-soft">We could not work out how these stations connect, so no route is drawn.</p>
        ) : null}

        {selected ? (
          <StationDetail marker={selected} alerts={result.stationAlerts ?? []} role={roleOf.get(selected.id)} dataSource={result.dataSource} fetchedAt={result.fetchedAt} onClose={() => setSelectedId(null)} />
        ) : null}

        <div id="station-list-panel" hidden={!showList}>
          <StationList markers={markers} pinned={pinned} selectedId={selectedId} onSelect={setSelectedId} />
        </div>
      </div>
    </section>
  );
}
