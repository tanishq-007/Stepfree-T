// Server-render the presentational components and check the ACCESSIBILITY CONTRACT in the markup.
// These assertions intentionally focus on semantics (roles, labels, icon+text, status data
// attributes) rather than specific Tailwind colour classes, so visual restyles do not break them
// while the accessibility guarantees stay enforced.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import StatusBanner from "@/components/StatusBanner";
import DataSourceBadge from "@/components/DataSourceBadge";
import AlertCard from "@/components/AlertCard";
import AlternativeCard from "@/components/AlternativeCard";
import TripForm from "@/components/TripForm";
import PlanBCard from "@/components/PlanBCard";
import LaterTodayCard from "@/components/LaterTodayCard";
import type { PlanB } from "@/lib/engine/plan-b";
import type { Alert, Station } from "@/lib/types";

const alert: Alert = {
  id: "1", effect: "ELEVATOR_CLOSURE", header: "Alewife Elevator 813 is unavailable.", description: "",
  stationIds: ["place-alfcl"], facilityIds: ["813"], activePeriod: [{ start: "2026-10-24T00:00:00Z", end: null }], severity: 3, updatedAt: "",
};
const station: Station = { id: "place-davis", name: "Davis", lines: ["Red"], wheelchairBoarding: "accessible", lat: 1, lng: 2 };

describe("StatusBanner: icon AND text for every state, never colour alone", () => {
  it.each([
    ["STEP_FREE", "Step-free"],
    ["NOT_STEP_FREE", "Not step-free"],
    ["UNKNOWN", "Cannot confirm"],
  ] as const)("%s", (status, label) => {
    const html = renderToStaticMarkup(<StatusBanner status={status} headline="Plain words." routeLabel="A to B" />);
    // Text label present (not colour-only).
    expect(html).toContain(label);
    // An icon is rendered alongside the text, and is hidden from assistive tech.
    expect(html).toContain("<svg");
    expect(html).toContain('aria-hidden="true"');
    // Heading and accessible name are present.
    expect(html).toContain("<h2");
    expect(html).toContain("aria-label=");
    // Status is machine-readable (used by downstream styling/tests) independent of colour.
    expect(html).toContain('data-status="' + status + '"');
  });
});

describe("DataSourceBadge", () => {
  it.each([
    ["live", "Live"],
    ["snapshot", "Offline snapshot, not live"],
    ["demo", "Simulated demo data"],
  ] as const)("%s", (source, text) => {
    const html = renderToStaticMarkup(<DataSourceBadge source={source} />);
    expect(html).toContain(text);
    // Non-colour signal: the data source is exposed as a data attribute and as spoken text.
    expect(html).toContain('data-source="' + source + '"');
    // aria-label is not allowed on a <p> (axe aria-prohibited-attr), so the prefix is visually hidden text.
    expect(html).toContain('<span class="sr-only">Data source: </span>');
    expect(html).not.toContain("aria-label=");
  });
});

describe("AlertCard and AlternativeCard", () => {
  it("labels a blocking alert with words, and shows the plain text first", () => {
    const html = renderToStaticMarkup(<AlertCard alert={alert} blocking explanation="An elevator is out." />);
    expect(html).toContain("Blocks your trip");
    expect(html).toContain("An elevator is out.");
    expect(html).toContain("Original MBTA notice");
    // Icon accompanies the text label and is hidden from AT.
    expect(html).toContain("<svg");
  });

  it("falls back to the MBTA header when there is no explanation", () => {
    const html = renderToStaticMarkup(<AlertCard alert={alert} blocking={false} />);
    expect(html).toContain("Alewife Elevator 813 is unavailable.");
    expect(html).toContain("Good to know");
  });

  it("names the alternative and the station it replaces", () => {
    const html = renderToStaticMarkup(<AlternativeCard station={station} instead="Alewife" />);
    expect(html).toContain("Davis");
    expect(html).toContain("instead of Alewife");
    expect(html).toContain("aria-labelledby");
  });
});

