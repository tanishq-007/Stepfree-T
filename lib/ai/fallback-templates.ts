import type { Alert, TripResult, UserProfile } from "@/lib/types";
import { alertKind } from "@/lib/engine/rules";
import type { ExplainContext, ExplainResponse } from "@/lib/api/schemas";
import { problemReasons, templateGuide } from "./guide";

// Plain-language templates (grade 6). Used when there is no ANTHROPIC_API_KEY or the model fails.
// Every text says what is wrong, what it means for this rider, and what to do next.
// They only use facts that are in the TripResult: they never claim a station is accessible unless the status says so.

const WHO: Record<UserProfile, string> = {
  wheelchair: "If you use a wheelchair",
  stroller: "If you have a stroller",
  no_stairs: "If you cannot use stairs",
};

function minutesAgo(fetchedAt: string): string {
  const ms = Date.now() - Date.parse(fetchedAt);
  if (!Number.isFinite(ms) || ms < 0) return "some time ago";
  const min = Math.max(1, Math.round(ms / 60_000));
  return min >= 120 ? `${Math.round(min / 60)} hours ago` : `${min} minutes ago`;
}

export function templateForAlert(alert: Alert, profile: UserProfile, result: TripResult): string {
  const who = WHO[profile];
  const blocking = result.blockingAlerts.some((a) => a.id === alert.id);
  switch (alertKind(alert)) {
    case "closure":
      return `A station on your trip is closed. Trains are not stopping there. ${who}, you cannot use this station right now. Pick a different station, or ask a station worker for help.`;
    case "elevator_outage":
      if (blocking) {
        return `An elevator is out of service, and no other checked elevator reaches the same platform. ${who}, you may not be able to get to the train. Choose another station, or ask the MBTA before you go.`;
      }
      if (result.reasons.some((r) => r.code === "PLATFORM_UNVERIFIED")) {
        return `An elevator is out of service. We could not check if another elevator reaches the same platform. ${who}, we cannot promise a step-free way. Ask a station worker, or check again before you leave.`;
      }
      // Reasons are not tied to one alert, so only say what every non-blocking outcome has in common.
      return `An elevator is out of service. Our checks did not find a problem for your step-free trip because of it. ${who}, check again before you leave, and ask a station worker if you are not sure.`;
    case "escalator_outage":
      return `An escalator is out of service. This does not stop step-free travel. ${who}, keep using the elevators.`;
    case "uneven_platform":
      return blocking
        ? `The platform is uneven or hard to board. ${who}, getting on or off the train may not be safe. Ask a station worker for help, or pick another station.`
        : `The platform is uneven or hard to board. We still show your trip, but take extra care. Ask a station worker if you need help.`;
    case "access_issue":
      return `There is a problem with access at a station on your trip. ${who}, you may not be able to use it. Ask a station worker, or pick another station.`;
    case "other":
      return `The MBTA posted a notice about a station on your trip. It may not change your step-free trip. Read the notice, and ask a station worker if you are not sure.`;
  }
}

export function templateSummary(result: TripResult, profile: UserProfile): string {
  const alt = result.alternative;
  switch (result.status) {
    case "STEP_FREE":
      return "Good news. Both stations are step-free right now, based on MBTA data we just checked. Check again right before you leave.";
    case "NOT_STEP_FREE":
      return alt
        ? `This trip is not step-free right now. Try ${alt.name} instead. It is on the same line, and we checked that it is accessible and has no problems.`
        : "This trip is not step-free right now. We did not find a checked station nearby on the same line. Ask a station worker, or plan a different route.";
    case "UNKNOWN": {
      if (result.isStale) {
        return `We cannot tell if this trip is step-free. Our MBTA data was last checked ${minutesAgo(result.fetchedAt)}, which is too old to trust. Press Refresh. If it still fails, ask a station worker before you go.`;
      }
      const top = problemReasons(result)[0]?.code;
      if (top === "TRANSFER_NOT_CHECKED") {
        return "We cannot confirm this whole trip is step-free. Your start and end stations look fine, but the trip needs a change of line and we do not check transfer stations.";
      }
      if (top === "ROUTE_UNKNOWN") {
        return "We cannot confirm this whole trip is step-free. We could not work out how these two stations connect on the subway.";
      }
      return `We cannot confirm that this trip is step-free. Some information is missing${alt ? `. Try ${alt.name} instead, which we did check` : ""}. Ask a station worker, or check again before you leave.`;
    }
  }
}

export function fallbackExplanation(result: TripResult, profile: UserProfile, context?: ExplainContext): ExplainResponse {
  const alerts = [...result.blockingAlerts, ...result.infoAlerts];
  return {
    explanations: alerts.map((a) => ({ alertId: a.id, text: templateForAlert(a, profile, result) })),
    summary: templateSummary(result, profile),
    usedAI: false,
    guide: templateGuide(result, profile, context),
  };
}
