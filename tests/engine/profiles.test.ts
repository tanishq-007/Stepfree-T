// Profile copy must match the rules, comparisons must be the real engine, and switching profile must
// keep the trip's stations (I6).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Alert } from "@/lib/types";
import { impactFor, type AlertKind } from "@/lib/engine/rules";
import { compareProfiles, KIND_LABEL, PROFILE_IMPACT, PROFILES, profileDifferences } from "@/lib/engine/profiles";
import { evaluateTrip } from "@/lib/engine/evaluate-trip";
import { withProfile } from "@/lib/client/storage";
import { mixedAlertsArb, NOW, platformMapArb, profileArb, snapshotArb, tripArb } from "./arbitraries";

/** One alert per kind, built so alertKind() returns that kind. */
const SAMPLE: Record<AlertKind, Pick<Alert, "effect" | "header" | "description">> = {
  closure: { effect: "STATION_CLOSURE", header: "Closed", description: "" },
  access_issue: { effect: "ACCESS_ISSUE", header: "Ramp blocked", description: "" },
  elevator_outage: { effect: "ELEVATOR_CLOSURE", header: "Elevator out", description: "" },
  escalator_outage: { effect: "ESCALATOR_CLOSURE", header: "Escalator out", description: "" },
  uneven_platform: { effect: "ACCESS_ISSUE", header: "Uneven platform", description: "" },
  other: { effect: "STATION_ISSUE", header: "Notice", description: "" },
};

describe("PROFILE_IMPACT mirrors impactFor()", () => {
  it.each(PROFILES.flatMap((p) => (Object.keys(KIND_LABEL) as AlertKind[]).map((k) => [p, k] as const)))("%s / %s", (profile, kind) => {
    const alert: Alert = { id: "x", stationIds: [], facilityIds: [], activePeriod: [], severity: 1, updatedAt: "", ...SAMPLE[kind] };
    expect(PROFILE_IMPACT[profile][kind]).toBe(impactFor(alert, profile));
  });

  it("states the real differences: stroller = wheelchair, no_stairs differs only on uneven platforms", () => {
    expect(profileDifferences("wheelchair", "stroller")).toEqual([]);
    expect(profileDifferences("wheelchair", "no_stairs")).toEqual(["uneven_platform"]);
  });
});

describe("compareProfiles", () => {
  it("is exactly evaluateTrip per profile on the same data and clock", () => {
    fc.assert(
      fc.property(snapshotArb(mixedAlertsArb), tripArb, platformMapArb, (snap, trip, map) => {
        const out = compareProfiles(trip, snap, NOW, { kind: "direct", lines: ["Red"] }, map);
        expect(out.map((o) => o.profile)).toEqual([...PROFILES]);
        for (const o of out) {
          expect(o.status).toBe(evaluateTrip({ ...trip, profile: o.profile }, snap, NOW, map).status);
        }
      }),
    );
  });

  it("wheelchair and stroller always agree (no fabricated difference)", () => {
    fc.assert(
      fc.property(snapshotArb(mixedAlertsArb), tripArb, platformMapArb, (snap, trip, map) => {
        const [w, s] = compareProfiles(trip, snap, NOW, { kind: "direct", lines: ["Red"] }, map);
        expect(s?.status).toBe(w?.status);
      }),
    );
  });
});

describe("withProfile (I6)", () => {
  it("changes only the profile, keeping station ids byte-identical", () => {
    fc.assert(
      fc.property(tripArb, profileArb, (trip, profile) => {
        const next = withProfile(trip, profile);
        expect(next).toEqual({ originId: trip.originId, destinationId: trip.destinationId, profile });
        expect(trip.profile).toBe(trip.profile); // input not mutated
      }),
    );
  });
});
