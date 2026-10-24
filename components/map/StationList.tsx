"use client";
import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import type { AccessStatus } from "@/lib/types";
import type { StationMarker } from "@/lib/client/types";
import StatusChip from "../StatusChip";

/**
 * Text equivalent of the map: every station the map shows, with the same status, reachable by keyboard.
 * Selecting a station here selects it on the map and opens its details.
 */
export default function StationList({
  markers,
  pinned,
  selectedId,
  onSelect,
}: {
  markers: StationMarker[];
  /** Trip stations shown first with their role. */
  pinned: { id: string; role: string }[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<AccessStatus | "ALL">("ALL");
  const counts = useMemo(() => {
    const c: Record<AccessStatus, number> = { STEP_FREE: 0, NOT_STEP_FREE: 0, UNKNOWN: 0 };
    for (const m of markers) c[m.status] += 1;
    return c;
  }, [markers]);
  const pinnedIds = new Set(pinned.map((p) => p.id));
  const roleOf = new Map(pinned.map((p) => [p.id, p.role] as const));
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = markers.filter((m) => (filter === "ALL" || m.status === filter) && (!needle || m.name.toLowerCase().includes(needle)));
    return [...list.filter((m) => pinnedIds.has(m.id)), ...list.filter((m) => !pinnedIds.has(m.id))];
  }, [markers, q, filter, pinned]); // eslint-disable-line react-hooks/exhaustive-deps

  const FILTERS: { v: AccessStatus | "ALL"; label: string }[] = [
    { v: "ALL", label: `All ${markers.length}` },
    { v: "NOT_STEP_FREE", label: `Not step-free ${counts.NOT_STEP_FREE}` },
    { v: "UNKNOWN", label: `Cannot confirm ${counts.UNKNOWN}` },
    { v: "STEP_FREE", label: `Step-free ${counts.STEP_FREE}` },
  ];

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden="true" />
        <label htmlFor="station-list-search" className="sr-only">
          Search stations on the map
        </label>
        <input id="station-list-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a station" autoComplete="off" className="field pl-9" />
      </div>
      <fieldset>
        <legend className="sr-only">Show stations by status</legend>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <label key={f.v} className={`btn min-h-[44px] cursor-pointer border px-3 text-xs ${filter === f.v ? "border-brand-600 bg-brand-50 text-brand-900" : "border-hairline bg-white text-ink-soft"}`}>
              <input type="radio" name="station-filter" value={f.v} checked={filter === f.v} onChange={() => setFilter(f.v)} className="sr-only" />
              {f.label}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="sr-only" aria-live="polite">
        {shown.length} {shown.length === 1 ? "station" : "stations"} listed
      </p>
      <ul className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-hairline bg-white p-1">
        {shown.map((m) => (
          <li key={m.id}>
            <button
              type="button"
              onClick={() => onSelect(m.id)}
              aria-pressed={selectedId === m.id}
              className={`flex min-h-[44px] w-full items-center justify-between gap-2 rounded-lg px-3 py-1.5 text-left text-sm ${selectedId === m.id ? "bg-brand-50" : "hover:bg-surface-sunken"}`}
            >
              <span className="min-w-0">
                <span className="block truncate font-semibold text-ink">{m.name}</span>
                {roleOf.get(m.id) ? <span className="block text-xs font-semibold text-brand-800">{roleOf.get(m.id)}</span> : null}
              </span>
              <StatusChip status={m.status} size="xs" />
            </button>
          </li>
        ))}
        {shown.length === 0 ? <li className="px-3 py-3 text-sm text-ink-muted">No stations match.</li> : null}
      </ul>
    </div>
  );
}
