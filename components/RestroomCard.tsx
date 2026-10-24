"use client";
import { useId, useState } from "react";
import { CheckCircle2, ChevronDown, ExternalLink, HelpCircle, RefreshCw, Toilet, XCircle } from "lucide-react";
import type { Station } from "@/lib/types";
import type { FeatureDisabled, RestroomPlace, RestroomsResponse, Tri } from "@/lib/google/types";
import { describeWalk, formatTime } from "@/lib/client/format";
import { useRemote, type RemoteState } from "@/lib/client/use-remote";

type Payload = RestroomsResponse | FeatureDisabled;

function isDisabled(data: Payload): data is FeatureDisabled {
  return "enabled" in data;
}

/** Each fact has an icon AND words, so it never relies on colour. */
function Fact({ tone, children }: { tone: "good" | "bad" | "unknown"; children: React.ReactNode }) {
  const Icon = tone === "good" ? CheckCircle2 : tone === "bad" ? XCircle : HelpCircle;
  const colour = tone === "good" ? "text-status-free" : tone === "bad" ? "text-status-blocked" : "text-ink-soft";
  return (
    <p className={`flex items-start gap-1.5 text-sm font-semibold ${colour}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}

function hoursFact(openNow: boolean | null) {
  if (openNow === true) return <Fact tone="good">Open now</Fact>;
  if (openNow === false) return <Fact tone="bad">Closed now</Fact>;
  return <Fact tone="unknown">Hours unknown</Fact>;
}

function entranceFact(entrance: Tri) {
  if (entrance === "yes") return <Fact tone="good">Entrance is wheelchair accessible</Fact>;
  if (entrance === "no") return <Fact tone="bad">Entrance is not wheelchair accessible</Fact>;
  return <Fact tone="unknown">Entrance access not reported</Fact>;
}

function Place({ place }: { place: RestroomPlace }) {
  return (
    <li className="rounded-xl bg-surface-sunken p-3">
      <p className="text-base font-bold text-ink">{place.name}</p>
      <p className="text-sm text-ink-soft">{describeWalk(place.distanceMeters)}</p>
      <div className="mt-1 space-y-0.5">
        {hoursFact(place.openNow)}
        {entranceFact(place.wheelchairEntrance)}
      </div>
      <a
        href={place.mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Open in Google Maps: ${place.name} (opens in a new tab)`}
        className="btn-secondary mt-3 w-full sm:w-auto"
      >
        Open in Google Maps
        <ExternalLink className="h-4 w-4" aria-hidden="true" />
      </a>
    </li>
  );
}

interface ViewProps {
  station: Pick<Station, "id" | "name">;
  state: RemoteState<Payload>;
  onRetry: () => void;
}

/** Renders nothing while loading and when the feature is off, so a missing key leaves the page unchanged. */
export function RestroomCardView({ station, state, onRetry }: ViewProps) {
  const [open, setOpen] = useState(false);
  const uid = useId();
  const headingId = `restrooms-h-${uid}`;
  const panelId = `restrooms-panel-${uid}`;
  const title = `Wheelchair-accessible restrooms near ${station.name}`;

  if (state.phase === "loading") return null;

  if (state.phase === "error") {
    return (
      <section aria-labelledby={headingId} className="card p-4" data-restrooms="error">
        <h3 id={headingId} className="text-base font-bold text-ink">
          {title}
        </h3>
        <p role="alert" className="mt-2 text-base text-ink">
          We could not check for restrooms right now. Press Try again.
        </p>
        <button type="button" onClick={onRetry} className="btn-secondary mt-3">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
      </section>
    );
  }

  if (isDisabled(state.data)) return null;
  const { places, fetchedAt } = state.data;
  return (
    <section aria-labelledby={headingId} className="card animate-fade-in" data-restrooms={places.length > 0 ? "found" : "none"}>
      <h3 id={headingId}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-[44px] w-full items-center gap-3 rounded-2xl p-4 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-800">
            <Toilet className="h-5 w-5" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-base font-bold text-ink">{title}</span>
            <span className="block text-sm font-normal text-ink-soft">
              {places.length === 0 ? "None reported" : `${places.length} reported`}
            </span>
          </span>
          <ChevronDown className={`h-5 w-5 shrink-0 text-ink-soft transition-transform ${open ? "rotate-180" : ""}`} aria-hidden="true" />
        </button>
      </h3>
      <div id={panelId} hidden={!open} className="space-y-3 border-t border-hairline p-4">
        {places.length > 0 ? (
          <ul className="space-y-3">
            {places.map((p) => (
              <Place key={p.id} place={p} />
            ))}
          </ul>
        ) : (
          <p className="text-base text-ink">
            We could not find a reported wheelchair-accessible restroom nearby. Ask a station worker for help.
          </p>
        )}
        <p className="text-sm text-ink-soft">Reported by Google. May be incomplete. Some restrooms are for customers only.</p>
        <p className="text-sm text-ink-soft">
          Walking times are rough guesses from straight-line distance. Google checked these places at {formatTime(fetchedAt)}.
        </p>
      </div>
    </section>
  );
}

/** Wheelchair-accessible restrooms near one station, as reported by Google. Collapsed until the rider opens it. */
export default function RestroomCard({ station }: { station: Pick<Station, "id" | "name"> }) {
  const { state, retry } = useRemote<Payload>(`/api/restrooms?${new URLSearchParams({ stationId: station.id }).toString()}`);
  return <RestroomCardView station={station} state={state} onRetry={retry} />;
}
