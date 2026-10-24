import { Check, ChevronDown, Flag, LifeBuoy, MapPin, ShieldCheck, X } from "lucide-react";
import type { Alert } from "@/lib/types";
import type { StationMarker } from "@/lib/client/types";
import { lineStyle } from "@/lib/client/lines";
import { alertKind } from "@/lib/engine/rules";
import StatusChip from "../StatusChip";

const BOARDING: Record<StationMarker["wheelchairBoarding"], string> = {
  accessible: "MBTA lists this station as wheelchair accessible.",
  not_accessible: "MBTA lists this station as NOT wheelchair accessible.",
  unknown: "MBTA has no wheelchair accessibility information for this station.",
};

const SOURCE: Record<string, string> = { live: "Live MBTA data", snapshot: "Offline snapshot, not live", demo: "Simulated demo data" };

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "unknown time" : d.toLocaleString([], { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
}

/** What a single alert means at this station. An outage is not the same as "no step-free path". */
function alertMeaning(a: Alert, blocking: boolean, marker: StationMarker): string {
  const kind = alertKind(a);
  if (kind === "elevator_outage") {
    if (blocking) return "No other checked elevator reaches the same platform, so the step-free path is blocked.";
    if (marker.reasons.some((r) => r.code === "PLATFORM_UNVERIFIED")) return "We cannot confirm another elevator reaches the same platform. This makes the station unconfirmed, not blocked.";
    return "Another working elevator serves the same platform, or this elevator is not on the subway path. The station stays usable.";
  }
  if (kind === "escalator_outage") return "Escalators do not count for step-free travel. Notice only.";
  return blocking ? "This blocks step-free travel at this station for your profile." : "Notice only for your profile.";
}

export default function StationDetail({
  marker,
  alerts,
  role,
  dataSource,
  fetchedAt,
  onClose,
  draftEnd,
  onStartHere,
  onGoHere,
  suggestion,
  backupFor,
  headingRef,
}: {
  marker: StationMarker;
  alerts: Alert[];
  role?: string;
  dataSource: string;
  fetchedAt: string;
  onClose: () => void;
  /** Which end of the trip draft this station currently is. */
  draftEnd?: "origin" | "destination" | null;
  onStartHere?: () => void;
  onGoHere?: () => void;
  /** Present when this station is the engine's recommended alternative (a problem right now). */
  suggestion?: { why: string; evidence: string[]; instead: string } | null;
  /** Present when planB() names this station as the backup if an elevator fails (hypothetical). */
  backupFor?: { forStations: string[]; elevators: string[] } | null;
  headingRef?: React.Ref<HTMLHeadingElement>;
}) {
  const byId = new Map(alerts.map((a) => [a.id, a] as const));
  const own = [
    ...marker.blockingAlertIds.map((id) => ({ alert: byId.get(id), blocking: true })),
    ...marker.infoAlertIds.map((id) => ({ alert: byId.get(id), blocking: false })),
  ].filter((x): x is { alert: Alert; blocking: boolean } => Boolean(x.alert));
  const reasons = marker.reasons.filter((r) => r.code !== "BLOCKING_ALERT");

  return (
    <section aria-labelledby="station-detail-h" className="card animate-fade-in p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {suggestion ? (
            <p className="chip mb-1 border border-green-300 bg-status-free-tint px-2 py-0 text-xs font-bold text-status-free">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Recommended alternative
            </p>
          ) : backupFor ? (
            <p className="chip mb-1 border border-blue-200 bg-blue-50 px-2 py-0 text-xs font-bold text-blue-900">
              <LifeBuoy className="h-3.5 w-3.5" aria-hidden="true" />
              Backup if an elevator fails
            </p>
          ) : role ? (
            <p className="eyebrow">{role}</p>
          ) : null}
          <h3 id="station-detail-h" ref={headingRef} tabIndex={-1} className="text-xl font-extrabold text-ink outline-none focus-visible:outline">
            {marker.name}
          </h3>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            {marker.lines.map((l) => {
              const s = lineStyle(l);
              return (
                <span key={l} className={`chip px-2 py-0 text-xs ${s.bg} ${s.text}`}>
                  {s.label}
                </span>
              );
            })}
            <StatusChip status={marker.status} size="xs" />
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label={`Close details for ${marker.name}`} className="btn-ghost h-11 w-11 shrink-0 p-0">
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {onStartHere || onGoHere ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          {onStartHere ? (
            <button
              type="button"
              onClick={onStartHere}
              aria-pressed={draftEnd === "origin"}
              aria-label={draftEnd === "origin" ? `${marker.name} is your start station` : `Start here: set ${marker.name} as your start station`}
              className={`btn min-h-[44px] border-2 text-sm ${draftEnd === "origin" ? "border-ink bg-ink text-white" : "border-ink/20 bg-white text-ink hover:border-ink"}`}
            >
              {draftEnd === "origin" ? <Check className="h-4 w-4" aria-hidden="true" /> : <MapPin className="h-4 w-4" aria-hidden="true" />}
              {draftEnd === "origin" ? "Your start" : "Start here"}
            </button>
          ) : null}
          {onGoHere ? (
            <button
              type="button"
              onClick={onGoHere}
              aria-pressed={draftEnd === "destination"}
              aria-label={draftEnd === "destination" ? `${marker.name} is your end station` : `Go here: set ${marker.name} as your end station`}
              className={`btn min-h-[44px] border-2 text-sm ${draftEnd === "destination" ? "border-brand-700 bg-brand-700 text-white" : "border-brand-700/30 bg-white text-brand-800 hover:border-brand-700"}`}
            >
              {draftEnd === "destination" ? <Check className="h-4 w-4" aria-hidden="true" /> : <Flag className="h-4 w-4" aria-hidden="true" />}
              {draftEnd === "destination" ? "Your end" : "Go here"}
            </button>
          ) : null}
        </div>
      ) : null}

      {suggestion ? (
        <div className="mt-3 rounded-xl border border-green-200 bg-status-free-tint p-3 text-sm">
          <p className="font-bold text-status-free">Why it is suggested instead of {suggestion.instead}</p>
          <p className="mt-1 text-ink-soft">{suggestion.why}</p>
          {suggestion.evidence.length ? (
            <ul className="mt-1.5 list-disc space-y-0.5 pl-5 text-ink-soft">
              {suggestion.evidence.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {backupFor ? (
        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm">
          <p className="font-bold text-blue-900">Plan B for {backupFor.forStations.join(" and ")}, not needed right now</p>
          <p className="mt-1 text-ink-soft">
            If {backupFor.elevators.join(" or ")} breaks, {marker.name} is the nearest station on the same line that stays verified
            step-free without it. Straight-line distance, not a checked route between the stations.
          </p>
        </div>
      ) : null}

      <p className="mt-3 text-sm text-ink-soft">{BOARDING[marker.wheelchairBoarding]}</p>
      {reasons.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-soft">
          {reasons.map((r, i) => (
            <li key={`${r.code}-${i}`}>{r.message}</li>
          ))}
        </ul>
      ) : null}

      {own.length ? (
        <ul className="mt-3 space-y-2">
          {own.map(({ alert, blocking }) => (
            <li key={alert.id} className={`rounded-xl border-l-4 bg-surface-sunken p-3 ${blocking ? "border-l-status-blocked" : "border-l-slate-400"}`}>
              <p className={`text-xs font-bold uppercase tracking-wide ${blocking ? "text-status-blocked" : "text-ink-soft"}`}>{blocking ? "Blocks step-free here" : "Notice"}</p>
              <p className="mt-0.5 text-sm text-ink">{alertMeaning(alert, blocking, marker)}</p>
              <details className="group mt-1.5">
                <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-brand-800">
                  <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                  Original MBTA notice
                </summary>
                <p className="mt-1.5 text-sm text-ink-soft">{alert.header || alert.effect}</p>
                <p className="mt-1 text-xs text-ink-soft">
                  Alert {alert.id}
                  {alert.facilityIds.length ? ` · facility ${alert.facilityIds.join(", ")}` : ""}
                  {alert.updatedAt && !Number.isNaN(Date.parse(alert.updatedAt)) ? ` · updated ${formatTime(alert.updatedAt)}` : ""}
                </p>
              </details>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-ink-soft">No active MBTA accessibility alerts at this station.</p>
      )}

      <p className="mt-3 border-t border-hairline pt-2 text-xs text-ink-muted">
        {SOURCE[dataSource] ?? dataSource} · data from {formatTime(fetchedAt)}
      </p>
    </section>
  );
}
