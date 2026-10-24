// "Understand your journey": What happened? / Why does it affect me? / What can I do next?
// Built deterministically from the TripResult. The AI may reword this guide but may not change which
// next steps exist (validated by step id in explain.ts). Only facts in the result are used.
import type { Reason, TripResult, UserProfile } from "@/lib/types";
import type { ExplainContext, Guide, NextStepId } from "@/lib/api/schemas";
import { alertKind } from "@/lib/engine/rules";

type Topic = "ok" | "elevator" | "unverified" | "closure" | "access" | "uneven" | "station" | "station_unknown" | "data" | "route";

/** Most important reason first. Lower index = more important. */
const PRIORITY = [
  "DATA_STALE",
  "DATA_INVALID",
  "STATION_NOT_FOUND",
  "SAME_STATION",
  "STATION_NOT_ACCESSIBLE",
  "ELEVATOR_NO_ALTERNATIVE",
  "BLOCKING_ALERT",
  "PLATFORM_UNVERIFIED",
  "ACCESSIBILITY_UNKNOWN",
  "TRANSFER_NOT_CHECKED",
  "ROUTE_UNKNOWN",
];

export function problemReasons(result: Pick<TripResult, "reasons">): Reason[] {
  return result.reasons
    .filter((r) => PRIORITY.includes(r.code))
    .sort((a, b) => PRIORITY.indexOf(a.code) - PRIORITY.indexOf(b.code));
}

function topicOf(result: TripResult): Topic {
  if (result.status === "STEP_FREE") return "ok";
  const top = problemReasons(result)[0];
  switch (top?.code) {
    case "DATA_STALE":
    case "DATA_INVALID":
    case "STATION_NOT_FOUND":
    case "SAME_STATION":
      return "data";
    case "STATION_NOT_ACCESSIBLE":
      return "station";
    case "ELEVATOR_NO_ALTERNATIVE":
      return "elevator";
    case "PLATFORM_UNVERIFIED":
      return "unverified";
    case "ACCESSIBILITY_UNKNOWN":
      return "station_unknown";
    case "TRANSFER_NOT_CHECKED":
    case "ROUTE_UNKNOWN":
      return "route";
    case "BLOCKING_ALERT": {
      const first = result.blockingAlerts[0];
      const kind = first ? alertKind(first) : "access_issue";
      return kind === "closure" ? "closure" : kind === "uneven_platform" ? "uneven" : "access";
    }
    default:
      return "data";
  }
}

const WHO: Record<UserProfile, string> = { wheelchair: "With a wheelchair", stroller: "With a stroller", no_stairs: "If you cannot use stairs" };

const WHY: Record<Topic, Record<UserProfile, string>> = {
  ok: {
    wheelchair: "You need a step-free path at both ends of the trip. We found nothing at your start or end station that breaks it.",
    stroller: "You need to reach the platform without carrying the stroller on stairs. We found nothing at your start or end station that stops that.",
    no_stairs: "You need a way to the train with no stairs. We found nothing at your start or end station that stops that.",
  },
  elevator: {
    wheelchair: "The elevator is your only step-free way between the street and the train. With no other checked elevator on that platform, you may not be able to board or leave the train there.",
    stroller: "The elevator is how you reach the platform without carrying the stroller on stairs. With no other checked elevator on that platform, that way is gone at this station.",
    no_stairs: "Escalators do not count as stair-free here, so you need a working elevator. With no other checked elevator on that platform, there is no stair-free way to the train.",
  },
  unverified: {
    wheelchair: "An elevator is out and we cannot confirm that another one reaches the same platform. We will not guess about a path you depend on.",
    stroller: "An elevator is out and we cannot confirm that another one reaches the same platform, so we cannot promise a way without stairs.",
    no_stairs: "An elevator is out and we cannot confirm that another one reaches the same platform, so we cannot promise a way without stairs.",
  },
  closure: {
    wheelchair: "A closed station or stop cannot be used by anyone, so there is no step-free way through it.",
    stroller: "A closed station or stop cannot be used by anyone.",
    no_stairs: "A closed station or stop cannot be used by anyone.",
  },
  access: {
    wheelchair: "The MBTA reports an access problem at this station. That can break the step-free path you need.",
    stroller: "The MBTA reports an access problem at this station. That can stop you reaching the train with a stroller.",
    no_stairs: "The MBTA reports an access problem at this station. That can stop a stair-free way to the train.",
  },
  uneven: {
    wheelchair: "An uneven platform can leave a gap or step at the train door that a wheelchair may not be able to cross.",
    stroller: "An uneven platform can leave a gap or step at the train door that is hard to roll a stroller over.",
    no_stairs: "An uneven platform is a gap at the train door, not a staircase. For this profile it is a notice, not a blocker.",
  },
  station: {
    wheelchair: "The MBTA lists this station as not wheelchair accessible, so there is no step-free path there.",
    stroller: "The MBTA lists this station as not accessible, so expect stairs.",
    no_stairs: "The MBTA lists this station as not accessible, so expect stairs.",
  },
  station_unknown: {
    wheelchair: "The MBTA gives no accessibility information for this station. We will not call a station step-free without it.",
    stroller: "The MBTA gives no accessibility information for this station, so we cannot promise a way without stairs.",
    no_stairs: "The MBTA gives no accessibility information for this station, so we cannot promise a way without stairs.",
  },
  data: {
    wheelchair: "Elevators break and get fixed during the day. Old or missing data could hide a problem, so we will not say step-free.",
    stroller: "Elevators break and get fixed during the day. Old or missing data could hide a problem, so we will not say step-free.",
    no_stairs: "Elevators break and get fixed during the day. Old or missing data could hide a problem, so we will not say step-free.",
  },
  route: {
    wheelchair: "A change of line means another station, with its own elevators, that you must get through. We did not check it.",
    stroller: "A change of line means another station, with its own elevators, that you must get through. We did not check it.",
    no_stairs: "A change of line means another station, with its own elevators, that you must get through. We did not check it.",
  },
};

