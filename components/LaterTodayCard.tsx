import { Clock } from "lucide-react";
import type { Station } from "@/lib/types";
import type { UpcomingChange } from "@/lib/engine/later-today";
import { formatTime } from "@/lib/client/format";

interface Props {
  changes: UpcomingChange[];
  stations: (Station | null)[];
  hours: number;
}

/** Layer 3: planned MBTA work that starts later today and would make this trip worse. */
export default function LaterTodayCard({ changes, stations, hours }: Props) {
  const nameOf = (id: string) => stations.find((s) => s?.id === id)?.name ?? "a station on your trip";
  return (
    <section aria-labelledby="later-h" className="card animate-fade-in overflow-hidden border-amber-300">
      <div className="flex items-center gap-2 bg-amber-50 px-4 py-2.5">
        <Clock className="h-5 w-5 text-amber-900" aria-hidden="true" />
        <h3 id="later-h" className="text-sm font-bold uppercase tracking-wide text-amber-900">
          Later today (next {hours} hours)
        </h3>
      </div>
      <ul className="space-y-3 p-4">
        {changes.map((c) => {
          const time = formatTime(c.startsAt);
          const where = c.stationIds.map(nameOf).join(" and ");
          const effect = c.status === "NOT_STEP_FREE" ? "this trip may not be step-free" : "we may not be able to confirm a step-free trip";
          return (
            <li key={c.startsAt} className="text-base text-ink">
              <p>
                From <span className="font-bold">{time}</span>, the MBTA plans work at {where}. After that time, {effect}. If you
                travel after {time}, check again before you leave.
              </p>
              {c.alerts.length > 0 ? (
                <details className="mt-1">
                  <summary className="inline-flex cursor-pointer items-center text-sm font-semibold text-brand-800 underline hover:text-brand-900">
                    Original MBTA {c.alerts.length === 1 ? "notice" : "notices"}
                  </summary>
                  <ul className="mt-1 list-disc pl-5 text-sm text-ink-soft">
                    {c.alerts.map((a) => (
                      <li key={a.id}>{a.header}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
