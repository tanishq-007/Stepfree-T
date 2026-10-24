"use client";
import { FlaskConical } from "lucide-react";
import { setDemoScenario, setPresenter, useDemoScenario, usePresenter } from "@/lib/client/demo-store";
import { DEMO_LABELS, DEMO_TRIP_LABEL, type DemoScenarioId } from "@/lib/client/types";

const IDS = Object.keys(DEMO_LABELS) as DemoScenarioId[];

/** Footer entry point for presenter mode. Shares the store with PresenterBar. */
export default function DemoSwitch() {
  const scenario = useDemoScenario();
  const presenter = usePresenter();
  const on = scenario !== null;

  return (
    <div className={`rounded-2xl border p-4 transition-colors ${on ? "border-violet-300 bg-violet-50" : "border-hairline bg-surface-sunken"}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-800">
            <FlaskConical className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-bold text-ink">Presenter demo mode</span>
            <span className="text-xs text-ink-muted">Simulated data for demonstrations</span>
          </span>
        </span>

        <label className="inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-sm font-semibold">
          <span className="sr-only">Turn demo mode on</span>
          <input
            type="checkbox"
            role="switch"
            aria-checked={on}
            checked={on}
            onChange={(e) => {
              setPresenter(e.target.checked);
              setDemoScenario(e.target.checked ? "all-clear" : null);
            }}
            className="h-6 w-6 accent-violet-700"
          />
        </label>
      </div>

      {on ? (
        <div className="mt-3">
          <label htmlFor="demo-scenario" className="block text-sm font-semibold text-ink">
            Scenario ({DEMO_TRIP_LABEL})
          </label>
          <select id="demo-scenario" value={scenario} onChange={(e) => setDemoScenario(e.target.value as DemoScenarioId)} className="field mt-1 border-violet-300">
            {IDS.map((id) => (
              <option key={id} value={id}>
                {DEMO_LABELS[id]}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs font-semibold text-violet-900">Demo mode is ON. Results shown are simulated, not live.</p>
        </div>
      ) : presenter ? (
        <p className="mt-2 text-xs text-ink-muted">The simulator controls are shown at the top of the trip page.</p>
      ) : null}
    </div>
  );
}
