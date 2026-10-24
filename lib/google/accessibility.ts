import type { Tri } from "./types";

/** Only a real boolean says anything. Missing, null and every other value are "unknown", never "yes". */
export function triState(value: unknown): Tri {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

export interface AccessibilitySummary {
  restroom: Tri;
  entrance: Tri;
  parking: Tri;
  seating: Tri;
}

/** Maps Google's `accessibilityOptions` (often absent, often partial) to yes / no / unknown for each field. */
export function normalizeAccessibility(options: unknown): AccessibilitySummary {
  const o = typeof options === "object" && options !== null ? (options as Record<string, unknown>) : {};
  return {
    restroom: triState(o.wheelchairAccessibleRestroom),
    entrance: triState(o.wheelchairAccessibleEntrance),
    parking: triState(o.wheelchairAccessibleParking),
    seating: triState(o.wheelchairAccessibleSeating),
  };
}
