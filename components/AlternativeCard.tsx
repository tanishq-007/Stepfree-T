"use client";
import { useState } from "react";
import { ArrowRight, LifeBuoy, Map as MapIcon, Replace, SearchX, TrainFront } from "lucide-react";
import type { Station } from "@/lib/types";
import type { StatusResponse } from "@/lib/client/types";
import { lineStyle } from "@/lib/client/lines";
import { alternativeAction, alternativeFromResult, type AlternativeView } from "@/lib/client/alternative-view";
import { dispatchDraft, requestMapFocus } from "@/lib/client/trip-draft";
import StatusChip from "./StatusChip";

interface Props {
  station: Station;
  instead?: string | undefined;
  /** Richer view (original vs alternative). When absent, the simple card is shown. */
  view?: Extract<AlternativeView, { kind: "suggested" }>;
  /** Enables "Show on map" and "Use this station for my trip". */
  interactive?: boolean;
}

function LineChips({ lines }: { lines: string[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {lines.map((l) => {
        const s = lineStyle(l);
        return (
          <span key={l} className={`chip px-2 py-0 text-xs ${s.bg} ${s.text}`}>
            {s.label}
          </span>
        );
      })}
    </span>
  );
}

/** Shared header of both Plan B cards, so "right now" and "if an elevator breaks" read as one feature. */
function PlanBHeader({ tone, children }: { tone: "now" | "none"; children: React.ReactNode }) {
  const cls = tone === "now" ? "border-green-200 bg-status-free-tint text-status-free" : "border-hairline bg-surface-sunken text-ink-soft";
  return (
    <div className={`flex items-center gap-2 border-b px-4 py-2.5 ${cls}`}>
      <LifeBuoy className="h-4 w-4" aria-hidden="true" />
      <p className="text-sm font-bold uppercase tracking-wide">{children}</p>
    </div>
  );
}

/**
 * The engine's alternative station for a problem RIGHT NOW (Plan B for right now). It displays a
 * recommendation; it never makes one. "Use this station" only edits the map planner's draft; the rider
 * must check it before it is verified. The hypothetical "if an elevator breaks" Plan B is PlanBCard.
 */
export default function AlternativeCard({ station, instead, view, interactive = false }: Props) {
  const [used, setUsed] = useState(false);
  const other = view ? (view.original.role === "origin" ? "end" : "start") : null;

  return (
    <section aria-labelledby="alt-heading" className="card animate-fade-in overflow-hidden border-status-free/30">
      <PlanBHeader tone="now">Plan B for right now</PlanBHeader>

      {view ? (
        <div className="space-y-3 p-4">
          <h3 id="alt-heading" className="text-lg font-bold text-ink">
            {`Try ${station.name} instead of ${instead ?? view.original.name}`}
          </h3>
          <div className="grid gap-2 sm:grid-cols-[1fr,auto,1fr] sm:items-stretch">
            <div className="rounded-xl border border-red-200 bg-status-blocked-tint/60 p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">Your {view.original.role === "origin" ? "start" : "end"}</p>
              <p className="text-lg font-extrabold text-ink">{view.original.name}</p>
              <StatusChip status={view.original.status} size="xs" />
              {view.original.issue ? <p className="mt-1.5 text-xs leading-snug text-ink-soft">{view.original.issue}</p> : null}
            </div>
            <ArrowRight className="mx-auto h-5 w-5 rotate-90 self-center text-ink-muted sm:rotate-0" aria-hidden="true" />
            <div className="rounded-xl border-2 border-status-free bg-white p-3">
              <p className="text-[11px] font-bold uppercase tracking-wide text-status-free">Suggested alternative</p>
              <p className="flex items-center gap-1.5 text-lg font-extrabold text-ink">
                <TrainFront className="h-4 w-4 text-ink-soft" aria-hidden="true" />
                {view.alternative.name}
              </p>
              <div className="flex flex-wrap items-center gap-1">
                <StatusChip status={view.alternative.status} size="xs" />
                <LineChips lines={view.alternative.lines} />
              </div>
            </div>
          </div>

          <p className="text-sm text-ink-soft">{view.why}</p>
          <details className="group">
            <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center text-sm font-semibold text-brand-800">Evidence for {view.alternative.name}</summary>
            <ul className="list-disc space-y-0.5 pl-5 text-sm text-ink-soft">
              {view.alternative.evidence.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </details>

          {interactive ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => requestMapFocus([view.original.id, view.alternative.id], view.alternative.id, "detail")}
                aria-label={`Show ${view.alternative.name} and ${view.original.name} on the map`}
                className="btn-secondary min-h-[44px] text-sm"
              >
                <MapIcon className="h-4 w-4" aria-hidden="true" />
                Show on map
              </button>
              <button
                type="button"
                onClick={() => {
                  const action = alternativeAction(view);
                  if (!action) return;
                  dispatchDraft(action, `${view.alternative.name} set as your ${view.original.role === "origin" ? "start" : "end"}. Not checked yet: press Check accessibility.`);
                  requestMapFocus([view.alternative.id], null, "check");
                  setUsed(true);
                }}
                aria-label={`Use ${view.alternative.name} for my trip instead of ${view.original.name}. You will need to check the new trip.`}
                className="btn-primary min-h-[44px] text-sm"
              >
                <Replace className="h-4 w-4" aria-hidden="true" />
                Use this station for my trip
              </button>
            </div>
          ) : null}
          {used ? (
            <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
              {view.alternative.name} is now your new {view.original.role === "origin" ? "start" : "end"} in the trip planner, with the same {other} station. It is not checked yet: press Check accessibility on the map. Your saved trip has not changed.
            </p>
          ) : null}
        </div>
      ) : (
        <div className="p-4">
          <h3 id="alt-heading" className="sr-only">
            Try this station instead
          </h3>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface-sunken text-ink-soft">
              <TrainFront className="h-6 w-6" aria-hidden="true" />
            </span>
            <p className="text-2xl font-extrabold text-ink">{station.name}</p>
          </div>
          <div className="mt-3">
            <LineChips lines={station.lines} />
          </div>
          <p className="mt-3 text-base text-ink-soft">
            {instead ? `Use ${station.name} instead of ${instead}. ` : ""}
            The MBTA lists it as accessible, and we found no problems there just now.
          </p>
        </div>
      )}
    </section>
  );
}

/** Page-level entry: the comparison card when the engine returned an alternative, an honest note when not. */
export function AlternativePanel({ result, interactive }: { result: StatusResponse; interactive: boolean }) {
  const view = alternativeFromResult(result);
  if (view.kind === "not-needed") return null;
  if (view.kind === "none") {
    return (
      <section aria-labelledby="no-alt-h" className="card overflow-hidden">
        <PlanBHeader tone="none">Plan B for right now</PlanBHeader>
        <div className="flex items-start gap-3 p-4">
          <SearchX className="mt-0.5 h-5 w-5 shrink-0 text-ink-soft" aria-hidden="true" />
          <div>
            <h3 id="no-alt-h" className="text-base font-bold text-ink">
              No Plan B station
            </h3>
            <p className="mt-0.5 text-sm text-ink-soft">{view.message} Ask a station worker before you rely on this trip.</p>
          </div>
        </div>
      </section>
    );
  }
  const station = result.alternative;
  if (!station) return null;
  return <AlternativeCard station={station} instead={view.original.name} view={view} interactive={interactive} />;
}
