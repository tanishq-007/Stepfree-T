"use client";
import { Accessibility, Baby, Footprints } from "lucide-react";
import type { UserProfile } from "@/lib/types";
import { PROFILE_LABEL } from "@/lib/engine/profiles";

export const PROFILE_ICON: Record<UserProfile, typeof Accessibility> = { wheelchair: Accessibility, stroller: Baby, no_stairs: Footprints };
const ORDER: UserProfile[] = ["wheelchair", "stroller", "no_stairs"];

/** Segmented radio group. Switching re-runs the engine for the same trip; stations are not touched. */
export default function ProfileSwitcher({ value, onChange, disabled }: { value: UserProfile; onChange: (p: UserProfile) => void; disabled?: boolean }) {
  return (
    <fieldset disabled={disabled}>
      <legend className="eyebrow mb-1.5">Mobility profile</legend>
      <div className="grid grid-cols-3 gap-1 rounded-2xl border border-hairline bg-surface-sunken p-1">
        {ORDER.map((p) => {
          const Icon = PROFILE_ICON[p];
          const on = value === p;
          return (
            <label
              key={p}
              className={`flex min-h-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-xl px-2 text-sm font-semibold transition-colors has-[:focus-visible]:outline has-[:focus-visible]:outline-[3px] has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-700 ${
                on ? "bg-white text-brand-900 shadow-card" : "text-ink-soft hover:text-ink"
              }`}
            >
              <input type="radio" name="result-profile" value={p} checked={on} onChange={() => onChange(p)} className="sr-only" />
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">{PROFILE_LABEL[p]}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
