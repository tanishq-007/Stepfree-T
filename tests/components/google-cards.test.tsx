// RestroomCard and AccessibleEntranceCard. As in components.test.tsx these check meaning (roles, labels, wording, icon plus text),
// not Tailwind colours. The views take their state as a prop, so each state can be rendered without a network.
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RestroomCardView } from "@/components/RestroomCard";
import { AccessibleEntranceCardView } from "@/components/AccessibleEntranceCard";
import fc from "fast-check";
import { describeWalk, entranceMapAlt, entrancePhotoAlt, entrancePhotoCaption, photoMonthYear, photoProvider, plainEntranceName } from "@/lib/client/format";
import { buildMapMarkers } from "@/lib/google/staticmap";
import type { AccessibleEntranceInfo, EntrancePhotoInfo, EntrancesResponse, RestroomPlace, RestroomsResponse } from "@/lib/google/types";

const station = { id: "place-alfcl", name: "Alewife" };
const noop = () => undefined;

const place = (over: Partial<RestroomPlace> = {}): RestroomPlace => ({
  id: "p1",
  name: "Summer Shack",
  distanceMeters: 179,
  openNow: true,
  wheelchairRestroom: "yes",
  wheelchairEntrance: "yes",
  mapsUrl: "https://maps.google.com/?cid=1",
  ...over,
});
const restrooms = (places: RestroomPlace[]): RestroomsResponse => ({ stationId: "place-alfcl", places, source: "google", fetchedAt: "2026-10-24T19:05:00Z" });

