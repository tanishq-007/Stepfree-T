import {
  Ban,
  Bell,
  ChevronDown,
  Cpu,
  Database,
  Gauge,
  Info,
  MapPinned,
  Route as RouteIcon,
  Scale,
  Search,
  ShieldAlert,
  TrainFront,
  UserRound,
} from "lucide-react";
import type { TraceKind, TraceStep } from "@/lib/engine/trace";
import StatusChip from "./StatusChip";

const ICON: Record<TraceKind, typeof Ban> = {
  check: Search,
  data: Database,
  freshness: Gauge,
  profile: UserRound,
  station: TrainFront,
  alert: Bell,
  notices: Info,
  route: RouteIcon,
  decision: Cpu,
  cap: ShieldAlert,
  alternative: MapPinned,
};

function dotClass(s: TraceStep): string {
  if (s.status === "NOT_STEP_FREE") return "bg-status-blocked text-white";
  if (s.status === "UNKNOWN") return "bg-status-unknown text-white";
  if (s.status === "STEP_FREE") return "bg-status-free text-white";
  return "bg-white text-ink-soft ring-1 ring-hairline";
}

function fmt(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

/**
 * Ordered decision trace (not an event history). A step shows a time only when the data has one;
 * all other steps are ordered by the engine's logic and show no time.
 */
export default function EvidenceTimeline({ steps, simulated }: { steps: TraceStep[]; simulated: boolean }) {
  return (
    <section aria-labelledby="trace-h" className="card p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-brand-700" aria-hidden="true" />
          <h2 id="trace-h" className="text-xl font-extrabold text-ink">
            How we decided
          </h2>
        </div>
        {simulated ? <span className="chip bg-violet-100 px-2 py-0 text-xs font-extrabold uppercase tracking-wider text-violet-900">Simulated scenario</span> : null}
      </div>
      <p className="mt-1 text-sm text-ink-soft">The exact steps the rules engine took, in order. Times appear only where the MBTA data or your check has one.</p>

      <ol className="relative mt-5 space-y-4 border-l-2 border-hairline pl-6">
        {steps.map((s) => {
          const Icon = ICON[s.kind];
          const hasMore = Boolean(s.evidence?.length || s.mbtaText);
          return (
            <li key={s.id} className="relative">
              <span className={`absolute -left-[2.35rem] top-0 flex h-8 w-8 items-center justify-center rounded-full ${dotClass(s)}`} aria-hidden="true">
                <Icon className="h-4 w-4" />
              </span>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h3 className="text-sm font-bold text-ink">{s.title}</h3>
                {s.status ? <StatusChip status={s.status} size="xs" /> : null}
              </div>
              {s.time ? (
                <p className="mt-0.5 text-xs font-medium text-ink-muted">
                  {s.time.label}: <time dateTime={s.time.iso}>{fmt(s.time.iso)}</time>
                </p>
              ) : null}
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">{s.detail}</p>
              {hasMore ? (
                <details className="group mt-1.5">
                  <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center gap-1 text-sm font-semibold text-brand-800">
                    <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                    {s.mbtaText ? "Original MBTA notice and ids" : "Evidence"}
                  </summary>
                  {s.mbtaText ? <blockquote className="mt-1 rounded-lg border-l-4 border-slate-300 bg-surface-sunken p-3 text-sm text-ink-soft">{s.mbtaText}</blockquote> : null}
                  {s.evidence?.length ? (
                    <dl className="mt-2 grid grid-cols-[auto,1fr] gap-x-3 gap-y-1 text-xs">
                      {s.evidence.map((e, i) => (
                        <div key={`${e.label}-${i}`} className="contents">
                          <dt className="font-semibold text-ink-muted">{e.label}</dt>
                          <dd className="break-words font-mono text-ink-soft">{e.value}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : null}
                </details>
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
