/**
 * Walking speed used to turn a straight-line distance into minutes. It is slow on purpose: a real walk is longer
 * than a straight line, and riders with a wheelchair or stroller may move slower than most people.
 */
export const WALK_METERS_PER_MINUTE = 60;

/** "about 3 minutes away". Rounded to whole minutes. */
export function describeWalk(meters: number): string {
  const minutes = Math.round(meters / WALK_METERS_PER_MINUTE);
  if (minutes < 1) return "less than a minute away";
  return minutes === 1 ? "about 1 minute away" : `about ${minutes} minutes away`;
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Google gives the photo date as "2024-06". Returns "June 2024", or null if the value is missing or not in that form. */
export function photoMonthYear(date: string | null | undefined): string | null {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/.exec(date ?? "");
  if (!match) return null;
  return `${MONTHS[Number(match[2]) - 1]} ${match[1]}`;
}

/** MBTA numbers some entrance names itself ("7 | Franklin St"). Our list has its own numbers, so drop MBTA's. */
export function plainEntranceName(name: string): string {
  const cleaned = name.replace(/^\s*\d+\s*\|\s*/, "").replace(/\s+/g, " ").trim();
  return cleaned || name.trim();
}

/** Alt text for the picture of one entrance: what it is and when it was taken. */
export function entrancePhotoAlt(entranceName: string, stationName: string, captureDate: string | null): string {
  const when = photoMonthYear(captureDate);
  return `Street-level photo facing the ${plainEntranceName(entranceName)} accessible entrance at ${stationName}, ${when ? `taken ${when}` : "date unknown"}.`;
}

/** "Photo facing this entrance, taken June 2024. May have changed." */
export function entrancePhotoCaption(captureDate: string | null): string {
  const when = photoMonthYear(captureDate);
  return `Photo facing this entrance, ${when ? `taken ${when}` : "date unknown"}. May have changed.`;
}

/** Alt text for the station map: how many entrances, and the number and name of each, in list order. */
export function entranceMapAlt(stationName: string, entranceNames: string[]): string {
  const count = entranceNames.length;
  const list = entranceNames.map((n, i) => `${i + 1}, ${plainEntranceName(n)}`).join("; ");
  return `Map of ${stationName} station showing ${count} accessible ${count === 1 ? "entrance" : "entrances"}: ${list}.`;
}

/** Who took the picture, when it is not Google ("© RoadTrip NewEngland" gives "RoadTrip NewEngland"). Null for Google or no value. */
export function photoProvider(copyright: string | null | undefined): string | null {
  const name = (copyright ?? "").replace(/^©\s*(\d{4}\s*)?/, "").trim();
  if (!name || /google/i.test(name)) return null;
  return name;
}

/** "3:05 PM" in the rider's own time zone, or "unknown time" for a bad value. */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "unknown time" : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
