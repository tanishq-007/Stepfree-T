import { Radio, FlaskConical, Archive } from "lucide-react";
import type { DataSource } from "@/lib/types";

interface Props {
  source: DataSource;
  fetchedAt?: string;
}

// Text strings are part of the component contract (asserted by tests) and are user-facing.
const COPY: Record<DataSource, { text: string; cls: string; Icon: typeof Radio; live: boolean }> = {
  live: {
    text: "Live",
    cls: "bg-status-free-tint text-status-free border-green-200",
    Icon: Radio,
    live: true,
  },
  snapshot: {
    text: "Offline snapshot, not live",
    cls: "bg-amber-50 text-amber-900 border-amber-200",
    Icon: Archive,
    live: false,
  },
  demo: {
    text: "Simulated demo data",
    cls: "bg-violet-50 text-violet-900 border-violet-200",
    Icon: FlaskConical,
    live: false,
  },
};

// aria-label is not allowed on a <p> (axe: aria-prohibited-attr; screen readers may ignore it), so the
// spoken "Data source:" prefix is visually hidden text. The time is shown in words next to the badge.
export default function DataSourceBadge({ source, fetchedAt }: Props) {
  const c = COPY[source];
  const Icon = c.Icon;
  return (
    <p className={`chip border px-3 py-1.5 ${c.cls}`} data-source={source} data-fetched-at={fetchedAt}>
      {c.live ? (
        <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
          <span className="absolute inline-flex h-full w-full animate-pulse-dot rounded-full bg-status-free" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-status-free" />
        </span>
      ) : (
        <Icon className="h-4 w-4" aria-hidden="true" />
      )}
      <span className="sr-only">Data source: </span>
      {c.text}
    </p>
  );
}
