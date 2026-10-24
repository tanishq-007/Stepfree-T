"use client";
import { HelpCircle, LifeBuoy, Map as MapIcon, ShieldCheck, TriangleAlert } from "lucide-react";
import type { PlanB, PlanBElevator } from "@/lib/engine/plan-b";
import { requestMapFocus } from "@/lib/client/trip-draft";

interface Props {
  planB: PlanB;
  /** Adds "Show on map" for every backup station (needs the journey map on the page). */
  interactive?: boolean;
  /** Says what Plan B does not cover, e.g. an unchecked transfer station. */
  scopeNote?: string | undefined;
}

const HEADINGS: Record<PlanB["status"], string> = {
  resilient: "Plan B: you have a backup",
  fragile: "Plan B: your trip depends on one elevator",
  cannot_confirm: "Plan B: not fully checked",
};

const ICONS = { resilient: ShieldCheck, fragile: TriangleAlert, cannot_confirm: HelpCircle } as const;
const ICON_TONE: Record<PlanB["status"], string> = {
  resilient: "bg-status-free-tint text-status-free",
  fragile: "bg-amber-100 text-amber-900",
  cannot_confirm: "bg-status-unknown-tint text-status-unknown",
};

function SinglePoint({ e, interactive }: { e: PlanBElevator; interactive: boolean }) {
  const alt = e.alternative;
  // Amber, not red: nothing is broken now. This is the elevator the trip would fail without.
  return (
    <li className="rounded-xl border-l-4 border-l-amber-500 bg-amber-50 p-3 text-base text-ink">
      <p>
        <span className="font-bold">{e.name}</span> at {e.stationName} has no backup.{" "}
        {alt
          ? `If it breaks, use ${alt.name} instead. It is on the same line, and we checked that it works without this elevator.`
          : "If it breaks, we did not find a checked station nearby. Ask a station worker, or plan a different route."}
      </p>
      {interactive && alt ? (
        <button
          type="button"
          onClick={() => requestMapFocus([e.stationId, alt.id], alt.id, "detail")}
          aria-label={`Show ${alt.name}, the backup for ${e.stationName}, on the map`}
          className="btn-secondary mt-2 min-h-[44px] px-4 text-sm"
        >
          <MapIcon className="h-4 w-4" aria-hidden="true" />
          Show on map
        </button>
      ) : null}
    </li>
  );
}

/**
 * Plan B (Layer 2), from lib/engine/plan-b.ts. Shown only while the trip is step-free, so riders know their
 * backup BEFORE anything breaks. A current problem is shown by AlternativeCard instead, never both.
 */
export default function PlanBCard({ planB, interactive = false, scopeNote }: Props) {
  const noBackup = planB.elevators.filter((e) => e.role === "no_backup");
  const unchecked = planB.elevators.filter((e) => e.role === "cannot_check");
  const backed = planB.elevators.filter((e) => e.role === "has_backup");
  const Icon = ICONS[planB.status];
  return (
    <section aria-labelledby="planb-h" className="card animate-fade-in overflow-hidden" data-planb={planB.status}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-brand-100 bg-brand-50 px-4 py-2.5">
        <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-brand-900">
          <LifeBuoy className="h-4 w-4" aria-hidden="true" />
          Plan B if an elevator breaks
        </p>
        <p className="text-xs font-semibold text-brand-900">Not needed right now</p>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-2">
          <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${ICON_TONE[planB.status]}`}>
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <h3 id="planb-h" className="text-lg font-bold text-ink">
            {HEADINGS[planB.status]}
          </h3>
        </div>

        {planB.status === "resilient" ? (
          <p className="mt-3 text-base text-ink">
            If any one elevator at these stations breaks, there is still a step-free way, based on MBTA data. You do not
            need a backup station today.
          </p>
        ) : null}

        {noBackup.length > 0 ? (
          <ul className="mt-3 space-y-2">
            {noBackup.map((e) => (
              <SinglePoint key={e.facilityId} e={e} interactive={interactive} />
            ))}
          </ul>
        ) : null}

        {backed.length > 0 && planB.status !== "resilient" ? (
          <p className="mt-3 text-sm text-ink-soft">
            {backed.length === 1 ? "1 other elevator has" : `${backed.length} other elevators have`} a checked backup.
          </p>
        ) : null}

        {unchecked.length > 0 ? (
          <details className="mt-3">
            <summary className="inline-flex cursor-pointer items-center text-sm font-semibold text-brand-800 underline hover:text-brand-900">
              We could not check a backup for {unchecked.length === 1 ? "1 elevator" : `${unchecked.length} elevators`}
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
              {unchecked.map((e) => (
                <li key={e.facilityId}>
                  {e.name} at {e.stationName}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-sm text-ink-soft">If one of these breaks, check again before you leave, or ask a station worker.</p>
          </details>
        ) : null}

        {scopeNote ? <p className="mt-3 rounded-lg bg-surface-sunken px-3 py-2 text-sm text-ink-soft">{scopeNote}</p> : null}
        <p className="mt-3 text-sm text-ink-soft">We check this by pretending each working elevator breaks, one at a time.</p>
      </div>
    </section>
  );
}