function whatHappened(result: TripResult): string {
  if (result.status === "STEP_FREE") {
    return "Both your start and end stations passed every check: the MBTA lists them as accessible and no active alert blocks them.";
  }
  const problems = problemReasons(result);
  const top = problems[0];
  if (!top) return "We could not confirm this trip is step-free.";
  const more = problems.length - 1;
  return more > 0 ? `${top.message} (${more} more ${more === 1 ? "problem" : "problems"} below.)` : top.message;
}

/** Which next steps apply. Only actions backed by data in the result. Order = priority. */
export function nextStepIds(result: TripResult, context?: ExplainContext): NextStepId[] {
  const ids: NextStepId[] = [];
  const problems = problemReasons(result).map((r) => r.code);
  if (result.status !== "STEP_FREE" && result.alternative) ids.push("use-alternative");
  if (context?.route === "transfer" || problems.includes("TRANSFER_NOT_CHECKED")) ids.push("check-transfer");
  if (result.blockingAlerts.length + result.infoAlerts.length > 0 && result.status !== "STEP_FREE") ids.push("read-notice");
  if (result.isStale || result.dataSource === "snapshot") ids.push("refresh");
  if (result.status !== "STEP_FREE") ids.push("ask-staff");
  if (result.status === "STEP_FREE") ids.push("recheck-before-leaving");
  return ids;
}

function stepText(id: NextStepId, result: TripResult, context?: ExplainContext): string {
  switch (id) {
    case "use-alternative": {
      const alt = result.alternative;
      return alt
        ? `Consider ${alt.name} instead. It is on the ${alt.lines.join(" and ")} Line and passed every check just now.`
        : "Look for another station.";
    }
    case "check-transfer": {
      const at = context?.transferStationNames?.length ? ` at ${context.transferStationNames.join(" or ")}` : "";
      return `Check the transfer${at} yourself before you go. We do not check transfer stations.`;
    }
    case "read-notice":
      return "Read the original MBTA notice in the evidence below.";
    case "refresh":
      return "Press Refresh to get newer MBTA data.";
    case "ask-staff":
      return "Ask MBTA station staff for help before you rely on this trip.";
    case "recheck-before-leaving":
      return "Check again right before you leave. Elevators can break at any time.";
  }
}

export function templateGuide(result: TripResult, profile: UserProfile, context?: ExplainContext): Guide {
  const topic = topicOf(result);
  const why = topic === "ok" ? WHY.ok[profile] : `${WHO[profile]}: ${lowerFirst(WHY[topic][profile])}`;
  return {
    whatHappened: whatHappened(result),
    whyItMatters: why,
    nextSteps: nextStepIds(result, context).map((id) => ({ id, text: stepText(id, result, context) })),
    source: "template",
  };
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}
