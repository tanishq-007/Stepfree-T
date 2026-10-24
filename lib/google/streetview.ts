import { cached } from "@/lib/data/cache";
import type { AccessibleEntrance } from "@/lib/data/entrances";
import { bearingDegrees, type LatLng } from "@/lib/engine/geo";
import { assertGoogleOk, GoogleApiError, googleFetch, ONE_HOUR_MS } from "./config";
import { StreetViewMetadataSchema, type StreetViewMetadata } from "./schemas";

export const STREETVIEW_METADATA_URL = "https://maps.googleapis.com/maps/api/streetview/metadata";
export const STREETVIEW_IMAGE_URL = "https://maps.googleapis.com/maps/api/streetview";
export const IMAGE_SIZE = "640x400";
export const IMAGE_FOV = 80;
export const IMAGE_PITCH = 0;
/** What the browser may cache a picture for. No picture is ever written to disk on the server. */
export const IMAGE_CACHE_CONTROL = "public, max-age=3600";

/** Where the nearest Street View panorama is, and which way to point the camera so it faces the entrance. */
export type PhotoResult =
  | { available: false }
  | {
      available: true;
      captureDate: string | null;
      copyright: string | null;
      point: LatLng;
      /** Compass bearing in [0, 360) from the panorama to the entrance. */
      heading: number;
    };

/** A status that is not OK and not ZERO_RESULTS (REQUEST_DENIED, OVER_QUERY_LIMIT, ...). Never cached. */
class StreetViewStatusError extends Error {
  constructor(readonly status: string) {
    super(`Street View metadata status ${status}`);
  }
}

async function fetchMetadata(point: LatLng, key: string): Promise<StreetViewMetadata> {
  const url = new URL(STREETVIEW_METADATA_URL);
  url.searchParams.set("location", `${point.lat},${point.lng}`);
  url.searchParams.set("source", "outdoor");
  url.searchParams.set("key", key); // the metadata endpoint has no header option: the key must be in the URL
  const res = await googleFetch(url.toString());
  await assertGoogleOk(res, "Google Street View metadata");
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new GoogleApiError("Google Street View metadata is not JSON", res.status);
  }
  const parsed = StreetViewMetadataSchema.safeParse(body);
  if (!parsed.success) throw new GoogleApiError("Google Street View metadata has an unexpected shape", res.status);
  if (parsed.data.status !== "OK" && parsed.data.status !== "ZERO_RESULTS") throw new StreetViewStatusError(parsed.data.status);
  return parsed.data;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The Street View picture for one accessible entrance. Metadata is free and cached for an hour per point.
 * A status other than OK means "no picture": { available: false }.
 * Throws GoogleApiError when Google cannot be reached (the caller decides what that means for the rider).
 */
export async function resolvePhoto(entrance: AccessibleEntrance, key: string): Promise<PhotoResult> {
  const point = entrance.point;
  let meta: StreetViewMetadata;
  try {
    meta = await cached(`google:streetview-meta:${point.lat},${point.lng}`, ONE_HOUR_MS, () => fetchMetadata(point, key));
  } catch (err) {
    if (err instanceof StreetViewStatusError) {
      console.warn("[google] Street View metadata status:", err.status);
      return { available: false };
    }
    throw err;
  }
  if (meta.status !== "OK" || !meta.location) return { available: false };
  return {
    available: true,
    captureDate: meta.date ?? null,
    copyright: meta.copyright ?? null,
    point,
    heading: round2(bearingDegrees({ lat: meta.location.lat, lng: meta.location.lng }, point)) % 360,
  };
}

/** The Street View Static API URL for a picture. It contains the key: it must never leave the server. */
export function buildImageUrl(target: Extract<PhotoResult, { available: true }>, key: string): string {
  const url = new URL(STREETVIEW_IMAGE_URL);
  url.searchParams.set("size", IMAGE_SIZE);
  url.searchParams.set("location", `${target.point.lat},${target.point.lng}`);
  url.searchParams.set("fov", String(IMAGE_FOV));
  url.searchParams.set("pitch", String(IMAGE_PITCH));
  url.searchParams.set("heading", String(target.heading));
  url.searchParams.set("source", "outdoor");
  url.searchParams.set("return_error_code", "true");
  url.searchParams.set("key", key);
  return url.toString();
}

/** Throws GoogleApiError unless Google answered with an image. */
export async function requireImage(res: Response, what: string): Promise<Response> {
  if (!res.ok) {
    void res.body?.cancel().catch(() => undefined);
    throw new GoogleApiError(`${what} returned HTTP ${res.status}`, res.status);
  }
  if (!(res.headers.get("content-type") ?? "").startsWith("image/")) {
    void res.body?.cancel().catch(() => undefined);
    throw new GoogleApiError(`${what} answer was not an image`, res.status);
  }
  return res;
}

/** Fetches the Street View picture. Throws GoogleApiError unless Google answered with an image. */
export async function fetchStreetViewImage(target: Extract<PhotoResult, { available: true }>, key: string): Promise<Response> {
  return requireImage(await googleFetch(buildImageUrl(target, key)), "Google Street View image");
}
