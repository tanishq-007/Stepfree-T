import { Scale } from "lucide-react";
import type { UserProfile } from "@/lib/types";
import type { ProfileOutcome } from "@/lib/client/types";
import { IMPACT_LABEL, KIND_LABEL, PROFILE_IMPACT, PROFILE_LABEL, PROFILE_SUMMARY, profileDifferences } from "@/lib/engine/profiles";
import { PROFILE_ICON } from "./ProfileSwitcher";
import StatusChip from "./StatusChip";

/**
 * Every profile's verdict on the SAME data, computed by the real engine on the server. Identical
 * results are shown as identical, with the reason; no difference is invented for the demo.
 */
export default function ProfileComparison({ outcomes, current }: { outcomes: ProfileOutcome[]; current: UserProfile }) {
  if (outcomes.length === 0) return null;
  const allSame = outcomes.every((o) => o.displayed === outcomes[0]?.displayed);
  const differ = profileDifferences("wheelchair", "no_stairs");

  return (
    <section aria-labelledby="compare-h" className="card p-5">
      <div className="flex items-center gap-2">
        <Scale className="h-5 w-5 text-brand-700" aria-hidden="true" />
        <h2 id="compare-h" className="text-base font-bold text-ink">
          Same trip, every profile
        </h2>
      </div>
      <ul className="mt-3 divide-y divide-hairline">
        {outcomes.map((o) => {
          const Icon = PROFILE_ICON[o.profile];
          return (
            <li key={o.profile} className="flex items-center justify-between gap-3 py-2.5">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Icon className="h-4 w-4 text-ink-soft" aria-hidden="true" />
                {PROFILE_LABEL[o.profile]}
                {o.profile === current ? <span className="text-xs font-semibold text-brand-800">(you)</span> : null}
              </span>
              <StatusChip status={o.displayed} size="xs" />
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-sm text-ink-soft">
        {allSame
          ? "All three profiles get the same answer here. The alerts on this trip affect every profile the same way."
          : "The profiles disagree here because an alert on this trip is treated differently for one of them."}
      </p>
      <details className="group mt-3">
        <summary className="inline-flex cursor-pointer list-none items-center text-sm font-semibold text-brand-800 underline-offset-2 hover:underline">What each profile changes</summary>
        <ul className="mt-2 space-y-2 text-sm text-ink-soft">
          {outcomes.map((o) => (
            <li key={o.profile}>
              <span className="font-semibold text-ink">{PROFILE_LABEL[o.profile]}:</span> {PROFILE_SUMMARY[o.profile]}
            </li>
          ))}
        </ul>
        <table className="mt-3 w-full text-left text-xs">
          <caption className="sr-only">How each alert type is treated per profile</caption>
          <thead>
            <tr className="text-ink-muted">
              <th scope="col" className="py-1 pr-2 font-semibold">
                Alert type
              </th>
              {outcomes.map((o) => (
                <th key={o.profile} scope="col" className="py-1 pr-2 font-semibold">
                  {PROFILE_LABEL[o.profile]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(Object.keys(KIND_LABEL) as (keyof typeof KIND_LABEL)[]).map((k) => (
              <tr key={k} className={`border-t border-hairline ${differ.includes(k) ? "bg-amber-50" : ""}`}>
                <th scope="row" className="py-1.5 pr-2 font-medium text-ink">
                  {KIND_LABEL[k]}
                </th>
                {outcomes.map((o) => (
                  <td key={o.profile} className="py-1.5 pr-2 text-ink-soft">
                    {IMPACT_LABEL[PROFILE_IMPACT[o.profile][k]]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
