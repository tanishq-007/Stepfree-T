import { HelpCircle, ShieldCheck, TriangleAlert } from "lucide-react";
import type { PlanB, PlanBElevator } from "@/lib/engine/plan-b";

interface Props {
  planB: PlanB;
}

const HEADINGS: Record<PlanB["status"], string> = {
  resilient: "Plan B: you have a backup",
  fragile: "Plan B: your trip depends on one elevator",
  cannot_confirm: "Plan B: not fully checked",
};

const ICONS = { resilient: ShieldCheck, fragile: TriangleAlert, cannot_confirm: HelpCircle } as const;

function SinglePoint({ e }: { e: PlanBElevator }) {
  return (
    <li className="rounded-xl border-l-4 border-l-status-blocked bg-status-blocked-tint p-3 text-base text-ink">
      <span className="font-bold">{e.name}</span> at {e.stationName} has no backup.{" "}
      {e.alternative
        ? `If it breaks, use ${e.alternative.name} instead. It is on the same line, and we checked that it works without this elevator.`
        : "If it breaks, we did not find a checked station nearby. Ask a station worker, or plan a different route."}
    </li>
  );
}

/** Plan B (Layer 2). Shown on a calm day, so riders know their backup before anything breaks. */
export default function PlanBCard({ planB }: Props) {
  const noBackup = planB.elevators.filter((e) => e.role === "no_backup");
  const unchecked = planB.elevators.filter((e) => e.role === "cannot_check");
  const backed = planB.elevators.filter((e) => e.role === "has_backup");
  const Icon = ICONS[planB.status];
  return (
    <section aria-labelledby="planb-h" className="card animate-fade-in p-5" data-planb={planB.status}>
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-800">
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
            <SinglePoint key={e.facilityId} e={e} />
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

      <p className="mt-3 text-sm text-ink-soft">We check this by pretending each working elevator breaks, one at a time.</p>
    </section>
  );
}
