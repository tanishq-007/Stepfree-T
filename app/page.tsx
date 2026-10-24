"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  FlaskConical,
  Info,
  Map as MapIcon,
  MessageSquareText,
  Radio,
  RefreshCw,
  Route as RouteIcon,
  ShieldCheck,
} from "lucide-react";
import type { Alert, Trip, UserProfile } from "@/lib/types";
import AlertCard from "@/components/AlertCard";
import AlternativeCard from "@/components/AlternativeCard";
import DataSourceBadge from "@/components/DataSourceBadge";
import EvidenceTimeline from "@/components/EvidenceTimeline";
import JourneyExplainer from "@/components/JourneyExplainer";
import PresenterBar from "@/components/PresenterBar";
import ProfileComparison from "@/components/ProfileComparison";
import ProfileSwitcher from "@/components/ProfileSwitcher";
import StatusBanner from "@/components/StatusBanner";
import StatusSkeleton from "@/components/StatusSkeleton";
import JourneyMap from "@/components/map/JourneyMap";
import { setDemoScenario, setPresenter, useDemoScenario, usePresenter } from "@/lib/client/demo-store";
import { loadTrip, saveTrip, withProfile } from "@/lib/client/storage";
import { useStatus } from "@/lib/client/use-status";
import { DEMO_TRIP_LABEL, shownStatus, type ExplainPayload, type StatusResponse } from "@/lib/client/types";
import { buildTrace } from "@/lib/engine/trace";

function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "unknown time" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function problemStationName(result: StatusResponse): string | undefined {
  const reason = result.reasons.find((r) => r.code !== "VERIFIED_STEP_FREE" && !r.code.startsWith("ESCALATOR") && !r.code.startsWith("ELEVATOR_ALTERNATIVE"));
  const stations = [result.trip.origin, result.trip.destination];
  return stations.find((s) => s?.id === reason?.stationId)?.name;
}

/** Notices with identical plain-language text become one card. */
function groupByText(alerts: Alert[], text: Map<string, string>): { alert: Alert; count: number }[] {
  const groups = new Map<string, { alert: Alert; count: number }>();
  for (const a of alerts) {
    const key = text.get(a.id) ?? `id:${a.id}`;
    const found = groups.get(key);
    if (found) found.count += 1;
    else groups.set(key, { alert: a, count: 1 });
  }
  return [...groups.values()];
}

