"use client";
import { CircleDashed, FlaskConical, RefreshCw, RotateCcw, Search } from "lucide-react";
import type { AccessStatus, UserProfile } from "@/lib/types";
import { PROFILE_LABEL } from "@/lib/engine/profiles";
import { draftProblem, PROBLEM_TEXT, type TripDraft } from "@/lib/client/trip-draft";
import StatusChip from "./StatusChip";

interface Props {
  draft: TripDraft;
  nameOf: (id: string) => string | undefined;
  knownIds: ReadonlySet<string>;
  profile: UserProfile;
  /** Simulated data is on screen: checking leaves the simulation first. */
  simulated: boolean;
  /** This selection is being checked right now. */
  checking: boolean;
  /** The trip whose verdict this card replaces, so the rider can still see what they last checked. */
  last: { label: string; status: AccessStatus } | null;
  onCheck: () => void;
  onCancel: () => void;
}

/**
 * Stands in for the verdict while the rider has picked stations that have not been checked. A new trip is
 * never shown with the previous trip's verdict: it is "Not checked yet" until the engine has evaluated it.
 */
export default function PendingTripCard(p: Props) {
  const problem = draftProblem(p.draft, p.knownIds);
  const ready = problem === null;
  const from = p.draft.originId ? (p.nameOf(p.draft.originId) ?? p.draft.originId) : null;
  const to = p.draft.destinationId ? (p.nameOf(p.draft.destinationId) ?? p.draft.destinationId) : null;
  const route = from && to ? `${from} to ${to}` : from ? `From ${from}` : to ? `To ${to}` : "New trip";

  return (
    <section aria-labelledby="pending-h" data-pending="true" className="animate-fade-in rounded-3xl border-2 border-dashed border-slate-400 bg-white p-5 shadow-card sm:p-6">
      <p className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-ink-soft">
        {p.checking ? <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CircleDashed className="h-4 w-4" aria-hidden="true" />}
        {p.checking ? "Checking now" : "Not checked yet"}
      </p>
      <h2 id="pending-h" className="mt-1 text-2xl font-extrabold leading-tight tracking-tight text-ink">
        {route}
      </h2>
      <p className="mt-2 text-base text-ink-soft">
        {p.checking
          ? "Getting the latest MBTA data for this trip."
          : ready
            ? `We have not checked this trip yet, so we cannot say if it is step-free. Profile: ${PROFILE_LABEL[p.profile]}.`
            : PROBLEM_TEXT[problem]}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => ready && !p.checking && p.onCheck()}
          aria-disabled={!ready || p.checking}
          className={`btn min-h-[44px] px-5 ${ready && !p.checking ? (p.simulated ? "bg-violet-700 text-white hover:bg-violet-800" : "bg-brand-700 text-white hover:bg-brand-800") : "cursor-not-allowed bg-surface-sunken text-ink-muted"}`}
        >
          {p.simulated && ready ? <FlaskConical className="h-5 w-5" aria-hidden="true" /> : <Search className="h-5 w-5" aria-hidden="true" />}
          {p.simulated && ready ? "Leave simulation and check" : "Check accessibility"}
        </button>
        <button type="button" onClick={p.onCancel} className="btn-ghost px-4">
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Cancel changes
        </button>
      </div>

      {p.last ? (
        <p className="mt-4 flex flex-wrap items-center gap-2 border-t border-hairline pt-3 text-sm text-ink-soft">
          <span>
            Last checked: <span className="font-semibold text-ink">{p.last.label}</span>
          </span>
          <StatusChip status={p.last.status} size="xs" />
        </p>
      ) : null}
    </section>
  );
}
