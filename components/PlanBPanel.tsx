"use client";
import type { StatusResponse } from "@/lib/client/types";
import { AlternativePanel } from "./AlternativeCard";
import PlanBCard from "./PlanBCard";

/** What Plan B does not cover when the shown verdict was capped (the engine only checks the two ends). */
function scopeNote(result: StatusResponse): string | undefined {
  if (!result.display?.capped) return undefined;
  const j = result.journey;
  if (j?.kind === "transfer") {
    const names = (j.transferStations ?? []).map((s) => s.name);
    return `Plan B covers your start and end stations only. The change of line${names.length ? ` at ${names.join(" or ")}` : ""} is not checked.`;
  }
  return "Plan B covers your start and end stations only. We could not work out how they connect, so the rest of the trip is not checked.";
}

/**
 * The one Plan B slot on the result page. The engine decides which kind applies, and the two never appear
 * together (planB() is null unless the trip is step-free; the engine alternative is null when it is):
 *  - a problem right now   -> AlternativePanel: the engine's verified alternative station, or an honest "none"
 *  - step-free right now   -> PlanBCard: the elevator the trip depends on, and the backup station if it breaks
 */
export default function PlanBPanel({ result, interactive }: { result: StatusResponse; interactive: boolean }) {
  if (result.status !== "STEP_FREE") return <AlternativePanel result={result} interactive={interactive} />;
  if (!result.planB) return null;
  return <PlanBCard planB={result.planB} interactive={interactive} scopeNote={scopeNote(result)} />;
}