describe("RestroomCard", () => {
  it("is collapsed by default, with a 44px heading button that names what it opens", () => {
    const html = renderToStaticMarkup(<RestroomCardView station={station} state={{ phase: "ready", data: restrooms([place()]) }} onRetry={noop} />);
    expect(html).toContain("Wheelchair-accessible restrooms near Alewife");
    expect(html).toMatch(/<h3[^>]*><button/); // the heading holds the button
    expect(html).toContain('aria-expanded="false"');
    expect(html).toMatch(/aria-controls="restrooms-panel-/);
    expect(html).toMatch(/<div id="restrooms-panel-[^"]*" hidden=""/); // panel exists but is hidden
    expect(html).toContain("min-h-[44px]");
    expect(html).toContain("1 reported");
  });

  it("shows name, walking time in plain words, hours as icon plus words, and a labelled Google Maps link", () => {
    const html = renderToStaticMarkup(<RestroomCardView station={station} state={{ phase: "ready", data: restrooms([place()]) }} onRetry={noop} />);
    expect(html).toContain("Summer Shack");
    expect(html).toContain("about 3 minutes away");
    expect(html).toContain("Open now");
    expect(html).toContain("Entrance is wheelchair accessible");
    expect(html).toContain(">Open in Google Maps<");
    expect(html).toContain('aria-label="Open in Google Maps: Summer Shack (opens in a new tab)"');
    expect(html).toContain('href="https://maps.google.com/?cid=1"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("btn-secondary"); // 44px button style from globals.css
    expect(html).toContain('aria-hidden="true"'); // decorative icons are hidden from screen readers
  });

  it.each([
    [true, "Open now"],
    [false, "Closed now"],
    [null, "Hours unknown"],
  ] as const)("hours %s reads '%s'", (openNow, words) => {
    const html = renderToStaticMarkup(<RestroomCardView station={station} state={{ phase: "ready", data: restrooms([place({ openNow })]) }} onRetry={noop} />);
    expect(html).toContain(words);
  });

  it.each([
    ["yes", "Entrance is wheelchair accessible"],
    ["no", "Entrance is not wheelchair accessible"],
    ["unknown", "Entrance access not reported"],
  ] as const)("entrance %s reads '%s'", (wheelchairEntrance, words) => {
    const html = renderToStaticMarkup(<RestroomCardView station={station} state={{ phase: "ready", data: restrooms([place({ wheelchairEntrance })]) }} onRetry={noop} />);
    expect(html).toContain(words);
  });

  it("always shows the note about where the data comes from", () => {
    for (const places of [[place()], []]) {
      const html = renderToStaticMarkup(<RestroomCardView station={station} state={{ phase: "ready", data: restrooms(places) }} onRetry={noop} />);
      expect(html).toContain("Reported by Google. May be incomplete. Some restrooms are for customers only.");
      expect(html).toContain("rough guesses");
    }
  });

  it("has an empty state that says what to do next", () => {
    const html = renderToStaticMarkup(<RestroomCardView station={station} state={{ phase: "ready", data: restrooms([]) }} onRetry={noop} />);
    expect(html).toContain("We could not find a reported wheelchair-accessible restroom nearby.");
    expect(html).toContain("Ask a station worker");
    expect(html).toContain("None reported");
    expect(html).not.toContain("<ul");
  });

  it("has an error state with role=alert and a retry button", () => {
    const html = renderToStaticMarkup(<RestroomCardView station={station} state={{ phase: "error" }} onRetry={noop} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Try again");
    expect(html).toContain("Wheelchair-accessible restrooms near Alewife");
  });

  it("renders nothing while loading and when the feature is off (no Google key)", () => {
    expect(renderToStaticMarkup(<RestroomCardView station={station} state={{ phase: "loading" }} onRetry={noop} />)).toBe("");
    expect(renderToStaticMarkup(<RestroomCardView station={station} state={{ phase: "ready", data: { enabled: false } }} onRetry={noop} />)).toBe("");
  });

  it("gives each card its own heading id when two stations show cards", () => {
    const html = renderToStaticMarkup(
      <>
        <RestroomCardView station={station} state={{ phase: "ready", data: restrooms([place()]) }} onRetry={noop} />
        <RestroomCardView station={{ id: "x", name: "Davis" }} state={{ phase: "ready", data: restrooms([place()]) }} onRetry={noop} />
      </>,
    );
    const ids = [...html.matchAll(/ id="(restrooms-h-[^"]*)"/g)].map((m) => m[1]);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});

const goodPhoto = (over: Partial<EntrancePhotoInfo> = {}): EntrancePhotoInfo => ({
  available: true,
  captureDate: "2024-06",
  copyright: "© 2024 Google",
  imageUrl: "/api/streetview/image?entranceId=door-1",
  ...over,
});
const entrance = (n: number, over: Partial<AccessibleEntranceInfo> = {}): AccessibleEntranceInfo => ({
  id: `door-${n}`,
  name: `Door ${n}`,
  lat: 42.39 + n / 1000,
  lng: -71.14,
  photo: goodPhoto({ imageUrl: `/api/streetview/image?entranceId=door-${n}` }),
  mapUrl: "/api/entrance-map?stationId=place-alfcl",
  googleMapsLink: `https://www.google.com/maps/search/?api=1&query=${42.39 + n / 1000},-71.14`,
  ...over,
});
const answer = (entrances: AccessibleEntranceInfo[]): EntrancesResponse => ({ stationId: "place-alfcl", stationName: "Alewife", entrances });
const renderCard = (entrances: AccessibleEntranceInfo[]) =>
  renderToStaticMarkup(<AccessibleEntranceCardView station={station} state={{ phase: "ready", data: answer(entrances) }} onRetry={noop} />);

describe("AccessibleEntranceCard", () => {
  it("is headed 'Accessible entrances at {station}' and shows the map first, then a numbered list", () => {
    const html = renderCard([entrance(1, { name: "Alewife Brook Pkwy elevator" }), entrance(2, { name: "Busway elevator" })]);
    expect(html).toMatch(/<h3[^>]*>Accessible entrances at Alewife<\/h3>/);
    expect(html.indexOf("<img")).toBeLessThan(html.indexOf("<ol")); // the map comes before the list
    expect(html).toContain('src="/api/entrance-map?stationId=place-alfcl"');
    expect(html).toContain('alt="Map of Alewife station showing 2 accessible entrances: 1, Alewife Brook Pkwy elevator; 2, Busway elevator."');
    expect(html).toMatch(/<ol/);
    expect(html).toContain('data-entrance-number="1"');
    expect(html).toContain('data-entrance-number="2"');
    expect(html).toContain("The number on each pin is the number in the list below. S is the station.");
  });

  it("shows, for each entrance, a lazy photo with the required alt text, caption and credit", () => {
    const html = renderCard([entrance(1, { name: "Alewife Brook Pkwy elevator" })]);
    expect(html).toContain('alt="Street-level photo facing the Alewife Brook Pkwy elevator accessible entrance at Alewife, taken June 2024."');
    expect(html).toContain('src="/api/streetview/image?entranceId=door-1"');
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("Photo facing this entrance, taken June 2024. May have changed.");
    expect(html).toContain("Image © Google");
    expect(html).toContain("A nearby building or vehicle may block the view.");
    expect(html).not.toContain("Photo provided by"); // a Google photo
  });

  it("names the provider when the photo is not Google's", () => {
    const html = renderCard([entrance(1, { photo: goodPhoto({ copyright: "© RoadTrip NewEngland", captureDate: "2020-07" }) })]);
    expect(html).toContain("Photo provided by RoadTrip NewEngland.");
    expect(html).toContain("taken July 2020");
  });

  it("links each entrance to Google Maps with the exact aria-label, and opens it safely in a new tab", () => {
    const html = renderCard([entrance(1, { name: "Busway elevator" })]);
    expect(html).toContain(">Open in Google Maps<");
    expect(html).toContain('aria-label="Open in Google Maps: Busway elevator location"');
    expect(html).toContain('href="https://www.google.com/maps/search/?api=1&amp;query=42.391,-71.14"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain("btn-secondary"); // 44px button from globals.css
    // WCAG 2.5.3 Label in Name: the accessible name must contain the words shown on the link.
    expect(html).toMatch(/aria-label="Open in Google Maps[^"]*"[^>]*>Open in Google Maps</);
  });

  it("shows MBTA's name without MBTA's own '7 | ' numbering, so it cannot clash with our numbers", () => {
    const html = renderCard([entrance(1, { name: "7 | Franklin St (Elevator)" })]);
    expect(html).toContain("Franklin St (Elevator)");
    expect(html).not.toContain("7 | Franklin");
    expect(html).toContain('aria-label="Open in Google Maps: Franklin St (Elevator) location"');
    expect(html).toContain("accessible entrance at Alewife"); // alt text uses the plain name
  });

  it("says 'No street photo available' only when Google answered that it has none, and nothing when we do not know", () => {
    const none = renderCard([entrance(1, { photo: { available: false, captureDate: null, copyright: null, imageUrl: null } })]);
    expect(none).toContain("No street photo available for this entrance.");
    expect(none).not.toContain("/api/streetview/image"); // no street photo is requested (the lazy map image is still there)
    const unknown = renderCard([entrance(1, { photo: null })]);
    expect(unknown).not.toContain("No street photo available");
    expect(unknown.slice(unknown.indexOf("<ol"))).not.toMatch(/<figure|<img/); // the list has no photo for it (the map above still shows)
  });

  it("without a Google key (photo and mapUrl are null) still shows the heading, numbered names and Maps links, but no map and no photos", () => {
    const html = renderCard([entrance(1, { photo: null, mapUrl: null, name: "Alewife Path East" }), entrance(2, { photo: null, mapUrl: null, name: "Alewife Path South" })]);
    expect(html).toContain("Accessible entrances at Alewife");
    expect(html).toContain("Alewife Path East");
    expect(html).toContain("Alewife Path South");
    expect(html).toContain('aria-label="Open in Google Maps: Alewife Path East location"');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<figure");
    expect(html).not.toContain("The number on each pin"); // no map, so no legend for it
  });

  it("says plainly when MBTA marks no entrance accessible, with no photo and no map", () => {
    const html = renderCard([]);
    expect(html).toContain("We couldn&#x27;t find an entrance marked wheelchair accessible for this station.");
    expect(html).toContain("Ask a station worker");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<ol");
    expect(html).not.toContain("Open in Google Maps");
    expect(html).toContain('data-entrances="none"');
  });

  it("has loading and error states; the error has role=alert and a retry button", () => {
    const loading = renderToStaticMarkup(<AccessibleEntranceCardView station={station} state={{ phase: "loading" }} onRetry={noop} />);
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-busy="true"');
    const error = renderToStaticMarkup(<AccessibleEntranceCardView station={station} state={{ phase: "error" }} onRetry={noop} />);
    expect(error).toContain('role="alert"');
    expect(error).toContain("Try again");
    expect(error).not.toContain("<img");
  });

  it("never prints a Google address or key", () => {
    const html = renderCard([entrance(1), entrance(2)]);
    expect(html).not.toMatch(/googleapis|[?&]key=/i);
  });

  it("uses headings in order: h3 for the card, h4 for each entrance", () => {
    const html = renderCard([entrance(1), entrance(2)]);
    expect(html.match(/<h3/g)).toHaveLength(1);
    expect(html.match(/<h4/g)).toHaveLength(2);
    expect(html).toContain("Entrance 1: ");
  });

  it("property: the list numbers always match the map's pin labels in count and order", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 3 }), (count) => {
        const entrances = Array.from({ length: count }, (_, i) => entrance(i + 1));
        const html = renderCard(entrances);
        const listNumbers = [...html.matchAll(/data-entrance-number="(\d+)"/g)].map((m) => m[1]);
        const pinLabels = buildMapMarkers({ lat: 42.4, lng: -71.1 }, entrances.map((e) => ({ point: { lat: e.lat, lng: e.lng } })))
          .filter((m) => m.label !== "S")
          .map((m) => m.label);
        expect(listNumbers).toEqual(pinLabels); // same count, same order, same numbers
        expect(listNumbers).toEqual(Array.from({ length: count }, (_, i) => String(i + 1)));
      }),
      { numRuns: 20 },
    );
    // the map's alt text also lists the entrances with the same numbers
    expect(entranceMapAlt("Alewife", ["A", "B", "C"])).toBe("Map of Alewife station showing 3 accessible entrances: 1, A; 2, B; 3, C.");
  });
});

describe("format helpers", () => {
  it.each([
    [0, "less than a minute away"],
    [29, "less than a minute away"],
    [30, "about 1 minute away"],
    [60, "about 1 minute away"],
    [179, "about 3 minutes away"],
    [400, "about 7 minutes away"],
    [800, "about 13 minutes away"],
  ])("describeWalk(%s m) = %s", (meters, words) => {
    expect(describeWalk(meters)).toBe(words);
  });

  it("photoMonthYear turns Google's YYYY-MM into words and rejects anything else", () => {
    expect(photoMonthYear("2024-06")).toBe("June 2024");
    expect(photoMonthYear("2026-09")).toBe("September 2026");
    for (const bad of [null, undefined, "", "2024", "2024-13", "2024-00", "June 2024", "2024-6"]) expect(photoMonthYear(bad)).toBeNull();
  });

  it("alt text, caption and map alt follow the brief", () => {
    expect(entrancePhotoAlt("Alewife Brook Pkwy elevator", "Alewife", "2024-06")).toBe("Street-level photo facing the Alewife Brook Pkwy elevator accessible entrance at Alewife, taken June 2024.");
    expect(entrancePhotoAlt("Door", "Alewife", null)).toBe("Street-level photo facing the Door accessible entrance at Alewife, date unknown.");
    expect(entrancePhotoCaption("2024-06")).toBe("Photo facing this entrance, taken June 2024. May have changed.");
    expect(entrancePhotoCaption(null)).toBe("Photo facing this entrance, date unknown. May have changed.");
    expect(entranceMapAlt("Alewife", ["Alewife Brook Pkwy elevator", "Busway elevator"])).toBe(
      "Map of Alewife station showing 2 accessible entrances: 1, Alewife Brook Pkwy elevator; 2, Busway elevator.",
    );
    expect(entranceMapAlt("Alewife", ["Only door"])).toBe("Map of Alewife station showing 1 accessible entrance: 1, Only door.");
  });

  it("plainEntranceName removes MBTA's own numbering and nothing else", () => {
    expect(plainEntranceName("7 | Franklin St")).toBe("Franklin St");
    expect(plainEntranceName("12|Atlantic Ave")).toBe("Atlantic Ave");
    expect(plainEntranceName("Alewife Path South")).toBe("Alewife Path South");
    expect(plainEntranceName("Buses, Alewife Path")).toBe("Buses, Alewife Path");
    expect(plainEntranceName("3 |")).toBe("3 |"); // never returns an empty name
  });

  it("photoProvider hides Google and names anyone else", () => {
    expect(photoProvider("© 2026 Google")).toBeNull();
    expect(photoProvider("© Google")).toBeNull();
    expect(photoProvider(null)).toBeNull();
    expect(photoProvider("")).toBeNull();
    expect(photoProvider("© RoadTrip NewEngland")).toBe("RoadTrip NewEngland");
    expect(photoProvider("© 2019 Some Person")).toBe("Some Person");
  });
});
