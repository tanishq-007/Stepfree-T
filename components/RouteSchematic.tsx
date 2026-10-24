import { ArrowRight, Flag, MapPin, Shuffle } from "lucide-react";
import type { AccessStatus, Station } from "@/lib/types";
import type { RouteRelationship } from "@/lib/engine/journey";
import { lineStyle } from "@/lib/client/lines";
import StatusChip from "./StatusChip";

interface Props {
  origin: Station | null;
  destination: Station | null;
  status: AccessStatus;
  alternative?: Station | null;
  journey?: (RouteRelationship & { transferStations?: { id: string; name: string }[] }) | undefined;
  /** Shown above the schematic, e.g. when it stands in for a map that failed to load. */
  note?: string;
}

/**
 * A transit-line SCHEMATIC, not a geographic map. It shows how origin and destination connect
 * (same line, change of line, or unknown) without implying exact geography, track path or travel time.
 * A full text equivalent is provided; the drawing is aria-hidden.
 */
export default function RouteSchematic({ origin, destination, status, alternative, journey, note }: Props) {
  if (!origin || !destination) return null;

  const direct = journey?.kind === "direct" ? journey.lines[0] : undefined;
  const style = direct ? lineStyle(direct) : null;
  const stroke = style?.hex ?? "#94a3b8";
  const transferNames = journey?.kind === "transfer" ? (journey.transferStations ?? []).map((s) => s.name) : [];

  const connection =
    journey?.kind === "direct"
      ? `on the ${style?.label ?? journey.lines.join(" or ")}, no change of line`
      : journey?.kind === "transfer"
        ? `with a change of line${transferNames.length ? ` at ${transferNames.join(" or ")}` : ""} (transfer station not checked)`
        : "with a connection we could not work out";
  const textEquivalent = `Trip from ${origin.name} to ${destination.name} ${connection}.${alternative ? ` Suggested accessible alternative: ${alternative.name}.` : ""}`;

  return (
    <section aria-label="Trip route" className="card p-5 sm:p-6">
      {note ? <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">{note}</p> : null}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-muted">Your route</h3>
        {style ? (
          <span className={`chip ${style.bg} ${style.text}`}>{style.label}</span>
        ) : journey?.kind === "transfer" ? (
          <span className="chip border border-amber-300 bg-amber-50 text-amber-900">
            <Shuffle className="h-4 w-4" aria-hidden="true" />
            Change of line
          </span>
        ) : (
          <span className="chip border border-hairline bg-surface-sunken text-ink-soft">Connection unknown</span>
        )}
      </div>

      <p className="sr-only">{textEquivalent}</p>

      <ol className="relative flex items-stretch justify-between gap-2" aria-hidden="true">
        <div
          className={`absolute left-5 right-5 top-5 h-1.5 rounded-full ${direct ? "" : "bg-[repeating-linear-gradient(90deg,#94a3b8_0_10px,transparent_10px_18px)]"}`}
          style={direct ? { backgroundColor: stroke } : undefined}
        />
        <li className="relative z-10 flex flex-1 flex-col items-start">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-card ring-2 ring-hairline" style={{ color: stroke }}>
            <MapPin className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <span className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">From</span>
          <span className="text-base font-bold text-ink">{origin.name}</span>
        </li>
        {transferNames.length ? (
          <li className="relative z-10 flex flex-col items-center pt-1 text-center">
            <span className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-dashed border-amber-500 bg-white text-amber-900">
              <Shuffle className="h-4 w-4" />
            </span>
            <span className="mt-2 max-w-[8rem] text-xs font-semibold text-amber-900">{transferNames.join(" / ")}</span>
          </li>
        ) : (
          <li className="relative z-10 flex items-center self-start pt-2">
            <ArrowRight className="h-5 w-5 text-ink-muted" strokeWidth={2.5} />
          </li>
        )}
        <li className="relative z-10 flex flex-1 flex-col items-end text-right">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-card ring-2 ring-hairline" style={{ color: stroke }}>
            <Flag className="h-5 w-5" strokeWidth={2.5} />
          </span>
          <span className="mt-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">To</span>
          <span className="text-base font-bold text-ink">{destination.name}</span>
        </li>
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <StatusChip status={status} size="xs" />
        {alternative ? <span className="text-sm text-ink-soft">Accessible alternative: <span className="font-bold text-ink">{alternative.name}</span></span> : null}
      </div>
    </section>
  );
}
