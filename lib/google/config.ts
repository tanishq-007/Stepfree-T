// Server-only helpers for Google Maps Platform. Never import this file from a component or a client hook:
// it reads the API key. Browser code imports `./types` only.

import { z } from "zod";
import { GoogleErrorBodySchema } from "./schemas";

export const GOOGLE_TIMEOUT_MS = 5000;
export const ONE_HOUR_MS = 3_600_000;

/** The key, or undefined when it is not set (or blank). Read on every call so tests and deploys can change it. */
export function googleMapsKey(): string | undefined {
  const key = process.env.GOOGLE_MAPS_API_KEY?.trim();
  return key ? key : undefined;
}

/**
 * A failed Google call. The message is built here from fixed words and a status code. It never contains text
 * from Google or from the network layer: a Street View URL carries the key, and a network error can repeat the URL.
 */
export class GoogleApiError extends Error {
  constructor(
    message: string,
    readonly httpStatus: number | null = null,
  ) {
    super(message);
    this.name = "GoogleApiError";
  }
}

/** fetch with a timeout. A thrown error is replaced by a fixed message (its text could contain the key). */
export async function googleFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GOOGLE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal, cache: "no-store" });
  } catch {
    throw new GoogleApiError("Google request failed (network error or timeout)");
  } finally {
    clearTimeout(timer);
  }
}

const StatusWord = z.string().regex(/^[A-Z_]{3,40}$/);

/** Throws a GoogleApiError for a non-2xx answer. Adds Google's status word (for example PERMISSION_DENIED) only if it is a plain enum. */
export async function assertGoogleOk(res: Response, what: string): Promise<void> {
  if (res.ok) return;
  let word = "";
  try {
    const body = GoogleErrorBodySchema.safeParse(await res.json());
    const status = body.success ? StatusWord.safeParse(body.data.error?.status) : null;
    if (status?.success) word = ` (${status.data})`;
  } catch {
    // The body was not JSON. The status code alone is enough.
  }
  throw new GoogleApiError(`${what} returned HTTP ${res.status}${word}`, res.status);
}

/** What a route sends when Google fails. Fixed text, so nothing from Google or the network can leak. */
export const GOOGLE_UNAVAILABLE_MESSAGE = "Google Maps is not available right now. Try again in a few minutes.";

/** Logs a failure for the person running the app. Only our own fixed message is logged. */
export function logGoogleFailure(err: unknown): void {
  console.error("[google]", err instanceof GoogleApiError ? err.message : "unexpected error");
}
