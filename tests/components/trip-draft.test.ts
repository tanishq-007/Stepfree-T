// Map trip selection ("Start here" / "Go here"): the draft can never become an invalid trip, and only an
// explicit apply turns it into a Trip with the rider's profile.
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { draftProblem, draftReducer, draftToTrip, EMPTY_DRAFT, isDirty, type DraftAction, type TripDraft } from "@/lib/client/trip-draft";

const IDS = ["place-harsq", "place-dwnxg", "place-alfcl", "place-pktrm"];
const known = new Set(IDS);
const idArb = fc.constantFrom(...IDS);
const actionArb: fc.Arbitrary<DraftAction> = fc.oneof(
  idArb.map((id) => ({ type: "setOrigin" as const, id })),
  idArb.map((id) => ({ type: "setDestination" as const, id })),
  fc.constant({ type: "swap" as const }),
  fc.constant({ type: "clear" as const }),
  fc.tuple(fc.option(idArb, { nil: null }), fc.option(idArb, { nil: null })).map(([o, d]) => ({ type: "reset" as const, originId: o, destinationId: d })),
);
const run = (actions: DraftAction[], start: TripDraft = EMPTY_DRAFT) => actions.reduce(draftReducer, start);

describe("draftReducer", () => {
  it("plans Harvard to Downtown Crossing by clicking stations", () => {
    const d = run([
      { type: "setOrigin", id: "place-harsq" },
      { type: "setDestination", id: "place-dwnxg" },
    ]);
    expect(d).toEqual({ originId: "place-harsq", destinationId: "place-dwnxg" });
    expect(draftToTrip(d, "stroller", known)).toEqual({ originId: "place-harsq", destinationId: "place-dwnxg", profile: "stroller" });
  });

  it("never lets start and end be the same station, for any sequence of clicks", () => {
    fc.assert(
      fc.property(fc.array(actionArb, { maxLength: 12 }), (actions) => {
        const d = run(actions);
        if (d.originId !== null) expect(d.originId).not.toBe(d.destinationId);
      }),
    );
  });

  it("picking the other end's station moves it instead of duplicating it", () => {
    const d = run([{ type: "setOrigin", id: "place-harsq" }, { type: "setDestination", id: "place-harsq" }]);
    expect(d).toEqual({ originId: null, destinationId: "place-harsq" });
  });

  it("swap twice is a no-op, and clear empties", () => {
    fc.assert(
      fc.property(fc.array(actionArb, { maxLength: 8 }), (actions) => {
        const d = run(actions);
        expect(run([{ type: "swap" }, { type: "swap" }], d)).toEqual(d);
        expect(draftReducer(d, { type: "clear" })).toEqual(EMPTY_DRAFT);
      }),
    );
  });
});

describe("draftToTrip / draftProblem", () => {
  it("only produces a trip for two distinct known stations, keeping the given profile", () => {
    fc.assert(
      fc.property(fc.option(fc.constantFrom(...IDS, "not-a-station"), { nil: null }), fc.option(fc.constantFrom(...IDS, "not-a-station"), { nil: null }), fc.constantFrom("wheelchair" as const, "stroller" as const, "no_stairs" as const), (o, d, profile) => {
        const draft = { originId: o, destinationId: d };
        const trip = draftToTrip(draft, profile, known);
        const ok = o !== null && d !== null && o !== d && known.has(o) && known.has(d);
        expect(trip === null).toBe(!ok);
        expect(draftProblem(draft, known) === null).toBe(ok);
        if (trip) expect(trip).toEqual({ originId: o, destinationId: d, profile });
      }),
    );
  });

  it("names the missing piece so the bar can say what to do next", () => {
    expect(draftProblem(EMPTY_DRAFT, known)).toBe("MISSING_ORIGIN");
    expect(draftProblem({ originId: "place-harsq", destinationId: null }, known)).toBe("MISSING_DESTINATION");
    expect(draftProblem({ originId: "place-harsq", destinationId: "zzz" }, known)).toBe("UNKNOWN_STATION");
  });
});

describe("isDirty", () => {
  it("is false only when the draft is exactly the evaluated trip", () => {
    expect(isDirty({ originId: "a", destinationId: "b" }, { originId: "a", destinationId: "b" })).toBe(false);
    expect(isDirty({ originId: "b", destinationId: "a" }, { originId: "a", destinationId: "b" })).toBe(true);
    expect(isDirty(EMPTY_DRAFT, {})).toBe(false);
  });
});
