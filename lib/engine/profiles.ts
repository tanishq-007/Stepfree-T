// What each mobility profile ACTUALLY changes in the engine, and a real side-by-side comparison.
// PROFILE_IMPACT is checked against impactFor() by tests/engine/profiles.test.ts, so this table cannot
// drift from the rules. Nothing here decides a status: compareProfiles() calls evaluateTrip().
import type { AccessStatus, DataSnapshot, Trip, UserProfile } from "@/lib/types";
import { PLATFORM_MAP, type PlatformMap } from "@/lib/data/platform-map";
import { evaluateTrip } from "./evaluate-trip";
import { presentableStatus, type RouteRelationship } from "./journey";
import type { AlertImpact, AlertKind } from "./rules";

export const PROFILES: readonly UserProfile[] = ["wheelchair", "stroller", "no_stairs"];

export const PROFILE_LABEL: Record<UserProfile, string> = {
  wheelchair: "Wheelchair",
  stroller: "Stroller",
  no_stairs: "No stairs",
};

export const KIND_LABEL: Record<AlertKind, string> = {
  closure: "Station or stop closed",
  access_issue: "Access problem at the station",
  elevator_outage: "Elevator out of service",
  escalator_outage: "Escalator out of service",
  uneven_platform: "Uneven or hard-to-board platform",
  other: "Other MBTA notice",
};

/** Mirror of impactFor() in rules.ts. Verified by test for every kind and profile. */
export const PROFILE_IMPACT: Record<UserProfile, Record<AlertKind, AlertImpact>> = {
  wheelchair: { closure: "blocking", access_issue: "blocking", elevator_outage: "elevator", escalator_outage: "info", uneven_platform: "blocking", other: "info" },
  stroller: { closure: "blocking", access_issue: "blocking", elevator_outage: "elevator", escalator_outage: "info", uneven_platform: "blocking", other: "info" },
  no_stairs: { closure: "blocking", access_issue: "blocking", elevator_outage: "elevator", escalator_outage: "info", uneven_platform: "info", other: "info" },
};

export const IMPACT_LABEL: Record<AlertImpact, string> = {
  blocking: "Blocks the trip",
  elevator: "Blocks unless another checked elevator serves the same platform",
  info: "Notice only",
};

/** Plain description of a profile, written from PROFILE_IMPACT. */
export const PROFILE_SUMMARY: Record<UserProfile, string> = {
  wheelchair: "Needs a step-free path to the train. Closures, access problems, uneven platforms and uncovered elevator outages all block.",
  stroller: "Uses exactly the same checks as wheelchair today. The MBTA data has nothing that matters to a stroller but not a wheelchair.",
  no_stairs: "Same as wheelchair, except an uneven platform is a notice, not a blocker: it is a gap at the train door, not a staircase.",
};

/** Alert kinds whose impact differs between two profiles. Empty means the rules are identical. */
export function profileDifferences(a: UserProfile, b: UserProfile): AlertKind[] {
  return (Object.keys(KIND_LABEL) as AlertKind[]).filter((k) => PROFILE_IMPACT[a][k] !== PROFILE_IMPACT[b][k]);
}

export interface ProfileOutcome {
  profile: UserProfile;
  /** Engine verdict. */
  status: AccessStatus;
  /** What the UI shows after the journey cap. */
  displayed: AccessStatus;
  blockingAlertIds: string[];
}

/** The real engine verdict for every profile on the SAME snapshot and clock. */
export function compareProfiles(
  trip: Pick<Trip, "originId" | "destinationId">,
  snapshot: DataSnapshot,
  now: Date,
  journey: RouteRelationship,
  platformMap: PlatformMap = PLATFORM_MAP,
): ProfileOutcome[] {
  return PROFILES.map((profile) => {
    const r = evaluateTrip({ originId: trip.originId, destinationId: trip.destinationId, profile }, snapshot, now, platformMap);
    return {
      profile,
      status: r.status,
      displayed: presentableStatus(r, journey, trip.originId).status,
      blockingAlertIds: r.blockingAlerts.map((x) => x.id).sort(),
    };
  });
}
