import { z } from "zod";
import type { Trip } from "@/lib/types";
import { ProfileSchema } from "@/lib/api/schemas";

const TRIP_KEY = "accesspath.trip";
const TripSchema = z.object({ originId: z.string().min(1), destinationId: z.string().min(1), profile: ProfileSchema });

export function loadTrip(): Trip | null {
  try {
    const raw = window.localStorage.getItem(TRIP_KEY);
    if (!raw) return null;
    const parsed = TripSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveTrip(trip: Trip): void {
  window.localStorage.setItem(TRIP_KEY, JSON.stringify(trip));
}

export function clearTrip(): void {
  window.localStorage.removeItem(TRIP_KEY);
}

/** A copy of the trip with a new profile. Station ids are never touched. Pure. */
export function withProfile(trip: Trip, profile: Trip["profile"]): Trip {
  return { originId: trip.originId, destinationId: trip.destinationId, profile };
}
