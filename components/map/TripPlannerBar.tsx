"use client";
import { forwardRef } from "react";
import { ArrowDownUp, ArrowRight, Flag, FlaskConical, MapPin, RotateCcw, Search, X } from "lucide-react";
import type { UserProfile } from "@/lib/types";
import { PROFILE_LABEL } from "@/lib/engine/profiles";
import { draftProblem, PROBLEM_TEXT, type TripDraft } from "@/lib/client/trip-draft";
import { PROFILE_ICON } from "../ProfileSwitcher";

interface Props {
  draft: TripDraft;
  nameOf: (id: string) => string | undefined;
  knownIds: ReadonlySet<string>;
  profile: UserProfile;
  /** The draft differs from the trip whose verdict is on screen. */
  dirty: boolean;
  /** Demo data is on screen: checking leaves the simulation. */
  simulated: boolean;
  announcement: string;
  onSwap: () => void;
  onClear: () => void;
  onCancel: () => void;
  onCheck: () => void;
}

/**
 * Trip selection made on the map. It only shows and edits the draft; checking applies it through the
 * page's normal trip workflow (saveTrip + /api/status). Buttons use aria-disabled, not disabled, so
 * keyboard focus is never dropped when a selection becomes incomplete.
 */
const TripPlannerBar = forwardRef<HTMLButtonElement, Props>(function TripPlannerBar(p, checkRef) {
  const problem = draftProblem(p.draft, p.knownIds);
  const canCheck = problem === null && p.dirty;
  const ProfileIcon = PROFILE_ICON[p.profile];
  const hint = problem ? PROBLEM_TEXT[problem] : !p.dirty ? "This is the trip shown below. Pick other stations to plan a new one." : p.simulated ? "Checking leaves the simulation and uses real MBTA data." : "Not checked yet. Press Check accessibility to get a verdict for this trip.";

  return (
    <section aria-labelledby="planner-h" className="border-b border-hairline bg-surface-base px-4 py-3">
      <h3 id="planner-h" className="sr-only">
        Plan a trip on the map
      </h3>
      <div className="flex flex-wrap items-center gap-2">
        <End role="Start" Icon={MapPin} name={p.draft.originId ? p.nameOf(p.draft.originId) : undefined} />
        <button
          type="button"
          onClick={p.onSwap}
          aria-label="Swap start and end stations"
          aria-disabled={!p.draft.originId && !p.draft.destinationId}
          className="btn-ghost h-11 w-11 shrink-0 rounded-full p-0 aria-disabled:opacity-40"
        >
          <ArrowDownUp className="h-4 w-4 sm:rotate-90" aria-hidden="true" />
        </button>
        <End role="End" Icon={Flag} name={p.draft.destinationId ? p.nameOf(p.draft.destinationId) : undefined} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="chip border border-hairline bg-white px-2.5 py-1 text-xs text-ink-soft">
          <ProfileIcon className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">Mobility profile: </span>
          {PROFILE_LABEL[p.profile]}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {p.dirty ? (
            <button type="button" onClick={p.onCancel} className="btn-ghost px-3 text-sm">
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
              Cancel changes
            </button>
          ) : null}
          <button type="button" onClick={p.onClear} aria-disabled={!p.draft.originId && !p.draft.destinationId} className="btn-ghost px-3 text-sm aria-disabled:opacity-40">
            <X className="h-4 w-4" aria-hidden="true" />
            Clear
          </button>
          <button
            ref={checkRef}
            type="button"
            onClick={() => canCheck && p.onCheck()}
            aria-disabled={!canCheck}
            aria-describedby="planner-hint"
            className={`btn min-h-[44px] px-4 text-sm ${canCheck ? (p.simulated ? "bg-violet-700 text-white hover:bg-violet-800" : "bg-brand-700 text-white hover:bg-brand-800") : "cursor-not-allowed bg-surface-sunken text-ink-muted"}`}
          >
            {p.simulated && canCheck ? <FlaskConical className="h-4 w-4" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
            {p.simulated && canCheck ? "Leave simulation and check" : "Check accessibility"}
          </button>
        </div>
      </div>
      <p id="planner-hint" className={`mt-2 text-xs ${p.dirty && !problem ? "font-semibold text-amber-900" : "text-ink-muted"}`}>
        {hint}
      </p>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {p.announcement}
      </p>
    </section>
  );
});

export default TripPlannerBar;

function End({ role, Icon, name }: { role: "Start" | "End"; Icon: typeof MapPin; name: string | undefined }) {
  return (
    <div className={`flex min-h-[44px] min-w-0 flex-1 basis-40 items-center gap-2 rounded-xl border px-3 py-1.5 ${name ? "border-hairline bg-white" : "border-dashed border-slate-300 bg-white/60"}`}>
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${role === "Start" ? "bg-ink text-white" : "bg-brand-700 text-white"}`}>
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[11px] font-bold uppercase tracking-wide text-ink-muted">{role}</span>
        <span className={`block truncate text-sm font-bold ${name ? "text-ink" : "font-medium text-ink-muted"}`}>{name ?? "Not chosen"}</span>
      </span>
      {name ? null : <ArrowRight className="ml-auto hidden h-4 w-4 text-ink-muted" aria-hidden="true" />}
    </div>
  );
}
