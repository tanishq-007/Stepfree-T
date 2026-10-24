"use client";
import { ArrowLeftRight, CheckCircle2, Clock, FlaskConical, HelpCircle, LifeBuoy, Power, XCircle } from "lucide-react";
import { setDemoScenario, setPresenter, useDemoScenario } from "@/lib/client/demo-store";
import { DEMO_LABELS, DEMO_ORDER, DEMO_SHORT, DEMO_TRIP_LABEL, type DemoScenarioId } from "@/lib/client/types";

const ICON: Record<DemoScenarioId, typeof CheckCircle2> = {
  "all-clear": CheckCircle2,
  "elevator-outage-alewife": XCircle,
  "backup-elevator-alewife": ArrowLeftRight,
  "plan-b-davis": LifeBuoy,
  "planned-outage": Clock,
  "api-down": HelpCircle,
};

/**
 * Presenter controls for the disruption simulator. One click per scenario, at the top of the results.
 * Visually separate (violet) from the rider experience. "Real trip" turns demo data off.
 */
export default function PresenterBar() {
  const scenario = useDemoScenario();
  return (
    <section aria-labelledby="presenter-h" className="rounded-2xl border-2 border-violet-300 bg-violet-50 p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-violet-800" aria-hidden="true" />
          <h2 id="presenter-h" className="text-sm font-extrabold uppercase tracking-wider text-violet-900">
            Disruption simulator
          </h2>
        </div>
        <button
          type="button"
          onClick={() => {
            setDemoScenario(null);
            setPresenter(false);
          }}
          className="btn min-h-[44px] px-3 text-sm text-violet-900 hover:bg-violet-100"
        >
          Hide
        </button>
      </div>
      <p className="mt-1 text-xs text-violet-900">
        {scenario
          ? `Simulated data for the fixed trip ${DEMO_TRIP_LABEL[scenario]}. Not live. Your saved trip is not affected.`
          : "Showing your real trip. Pick a scenario to run a simulation."}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4 xl:grid-cols-7" role="group" aria-label="Choose a simulated scenario">
        <button
          type="button"
          aria-pressed={scenario === null}
          onClick={() => setDemoScenario(null)}
          className={`btn min-h-[44px] border px-3 text-sm ${scenario === null ? "border-violet-700 bg-violet-700 text-white" : "border-violet-300 bg-white text-violet-900 hover:bg-violet-100"}`}
        >
          <Power className="h-4 w-4 shrink-0" aria-hidden="true" />
          Real trip
        </button>
        {DEMO_ORDER.map((id) => {
          const Icon = ICON[id];
          const on = scenario === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={on}
              title={DEMO_LABELS[id]}
              onClick={() => setDemoScenario(id)}
              className={`btn min-h-[44px] border px-3 text-sm leading-tight ${on ? "border-violet-700 bg-violet-700 text-white" : "border-violet-300 bg-white text-violet-900 hover:bg-violet-100"}`}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
              {DEMO_SHORT[id]}
            </button>
          );
        })}
      </div>
    </section>
  );
}
