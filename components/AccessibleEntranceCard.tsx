"use client";
import { useId, useState } from "react";
import { DoorOpen, ExternalLink, RefreshCw } from "lucide-react";
import type { Station } from "@/lib/types";
import type { AccessibleEntranceInfo, EntrancesResponse } from "@/lib/google/types";
import { entranceMapAlt, entrancePhotoAlt, entrancePhotoCaption, photoProvider, plainEntranceName } from "@/lib/client/format";
import { useRemote, type RemoteState } from "@/lib/client/use-remote";

type StationRef = Pick<Station, "id" | "name">;

/** The picture of one entrance. Own state, so one picture that fails to load does not touch the others. */
function EntrancePhotoFigure({ entrance, stationName }: { entrance: AccessibleEntranceInfo; stationName: string }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const photo = entrance.photo;
  // null: we do not know (no Google key, or Google did not answer), so we say nothing about photos.
  if (!photo) return null;
  if (!photo.available || !photo.imageUrl) {
    return <p className="mt-2 text-sm text-ink-soft">No street photo available for this entrance.</p>;
  }
  if (failed) {
    return (
      <div className="mt-2">
        <p role="status" className="text-sm text-ink">
          The photo did not load. Press Try again.
        </p>
        <button
          type="button"
          onClick={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
          className="btn-secondary mt-2"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
      </div>
    );
  }
  const provider = photoProvider(photo.copyright);
  return (
    <figure className="mt-2">
      {/* A plain img: the picture comes from our own route, so there is no outside host for next/image to optimise. */}
      <img
        src={attempt === 0 ? photo.imageUrl : `${photo.imageUrl}&attempt=${attempt}`}
        alt={entrancePhotoAlt(entrance.name, stationName, photo.captureDate)}
        width={640}
        height={400}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-auto w-full rounded-xl bg-surface-sunken"
      />
      <figcaption className="mt-1 space-y-0.5 text-sm text-ink-soft">
        <p>{entrancePhotoCaption(photo.captureDate)}</p>
        <p>A nearby building or vehicle may block the view.</p>
        {provider ? <p>Photo provided by {provider}.</p> : null}
        <p>Image &copy; Google</p>
      </figcaption>
    </figure>
  );
}

function StationMap({ mapUrl, stationName, names }: { mapUrl: string; stationName: string; names: string[] }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null; // the names and links below still work
  return (
    <figure>
      <img
        src={mapUrl}
        alt={entranceMapAlt(stationName, names)}
        width={640}
        height={320}
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
        className="h-auto w-full rounded-xl bg-surface-sunken"
      />
      <figcaption className="mt-1 text-sm text-ink-soft">
        The number on each pin is the number in the list below. S is the station. Map &copy; Google
      </figcaption>
    </figure>
  );
}

interface ViewProps {
  station: StationRef;
  state: RemoteState<EntrancesResponse>;
  onRetry: () => void;
}

/**
 * Accessible entrances of a station: a map, then a numbered list whose numbers are the map's pin labels.
 * Only entrances MBTA marks wheelchair accessible are ever listed. Without a Google key there is no map and
 * no photo, but the names and the Google Maps links (which need no key) still show.
 */
export function AccessibleEntranceCardView({ station, state, onRetry }: ViewProps) {
  const uid = useId();
  const headingId = `entrances-h-${uid}`;
  const title = `Accessible entrances at ${station.name}`;

  const header = (
    <div className="flex items-center gap-2">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-800">
        <DoorOpen className="h-5 w-5" aria-hidden="true" />
      </span>
      <h3 id={headingId} className="text-base font-bold text-ink">
        {title}
      </h3>
    </div>
  );

  if (state.phase === "loading") {
    return (
      <section aria-labelledby={headingId} aria-busy="true" className="card p-4" data-entrances="loading">
        {header}
        <p role="status" className="mt-2 text-sm text-ink-soft">
          Looking for accessible entrances&hellip;
        </p>
      </section>
    );
  }

  if (state.phase === "error") {
    return (
      <section aria-labelledby={headingId} className="card p-4" data-entrances="error">
        {header}
        <p role="alert" className="mt-2 text-base text-ink">
          We could not load the entrances right now. Press Try again.
        </p>
        <button type="button" onClick={onRetry} className="btn-secondary mt-3">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </button>
      </section>
    );
  }

  const { entrances, stationName } = state.data;
  if (entrances.length === 0) {
    return (
      <section aria-labelledby={headingId} className="card p-4" data-entrances="none">
        {header}
        <p className="mt-2 text-base text-ink">We couldn&apos;t find an entrance marked wheelchair accessible for this station.</p>
        <p className="mt-1 text-sm text-ink-soft">Ask a station worker which entrance to use.</p>
      </section>
    );
  }

  const mapUrl = entrances[0]?.mapUrl ?? null;
  return (
    <section aria-labelledby={headingId} className="card animate-fade-in space-y-3 p-4" data-entrances="found">
      {header}
      {mapUrl ? <StationMap mapUrl={mapUrl} stationName={stationName} names={entrances.map((e) => e.name)} /> : null}
      <ol className="space-y-3">
        {entrances.map((e, i) => {
          const name = plainEntranceName(e.name);
          return (
            <li key={e.id} data-entrance-number={i + 1} className="rounded-xl bg-surface-sunken p-3">
              <div className="flex items-start gap-3">
                {/* The same number as the pin on the map. Words carry the meaning; the circle is just a picture of it. */}
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-status-free text-base font-bold text-white"
                >
                  {i + 1}
                </span>
                <h4 className="min-w-0 pt-1 text-base font-bold text-ink">
                  <span className="sr-only">Entrance {i + 1}: </span>
                  {name}
                </h4>
              </div>
              <EntrancePhotoFigure entrance={e} stationName={stationName} />
              <a
                href={e.googleMapsLink}
                target="_blank"
                rel="noopener noreferrer"
                // Starts with the visible words so voice-control users can say them (WCAG 2.5.3 Label in Name).
                aria-label={`Open in Google Maps: ${name} location`}
                className="btn-secondary mt-3 w-full sm:w-auto"
              >
                Open in Google Maps
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** Accessible entrances for one trip station. */
export default function AccessibleEntranceCard({ station }: { station: StationRef }) {
  const { state, retry } = useRemote<EntrancesResponse>(`/api/entrances?${new URLSearchParams({ stationId: station.id }).toString()}`);
  return <AccessibleEntranceCardView station={station} state={state} onRetry={retry} />;
}
