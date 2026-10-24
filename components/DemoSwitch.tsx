"use client";
import { FlaskConical } from "lucide-react";
import { setDemoScenario, useDemoScenario } from "@/lib/client/demo-store";
import { DEMO_LABELS, DEMO_SCENARIOS as IDS, type DemoScenarioId } from "@/lib/client/types";

export default function DemoSwitch() {
  const scenario = useDemoScenario();
  const on = scenario !== null;

  return (
    <div
      className={`rounded-2xl border p-4 transition-colors ${
        on ? "border-violet-300 bg-violet-50" : "border-hairline bg-surface-sunken"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-800">
            <FlaskConical className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="flex flex-col leading-tight">
            <span className="text-sm font-bold text-ink">Presenter demo mode</span>
            {/* ink-soft, not ink-muted: muted grey is only 4.2:1 on these tinted backgrounds (AA needs 4.5:1). */}
            <span className="text-xs text-ink-soft">Simulated data for demonstrations</span>
          </span>
        </span>

        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold">
          <span className="sr-only">Turn demo mode on</span>
          <input
            type="checkbox"
            role="switch"
            aria-checked={on}
            checked={on}
            onChange={(e) => setDemoScenario(e.target.checked ? "elevator-outage-alewife" : null)}
            className="h-6 w-6 accent-violet-700"
          />
        </label>
      </div>

      {on ? (
        <div className="mt-3">
          <label htmlFor="demo-scenario" className="block text-sm font-semibold text-ink">
            Scenario
          </label>
          <select
            id="demo-scenario"
            value={scenario}
            onChange={(e) => setDemoScenario(e.target.value as DemoScenarioId)}
            className="field mt-1 border-violet-300"
          >
            {IDS.map((id) => (
              <option key={id} value={id}>
                {DEMO_LABELS[id]}
              </option>
            ))}
          </select>
          <p className="mt-2 text-xs font-semibold text-violet-900">
            Demo mode is ON — results shown are simulated, not live.
          </p>
        </div>
      ) : null}
    </div>
  );
}
