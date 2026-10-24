import { CheckCircle2, FlaskConical, HelpCircle, XCircle } from "lucide-react";
import type { AccessStatus } from "@/lib/types";

interface Props {
  status: AccessStatus;
  headline?: string | undefined;
  routeLabel?: string | undefined;
  /** Where the answer comes from, e.g. "According to MBTA data updated at 3:05 PM." Read out with the verdict. */
  dataLine?: string | undefined;
  /** Show the persistent SIMULATED SCENARIO label (demo data). */
  simulated?: boolean;
  /** Reason text when the shown verdict was made more cautious than the engine's (journey cap). */
  capNote?: string | undefined;
}

/**
 * Colour is never the only signal: every state has an icon AND text AND an aria-label.
 * Surfaces keep the original high-contrast status families:
 *   STEP_FREE  green-800-class fill, NOT_STEP_FREE red-800-class fill, UNKNOWN gray-700-class fill,
 * all with white text (documented AA ratios 7.1:1 / 8.3:1 / 10.3:1).
 */
const STYLES: Record<AccessStatus, { box: string; label: string; Icon: typeof CheckCircle2; aria: string; eyebrow: string }> = {
  STEP_FREE: { box: "bg-status-free", label: "Step-free", Icon: CheckCircle2, aria: "Step-free trip", eyebrow: "Verified at both stations" },
  NOT_STEP_FREE: { box: "bg-status-blocked", label: "Not step-free", Icon: XCircle, aria: "Not a step-free trip", eyebrow: "Accessibility blocker found" },
  UNKNOWN: { box: "bg-status-unknown", label: "Cannot confirm", Icon: HelpCircle, aria: "Cannot confirm a step-free trip", eyebrow: "Not enough verified data" },
};

export default function StatusBanner({ status, headline, routeLabel, dataLine, simulated = false, capNote }: Props) {
  const s = STYLES[status];
  const Icon = s.Icon;
  return (
    <section
      aria-label={simulated ? `${s.aria}. Simulated scenario.` : s.aria}
      data-status={status}
      className={`${s.box} verdict-enter relative overflow-hidden rounded-3xl p-4 text-white shadow-hero transition-colors duration-500 min-[360px]:p-5 sm:p-7`}
    >
      {/* Decorative depth; purely cosmetic. */}
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-black/10" />

      {simulated ? (
        <p className="relative mb-4 inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-violet-900">
          <FlaskConical className="h-3.5 w-3.5" aria-hidden="true" />
          Simulated scenario
        </p>
      ) : null}

      <div className="relative flex items-start gap-3 sm:gap-5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/15 min-[360px]:h-14 min-[360px]:w-14 sm:h-20 sm:w-20">
          <Icon className="h-8 w-8 min-[360px]:h-9 min-[360px]:w-9 sm:h-12 sm:w-12" strokeWidth={2.25} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-wider text-white/85">{s.eyebrow}</p>
          {/* whitespace-nowrap keeps "Not step-free" on one line (never "step-" / "free"). The size follows the space
              the label really gets, so "Cannot confirm" (the widest) fits at 320 px and in the 5/12 desktop column. */}
          <h2 className="mt-1 whitespace-nowrap text-[clamp(1.5rem,7.5vw,2rem)] font-extrabold leading-none tracking-tight sm:text-4xl lg:text-[2rem] xl:text-[2.75rem]">{s.label}</h2>
          {routeLabel ? <p className="mt-2 text-lg font-semibold text-white/95">{routeLabel}</p> : null}
        </div>
      </div>

      {dataLine ? <p className="relative mt-4 text-base font-semibold text-white">{dataLine}</p> : null}
      {headline ? <p className="relative mt-4 max-w-prose text-lg leading-snug text-white">{headline}</p> : null}
      {capNote ? <p className="relative mt-3 rounded-xl bg-black/15 px-3 py-2 text-sm leading-snug text-white">{capNote}</p> : null}
    </section>
  );
}
