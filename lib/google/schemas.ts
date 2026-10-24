import { z } from "zod";

// Zod schemas for the Google Maps Platform answers. Written from the real answers saved in tests/fixtures
// (places-nearby-*.json, streetview-metadata-*.json). Lenient on purpose: .passthrough() and optional fields,
// because Google leaves out whatever it does not know.

const localizedText = z.object({ text: z.string(), languageCode: z.string().optional() }).passthrough();

const accessibilityOptions = z
  .object({
    wheelchairAccessibleParking: z.boolean().optional(),
    wheelchairAccessibleEntrance: z.boolean().optional(),
    wheelchairAccessibleRestroom: z.boolean().optional(),
    wheelchairAccessibleSeating: z.boolean().optional(),
  })
  .passthrough();

export const GooglePlaceSchema = z
  .object({
    id: z.string().min(1),
    displayName: localizedText.optional(),
    location: z.object({ latitude: z.number(), longitude: z.number() }).passthrough().optional(),
    googleMapsUri: z.string().optional(),
    currentOpeningHours: z.object({ openNow: z.boolean().optional() }).passthrough().optional(),
    accessibilityOptions: accessibilityOptions.optional(),
  })
  .passthrough();

/**
 * The list is kept as `unknown[]` here and each place is parsed on its own, so one odd place never throws
 * away the other nineteen. No match at all answers `{}` (no `places` key).
 */
export const NearbySearchResponseSchema = z.object({ places: z.array(z.unknown()).optional() }).passthrough();

/** The error body Google sends, for example `{error: {code: 400, status: "INVALID_ARGUMENT", ...}}`. */
export const GoogleErrorBodySchema = z
  .object({ error: z.object({ status: z.string().optional() }).passthrough().optional() })
  .passthrough();

export const StreetViewMetadataSchema = z
  .object({
    status: z.string(),
    date: z.string().optional(),
    copyright: z.string().optional(),
    pano_id: z.string().optional(),
    location: z.object({ lat: z.number(), lng: z.number() }).passthrough().optional(),
  })
  .passthrough();

export type GooglePlace = z.infer<typeof GooglePlaceSchema>;
export type StreetViewMetadata = z.infer<typeof StreetViewMetadataSchema>;