function Result({
  result,
  explanation,
  explaining,
  refreshing,
  checkedAt,
  onRefresh,
  onProfile,
  requestedProfile,
}: {
  result: StatusResponse;
  explanation: ExplainPayload | null;
  explaining: boolean;
  refreshing: boolean;
  checkedAt: string;
  onRefresh: () => void;
  onProfile: (p: UserProfile) => void;
  /** The profile the rider picked. Can lead the result's profile while a new check is in flight. */
  requestedProfile: UserProfile;
}) {
  const text = useMemo(() => new Map(explanation?.explanations.map((e) => [e.alertId, e.text] as const)), [explanation]);
  const status = shownStatus(result);
  const simulated = result.dataSource === "demo";
  const profile = result.trip.profile;
  const route = result.trip.origin && result.trip.destination ? `${result.trip.origin.name} to ${result.trip.destination.name}` : undefined;
  const capNote = result.display?.capped ? result.display.capReasons.map((r) => r.message).join(" ") : undefined;

  const steps = useMemo(() => {
    const markers = new Map((result.stations ?? []).map((m) => [m.id, m] as const));
    const check = (s: StatusResponse["trip"]["origin"]) =>
      s ? { id: s.id, name: s.name, wheelchairBoarding: s.wheelchairBoarding, status: markers.get(s.id)?.status ?? result.status } : null;
    return buildTrace({
      result,
      profile,
      journey: result.journey ?? { kind: "unknown", reason: "NO_NETWORK" },
      displayed: result.display ?? { status: result.status, capped: false, capReasons: [] },
      origin: check(result.trip.origin),
      destination: check(result.trip.destination),
      checkedAt,
      stationName: (id) => markers.get(id)?.name,
    });
  }, [result, profile, checkedAt]);

  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
        {/* Verdict column. First in the DOM so it is read first and comes first on mobile. */}
        <div className="space-y-4 lg:col-span-5 lg:col-start-8 lg:row-start-1">
          <div aria-live="polite" aria-atomic="true">
            <StatusBanner key={`${status}-${result.scenario ?? "real"}-${profile}`} status={status} routeLabel={route} headline={explanation?.summary} simulated={simulated} capNote={capNote} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <DataSourceBadge source={result.dataSource} fetchedAt={result.fetchedAt} />
            <p className="text-sm text-ink-muted">
              Checked {formatTime(checkedAt)} · MBTA data {formatTime(result.fetchedAt)}
            </p>
            {refreshing ? (
              <p role="status" className="inline-flex items-center gap-1 text-sm font-semibold text-brand-800">
                <RefreshCw className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                Updating…
              </p>
            ) : null}
          </div>

          {simulated ? (
            <p role="note" className="rounded-xl border-2 border-violet-300 bg-violet-50 p-3 text-sm font-semibold text-violet-900">
              Simulated demo data for the fixed trip {DEMO_TRIP_LABEL}. This is not what is happening in the subway right now, and your saved trip is not affected.
            </p>
          ) : null}
          {result.dataSource === "snapshot" ? (
            <p role="note" className="rounded-xl border-2 border-amber-300 bg-amber-50 p-3 text-sm font-semibold text-amber-900">
              We could not reach the MBTA, so this uses a saved copy from {formatTime(result.fetchedAt)}. It is not live. Press Refresh to try again.
            </p>
          ) : null}

          <div className="card space-y-3 p-4">
            {/* Not disabled while refreshing: disabling the focused radio would drop keyboard focus. A newer
                pick aborts the older request in useStatus. */}
            <ProfileSwitcher value={requestedProfile} onChange={onProfile} />
            <p className="flex items-start gap-2 text-xs text-ink-muted">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {result.coverage?.note ?? "Only the start and end stations are checked."}
            </p>
          </div>

          {result.alternative ? <AlternativeCard station={result.alternative} instead={problemStationName(result)} /> : null}

          {/* Stays enabled during a check so keyboard focus is kept; a second press restarts the check. */}
          <button type="button" onClick={onRefresh} aria-describedby={refreshing ? "refresh-busy" : undefined} className="btn-primary w-full">
            <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin motion-reduce:animate-none" : ""}`} aria-hidden="true" />
            Refresh
          </button>
          {refreshing ? (
            <span id="refresh-busy" className="sr-only">
              A check is already running.
            </span>
          ) : null}
        </div>

        {/* Map column: left and large on desktop, after the verdict on mobile. */}
        <div className="lg:col-span-7 lg:col-start-1 lg:row-start-1">
          <JourneyMap result={result} checkedAt={checkedAt} />
        </div>
      </div>

      <JourneyExplainer status={status} profile={profile} explanation={explanation} loading={explaining} simulated={simulated} />

      <div className="grid gap-5 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-7">
          <EvidenceTimeline steps={steps} simulated={simulated} />
        </div>
        <div className="space-y-5 lg:col-span-5">
          {result.profiles ? <ProfileComparison outcomes={result.profiles} current={profile} /> : null}

          {result.blockingAlerts.length + result.infoAlerts.length > 0 ? (
            <section aria-labelledby="alerts-h" className="space-y-4">
              <h2 id="alerts-h" className="text-xl font-extrabold text-ink">
                MBTA alerts on your trip
              </h2>
              {result.blockingAlerts.length > 0 ? (
                <section aria-labelledby="blocking-h">
                  <h3 id="blocking-h" className="mb-2 text-base font-bold text-ink">
                    Problems on your trip
                  </h3>
                  <ul className="space-y-3">
                    {groupByText(result.blockingAlerts, text).map(({ alert, count }) => (
                      <AlertCard key={alert.id} alert={alert} blocking count={count} explanation={text.get(alert.id)} />
                    ))}
                  </ul>
                </section>
              ) : null}
              {result.infoAlerts.length > 0 ? (
                <section aria-labelledby="info-h">
                  <h3 id="info-h" className="mb-2 text-base font-bold text-ink">
                    Other notices
                  </h3>
                  <ul className="space-y-3">
                    {groupByText(result.infoAlerts, text).map(({ alert, count }) => (
                      <AlertCard key={alert.id} alert={alert} blocking={false} count={count} explanation={text.get(alert.id)} />
                    ))}
                  </ul>
                </section>
              ) : null}
            </section>
          ) : (
            <section aria-labelledby="alerts-h" className="card p-5">
              <h2 id="alerts-h" className="text-base font-bold text-ink">
                MBTA alerts on your trip
              </h2>
              <p className="mt-1 text-sm text-ink-soft">No active MBTA accessibility alerts at your start or end station.</p>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

const VALUE_PROPS = [
  { Icon: Radio, title: "Live accessibility updates", body: "We read the MBTA's live elevator and alert data the moment you check." },
  { Icon: MessageSquareText, title: "Clear trip-level guidance", body: "One plain-language verdict, what it means for you, and what to do next." },
  { Icon: ShieldCheck, title: "Verified alternatives", body: "When a station is blocked, we suggest a nearby station on the same line that passed every check." },
];

const STEPS = [
  { n: 1, title: "Save your trip", body: "Pick a start, an end, and how you travel." },
  { n: 2, title: "We check live data", body: "Station accessibility, elevators, and alerts from the MBTA." },
  { n: 3, title: "Get a clear answer", body: "Step-free, not step-free, or cannot confirm, with the evidence." },
];

function startDemo() {
  setPresenter(true);
  setDemoScenario("all-clear");
}

function Landing() {
  return (
    <div className="space-y-10">
      <section className="grid gap-8 lg:grid-cols-2 lg:items-center">
        <div className="animate-fade-in space-y-5">
          <span className="chip border border-brand-200 bg-brand-50 px-3 py-1 text-brand-800">
            <span className="h-2 w-2 rounded-full bg-brand-500" aria-hidden="true" />
            Real-time MBTA accessibility
          </span>
          <h1 className="text-4xl font-extrabold leading-tight tracking-tight text-ink sm:text-5xl">
            Your journey. <span className="text-brand-700">Without barriers.</span>
          </h1>
          <p className="max-w-prose text-lg text-ink-soft">
            Know whether your MBTA subway trip is step-free before you travel. AccessPath AI reads live accessibility data, maps it, and tells you in plain words why.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link href="/trip/new" className="btn-primary px-6 text-lg">
              Plan an accessible trip
              <ArrowRight className="h-5 w-5" aria-hidden="true" />
            </Link>
            <button type="button" onClick={startDemo} className="btn border-2 border-violet-300 bg-white px-5 text-violet-900 hover:bg-violet-50">
              <FlaskConical className="h-5 w-5" aria-hidden="true" />
              Try the disruption simulator
            </button>
          </div>
          <p className="text-sm text-ink-muted">The simulator uses clearly labelled simulated data for one fixed trip ({DEMO_TRIP_LABEL}).</p>
        </div>

        {/* Decorative route illustration; no station names or statuses are shown. */}
        <div className="card animate-fade-in overflow-hidden p-0" aria-hidden="true">
          <div className="relative h-64 bg-[radial-gradient(circle_at_30%_20%,#e6fffb,transparent_55%),linear-gradient(180deg,#f8fafc,#eef2f7)] sm:h-72">
            <svg viewBox="0 0 400 260" className="absolute inset-0 h-full w-full" fill="none">
              <path d="M40 210 C 120 200, 140 120, 210 110 S 330 60, 370 40" stroke="#da291c" strokeWidth="7" strokeLinecap="round" />
              <path d="M30 70 C 120 90, 170 150, 260 170 S 360 200, 380 215" stroke="#00843d" strokeWidth="7" strokeLinecap="round" opacity="0.85" />
              <path d="M200 20 L 215 240" stroke="#ed8b00" strokeWidth="7" strokeLinecap="round" opacity="0.8" />
              {[
                [40, 210, "#166534"],
                [210, 110, "#166534"],
                [370, 40, "#166534"],
                [260, 170, "#991b1b"],
                [120, 95, "#4b5563"],
              ].map(([x, y, c], i) => (
                <g key={i}>
                  <circle cx={x as number} cy={y as number} r="13" fill="#fff" stroke="#0f172a" strokeWidth="3" />
                  <circle cx={x as number} cy={y as number} r="7" fill={c as string} />
                </g>
              ))}
            </svg>
            <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2 rounded-xl bg-white/90 p-3 shadow-card">
              <MapIcon className="h-5 w-5 text-brand-700" />
              <span className="h-2 flex-1 rounded-full bg-surface-sunken" />
              <RouteIcon className="h-5 w-5 text-ink-muted" />
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="vp-h">
        <h2 id="vp-h" className="sr-only">
          What AccessPath AI does
        </h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {VALUE_PROPS.map(({ Icon, title, body }) => (
            <div key={title} className="card p-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <h3 className="mt-3 text-lg font-bold text-ink">{title}</h3>
              <p className="mt-1 text-sm text-ink-soft">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="hiw-h" className="card p-6 sm:p-8">
        <h2 id="hiw-h" className="text-xl font-bold text-ink">
          How it works
        </h2>
        <ol className="mt-4 grid gap-5 sm:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-700 text-sm font-bold text-white">{s.n}</span>
              <span>
                <span className="block font-bold text-ink">{s.title}</span>
                <span className="block text-sm text-ink-soft">{s.body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export default function HomePage() {
  const demo = useDemoScenario();
  const presenter = usePresenter();
  const [trip, setTrip] = useState<Trip | null>(null);
  const [loaded, setLoaded] = useState(false);
  // Demo profile is separate: the scenario trip is fixed and the saved trip must not change.
  const [demoProfile, setDemoProfile] = useState<UserProfile>("wheelchair");
  useEffect(() => {
    setTrip(loadTrip());
    setLoaded(true);
  }, []);
  const { state, refresh } = useStatus(trip, demo, demoProfile);

  function changeProfile(p: UserProfile) {
    if (demo) return setDemoProfile(p);
    if (!trip) return;
    const next = withProfile(trip, p);
    saveTrip(next);
    setTrip(next);
  }

  if (!loaded) return <StatusSkeleton />;
  if (!trip && !demo && !presenter) return <Landing />;

  // Live/simulated separation at render time: right after demo mode changes, `state` can still hold the
  // other kind of result for one frame (the fetch effect runs after paint). Never show it.
  const mismatched = state.phase === "ready" && (state.result.dataSource === "demo") !== Boolean(demo);

  const heading = demo ? `Simulated trip: ${DEMO_TRIP_LABEL}` : "Your trip";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">{heading}</h1>
        <Link href="/trip/new" className="btn-ghost text-sm">
          {trip ? "Edit trip" : "Plan a real trip"}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      {presenter ? <PresenterBar /> : null}

      {!trip && !demo ? (
        <section className="card p-6">
          <h2 className="text-lg font-bold text-ink">No saved trip yet</h2>
          <p className="mt-1 text-ink-soft">Pick a scenario above to run the simulator, or plan a real trip to check live MBTA data.</p>
          <Link href="/trip/new" className="btn-primary mt-4">
            Plan an accessible trip
            <ArrowRight className="h-5 w-5" aria-hidden="true" />
          </Link>
        </section>
      ) : null}

      {state.phase === "loading" || mismatched ? <StatusSkeleton /> : null}
      {state.phase === "idle" && (trip || demo) ? <StatusSkeleton /> : null}

      {state.phase === "error" ? (
        <div className="space-y-4">
          <div aria-live="polite">
            <StatusBanner status="UNKNOWN" headline="We could not check your trip. Press Refresh to try again. If it keeps failing, ask a station worker before you go." />
          </div>
          <p role="alert" className="rounded-xl border-2 border-status-blocked bg-status-blocked-tint p-3 text-base text-status-blocked">
            Problem: {state.message}
          </p>
          <button type="button" onClick={refresh} className="btn-primary w-full">
            <RefreshCw className="h-5 w-5" aria-hidden="true" />
            Refresh
          </button>
        </div>
      ) : null}

      {state.phase === "ready" && !mismatched ? (
        <Result
          result={state.result}
          explanation={state.explanation}
          explaining={state.explaining}
          refreshing={state.refreshing}
          checkedAt={state.checkedAt}
          onRefresh={refresh}
          onProfile={changeProfile}
          requestedProfile={demo ? demoProfile : (trip?.profile ?? state.result.trip.profile)}
        />
      ) : null}
    </div>
  );
}
