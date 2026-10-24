"use client";
// The map panel: trip planner bar + interactive map + legend + accessible station list + station details,
// with a schematic fallback. Everything shown here is also available as text (planner bar, StationList,
// StationDetail). Picking stations here only edits a draft; nothing is saved until the rider presses
// "Check accessibility", which applies the trip through the page's normal workflow.
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { FlaskConical, List, MapIcon } from "lucide-react";
import type { Trip, UserProfile } from "@/lib/types";
import type { StatusResponse } from "@/lib/client/types";
import { shownStatus } from "@/lib/client/types";
import { useNetwork } from "@/lib/client/use-status";
import { alternativeFromResult, backupsFromPlanB, backupStations } from "@/lib/client/alternative-view";
import { dispatchDraft, draftProblem, draftToTrip, isPending, useTripDraft } from "@/lib/client/trip-draft";
import MapLegend from "./MapLegend";
import StationDetail from "./StationDetail";
import StationList from "./StationList";
import TripPlannerBar from "./TripPlannerBar";
import RouteSchematic from "../RouteSchematic";

const TransitMap = dynamic(() => import("./TransitMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-surface-sunken" role="status" aria-busy="true">
      <span className="text-sm font-semibold text-ink-soft">Loading map…</span>
    </div>
  ),
});

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export default function JourneyMap({
  result,
  checkedAt,
  profile,
  onApplyTrip,
}: {
  result: StatusResponse;
  checkedAt: string;
  /** Profile the planner will use (the one shown in the profile switcher). */
  profile?: UserProfile;
  /** Apply a trip picked on the map. When absent the planner is hidden (read-only map). */
  onApplyTrip?: (trip: Trip) => void;
}) {
  const network = useNetwork();
  const draftState = useTripDraft();
  const { draft, focus, announcement } = draftState;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const [frame, setFrame] = useState<{ ids: string[]; key: string }>({ ids: [], key: "init" });
  const [pendingFocus, setPendingFocus] = useState<"detail" | "check" | null>(null);
  const sectionRef = useRef<HTMLElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const checkButton = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);

  const markers = useMemo(() => result.stations ?? [], [result.stations]);
  const byId = useMemo(() => new Map(markers.map((m) => [m.id, m] as const)), [markers]);
  const knownIds = useMemo(() => new Set(markers.map((m) => m.id)), [markers]);
  const nameOf = (id: string) => byId.get(id)?.name;
  const origin = result.trip.origin;
  const destination = result.trip.destination;
  const transferIds = useMemo(() => (result.journey?.kind === "transfer" ? result.journey.transferStationIds : []), [result.journey]);
  const simulated = result.dataSource === "demo";
  const plan = useMemo(() => alternativeFromResult(result), [result]);
  const altId = plan.kind === "suggested" ? plan.alternative.id : undefined;
  const problemId = plan.kind === "suggested" ? plan.original.id : undefined;
  // planB() backups: where to go IF a single elevator breaks. Never shown together with `altId`.
  const backups = useMemo(() => backupStations(backupsFromPlanB(result)), [result]);
  const backupIds = useMemo(() => [...backups.keys()], [backups]);
  const planner = Boolean(onApplyTrip);
  const dirty = isPending(draftState, { originId: origin?.id, destinationId: destination?.id });
  const plannerProfile = profile ?? result.trip.profile;

  // A new evaluated trip resets the draft to it and frames it (alternative and transfers included).
  const tripKey = `${origin?.id}|${destination?.id}|${result.dataSource}|${result.scenario ?? "real"}`;
  useEffect(() => {
    dispatchDraft({ type: "reset", originId: origin?.id ?? null, destinationId: destination?.id ?? null });
    const blocked = [origin, destination].find((s) => s && byId.get(s.id)?.status === "NOT_STEP_FREE");
    setSelectedId(blocked?.id ?? null);
    setFrame({ ids: [origin?.id, destination?.id, altId, ...backupIds, ...transferIds].filter((x): x is string => Boolean(x)), key: `${tripKey}-${checkedAt}` });
  }, [tripKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-frame on a new check of the same trip (refresh, profile switch) without resetting the draft.
  useEffect(() => {
    if (dirty) return;
    setFrame({ ids: [origin?.id, destination?.id, altId, ...backupIds, ...transferIds].filter((x): x is string => Boolean(x)), key: `${tripKey}-${checkedAt}-${result.trip.profile}` });
  }, [checkedAt, result.trip.profile]); // eslint-disable-line react-hooks/exhaustive-deps

  // A completed new selection frames both ends.
  useEffect(() => {
    if (dirty && draft.originId && draft.destinationId) setFrame({ ids: [draft.originId, draft.destinationId], key: `draft-${draft.originId}-${draft.destinationId}` });
  }, [draft.originId, draft.destinationId]); // eslint-disable-line react-hooks/exhaustive-deps

  // "Show on map" / "Use this station" from the alternative card.
  useEffect(() => {
    if (!focus) return;
    setFrame({ ids: focus.ids, key: `focus-${focus.nonce}` });
    if (focus.openId) setSelectedId(focus.openId);
    setPendingFocus(focus.focus);
    sectionRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  }, [focus?.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!pendingFocus) return;
    const el = pendingFocus === "detail" ? detailHeading.current : checkButton.current;
    if (el) {
      el.focus({ preventScroll: true });
      setPendingFocus(null);
    }
  });

  function selectFromList(id: string) {
    returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedId(id);
    setPendingFocus("detail");
  }

  function pick(end: "origin" | "destination", id: string) {
    const name = nameOf(id) ?? id;
    const next = end === "origin" ? { originId: id, destinationId: draft.destinationId === id ? null : draft.destinationId } : { originId: draft.originId === id ? null : draft.originId, destinationId: id };
    const problem = draftProblem(next, knownIds);
    const tail = problem === null ? " Ready: press Check accessibility." : problem === "MISSING_DESTINATION" ? " Now choose where you are going." : problem === "MISSING_ORIGIN" ? " Now choose where you start." : "";
    dispatchDraft({ type: end === "origin" ? "setOrigin" : "setDestination", id }, `${name} set as your ${end === "origin" ? "start" : "end"}.${tail}`);
  }

  function check() {
    const trip = draftToTrip(draft, plannerProfile, knownIds);
    if (trip && onApplyTrip) onApplyTrip(trip);
  }

  const draftEnd = (id: string) => (id === draft.originId ? "origin" : id === draft.destinationId ? "destination" : null);
  const pinned = [
    ...(draft.originId ? [{ id: draft.originId, role: dirty ? "New start (not checked)" : "Your start" }] : []),
    ...(draft.destinationId ? [{ id: draft.destinationId, role: dirty ? "New end (not checked)" : "Your end" }] : []),
    ...(altId && !dirty ? [{ id: altId, role: "Recommended alternative" }] : []),
    ...(!dirty ? backupIds.map((id) => ({ id, role: "Backup if an elevator fails" })) : []),
    ...(!dirty ? transferIds.map((id) => ({ id, role: "Possible transfer (not checked)" })) : []),
  ];
  const roleOf = new Map(pinned.map((p) => [p.id, p.role] as const));
  const selected = selectedId ? (byId.get(selectedId) ?? null) : null;
  const geometry = network.phase === "ready" ? network.lines : [];
  const lineNote =
    network.phase === "error"
      ? "MBTA line geometry is unavailable right now. Stations are still shown."
      : network.phase === "ready" && network.dataSource !== "live"
        ? "Line geometry from a saved copy of MBTA route data."
        : null;

  if (markers.length === 0) {
    return <RouteSchematic origin={origin} destination={destination} status={shownStatus(result)} alternative={result.alternative} journey={result.journey} />;
  }

  return (
    <section ref={sectionRef} aria-labelledby="map-h" className="card scroll-mt-20 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <MapIcon className="h-5 w-5 text-brand-700" aria-hidden="true" />
          <h2 id="map-h" className="whitespace-nowrap text-base font-bold text-ink">
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

      {planner ? (
        <TripPlannerBar
          ref={checkButton}
          draft={draft}
          nameOf={nameOf}
          knownIds={knownIds}
          profile={plannerProfile}
          dirty={dirty}
          simulated={simulated}
          announcement={announcement}
          onSwap={() => (draft.originId || draft.destinationId) && dispatchDraft({ type: "swap" }, "Start and end swapped.")}
          onClear={() => (draft.originId || draft.destinationId) && dispatchDraft({ type: "clear" }, "Selection cleared. Choose a start station.")}
          onCancel={() => dispatchDraft({ type: "reset", originId: origin?.id ?? null, destinationId: destination?.id ?? null }, "Changes cancelled. Showing your current trip.")}
          onCheck={check}
        />
      ) : null}

      {mapError ? (
        <div className="p-4">
          <RouteSchematic
            origin={origin}
            destination={destination}
            status={shownStatus(result)}
            alternative={result.alternative}
            journey={result.journey}
            note={`${mapError} Showing a simple route diagram instead. Every station is in the station list.`}
          />
        </div>
      ) : (
        <div className="relative h-[22rem] sm:h-[26rem] lg:h-[30rem]">
          <TransitMap
            markers={markers}
            lines={geometry}
            // Route emphasis belongs to the evaluated trip; a new unchecked selection has no verified route.
            journey={dirty ? undefined : result.journey}
            originId={draft.originId ?? undefined}
            destinationId={draft.destinationId ?? undefined}
            alternativeId={dirty ? undefined : altId}
            backupIds={dirty ? [] : backupIds}
            problemId={dirty ? undefined : problemId}
            transferIds={dirty ? [] : transferIds}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setShowList(true);
            }}
            onFail={setMapError}
            frame={frame}
          />
          <p className="pointer-events-none absolute left-2 top-2 max-w-[15rem] rounded-lg bg-white/95 px-2.5 py-1.5 text-[11px] font-medium leading-tight text-ink-soft shadow-card">
            {dirty ? "New selection: not checked yet. No route is drawn until you check it." : "MBTA line geometry is a reference, not a verified itinerary."}
          </p>
        </div>
      )}

      <div className="space-y-3 border-t border-hairline p-4">
        <MapLegend simulated={simulated} alternative={Boolean(altId) && !dirty} backup={backupIds.length > 0 && !dirty} transfer={transferIds.length > 0 && !dirty} />
        {lineNote ? <p className="text-xs text-ink-muted">{lineNote}</p> : null}
        {!dirty && result.journey?.kind === "transfer" ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This trip needs a change of line{result.journey.transferStations?.length ? ` (likely at ${result.journey.transferStations.map((s) => s.name).join(" or ")})` : ""}. Transfer stations are shown but not checked.
          </p>
        ) : !dirty && result.journey?.kind === "unknown" ? (
          <p className="rounded-lg bg-surface-sunken px-3 py-2 text-sm text-ink-soft">We could not work out how these stations connect, so no route is drawn.</p>
        ) : null}
        {planner && simulated ? (
          <p className="rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-900">
            You are exploring simulated stations. Checking a new trip turns the simulation off and uses real MBTA data for every station.
          </p>
        ) : null}

        {selected ? (
          <StationDetail
            marker={selected}
            alerts={result.stationAlerts ?? []}
            role={roleOf.get(selected.id)}
            dataSource={result.dataSource}
            fetchedAt={result.fetchedAt}
            headingRef={detailHeading}
            draftEnd={planner ? draftEnd(selected.id) : null}
            onStartHere={planner ? () => pick("origin", selected.id) : undefined}
            onGoHere={planner ? () => pick("destination", selected.id) : undefined}
            suggestion={plan.kind === "suggested" && !dirty && selected.id === plan.alternative.id ? { why: plan.why, evidence: plan.alternative.evidence, instead: plan.original.name } : null}
            backupFor={!dirty ? (backups.get(selected.id) ?? null) : null}
            onClose={() => {
              setSelectedId(null);
              returnFocus.current?.focus();
              returnFocus.current = null;
            }}
          />
        ) : planner ? (
          <p className="text-sm text-ink-muted">Select a station on the map or in the station list to see its details and plan a trip from it.</p>
        ) : null}

        <div id="station-list-panel" hidden={!showList}>
          <StationList markers={markers} pinned={pinned} selectedId={selectedId} onSelect={selectFromList} />
        </div>
      </div>
    </section>
  );
}
