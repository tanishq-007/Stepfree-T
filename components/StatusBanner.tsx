import { CheckCircle2, XCircle, HelpCircle } from "lucide-react";
import type { AccessStatus } from "@/lib/types";

interface Props {
  status: AccessStatus;
  headline?: string | undefined;
  routeLabel?: string | undefined;
  /** Where the answer comes from, e.g. "According to MBTA data updated at 3:05 PM." Read out with the verdict. */
  dataLine?: string | undefined;
}

/**
 * Colour is never the only signal: every state has an icon AND text AND an aria-label.
 * Surfaces keep the original high-contrast status families:
 *   STEP_FREE  green-800-class fill, NOT_STEP_FREE red-800-class fill, UNKNOWN gray-700-class fill,
 * all with white text (documented AA ratios 7.1:1 / 8.3:1 / 10.3:1).
 */
const STYLES: Record<
  AccessStatus,
  { box: string; label: string; Icon: typeof CheckCircle2; aria: string; eyebrow: string }
> = {
  STEP_FREE: {
    box: "bg-status-free",
    label: "Step-free",
    Icon: CheckCircle2,
    aria: "Step-free trip",
    eyebrow: "Verified accessible",
  },
  NOT_STEP_FREE: {
    box: "bg-status-blocked",
    label: "Not step-free",
    Icon: XCircle,
    aria: "Not a step-free trip",
    eyebrow: "Accessibility blocker found",
  },
  UNKNOWN: {
    box: "bg-status-unknown",
    label: "Cannot confirm",
    Icon: HelpCircle,
    aria: "Cannot confirm a step-free trip",
    eyebrow: "Not enough verified data",
  },
};

export default function StatusBanner({ status, headline, routeLabel, dataLine }: Props) {
  const s = STYLES[status];
  const Icon = s.Icon;
  return (
    <section
      aria-label={s.aria}
      data-status={status}
      className={`${s.box} animate-fade-in relative overflow-hidden rounded-3xl p-6 text-white shadow-hero sm:p-8`}
    >
      {/* Decorative depth; purely cosmetic. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-black/10"
      />

      <div className="relative flex items-start gap-4 sm:gap-5">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-white/15 sm:h-20 sm:w-20">
          <Icon className="h-10 w-10 sm:h-12 sm:w-12" strokeWidth={2.25} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-wider text-white/80">{s.eyebrow}</p>
          <h2 className="mt-1 text-4xl font-extrabold leading-none tracking-tight sm:text-6xl">
            {s.label}
          </h2>
          {routeLabel ? (
            <p className="mt-2 text-lg font-semibold text-white/90 sm:text-xl">{routeLabel}</p>
          ) : null}
        </div>
      </div>

      {dataLine ? (
        <p className="relative mt-4 text-base font-semibold text-white/95">{dataLine}</p>
      ) : null}

      {headline ? (
        <p className="relative mt-5 max-w-prose text-lg leading-snug text-white/95">{headline}</p>
      ) : null}
    </section>
  );
}