describe("TripForm", () => {
  it("has visible From/To labels, a swap control, a radio group with a legend, and a 56px submit button", () => {
    const html = renderToStaticMarkup(<TripForm stations={[station]} onSave={() => undefined} />);
    // Directional endpoint labels (visible and associated with the selects).
    expect(html).toContain("From");
    expect(html).toContain("To");
    expect(html).toContain('for="origin-search"');
    expect(html).toContain('for="destination-search"');
    expect(html).toContain('aria-label="From: choose a station"');
    expect(html).toContain('aria-label="To: choose a station"');
    // Working swap control with an accessible name.
    expect(html).toContain('aria-label="Swap start and end stations"');
    // Travel-profile radio group.
    expect(html).toContain("<legend");
    expect(html.match(/type="radio"/g)).toHaveLength(3);
    // Submit affordance and live region.
    expect(html).toContain("Save trip");
    expect(html).toContain("min-h-[56px]");
    expect(html).toContain('aria-live="polite"');
  });
});

describe("StatusBanner data line", () => {
  it("shows where the answer comes from inside the banner", () => {
    const html = renderToStaticMarkup(<StatusBanner status="STEP_FREE" dataLine="According to MBTA data updated at 3:05 PM." />);
    expect(html).toContain("According to MBTA data updated at 3:05 PM.");
  });
});

describe("PlanBCard", () => {
  const davis: Station = { id: "place-davis", name: "Davis", lines: ["Red"], wheelchairBoarding: "accessible", lat: 1, lng: 2 };
  const porter: Station = { ...davis, id: "place-portr", name: "Porter" };
  const base = { stationId: "place-davis", stationName: "Davis" };

  it("names the single point of failure and the Plan B station", () => {
    const plan: PlanB = {
      status: "fragile",
      elevators: [
        { ...base, facilityId: "816", name: "Davis Elevator 816 (Platform to lobby)", role: "no_backup", alternative: porter },
        { ...base, facilityId: "817", name: "Davis Elevator 817 (Lobby to College Avenue)", role: "cannot_check", alternative: null },
      ],
    };
    const html = renderToStaticMarkup(<PlanBCard planB={plan} />);
    expect(html).toContain("Plan B: your trip depends on one elevator");
    expect(html).toContain("Davis Elevator 816 (Platform to lobby)");
    expect(html).toContain("use Porter instead");
    expect(html).toContain("We could not check a backup for 1 elevator");
    expect(html).toContain('aria-labelledby="planb-h"');
    expect(html).toContain('aria-hidden="true"');
  });

  it("says plainly when there is no single point of failure", () => {
    const html = renderToStaticMarkup(<PlanBCard planB={{ status: "resilient", elevators: [] }} />);
    expect(html).toContain("Plan B: you have a backup");
    expect(html).toContain("there is still a step-free way");
  });

  it("never offers a station when none was checked", () => {
    const plan: PlanB = { status: "fragile", elevators: [{ ...base, facilityId: "816", name: "Elevator 816", role: "no_backup", alternative: null }] };
    const html = renderToStaticMarkup(<PlanBCard planB={plan} />);
    expect(html).toContain("we did not find a checked station nearby");
    expect(html).not.toContain("instead");
  });
});

describe("LaterTodayCard", () => {
  it("gives the time, the station, what it means, and what to do", () => {
    const html = renderToStaticMarkup(
      <LaterTodayCard
        hours={12}
        stations={[station, null]}
        changes={[{ startsAt: "2026-10-24T23:00:00Z", status: "NOT_STEP_FREE", stationIds: ["place-davis"], alerts: [alert] }]}
      />,
    );
    expect(html).toContain("Later today (next 12 hours)");
    expect(html).toContain("the MBTA plans work at Davis");
    expect(html).toContain("this trip may not be step-free");
    expect(html).toContain("check again before you leave");
    expect(html).toContain("Original MBTA notice");
  });
});
