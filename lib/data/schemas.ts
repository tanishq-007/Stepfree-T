import { z } from "zod";

// Zod schemas for the MBTA V3 JSON:API responses. Written from the real fixtures in tests/fixtures.
// Lenient on purpose: .passthrough() everywhere and optional/nullable where the API is inconsistent.

const resourceId = z.object({ id: z.string(), type: z.string() }).passthrough();
const relationship = z.object({ data: resourceId.nullable().optional() }).passthrough();
const relationshipList = z.object({ data: z.array(resourceId).optional() }).passthrough();

export const RawStopSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    attributes: z
      .object({
        name: z.string(),
        latitude: z.number().nullable().optional(),
        longitude: z.number().nullable().optional(),
        location_type: z.number().optional(),
        wheelchair_boarding: z.number().nullable().optional(),
        platform_name: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
      })
      .passthrough(),
    relationships: z
      .object({ parent_station: relationship.optional(), child_stops: relationshipList.optional() })
      .passthrough()
      .optional(),
  })
  .passthrough();

const links = z.object({ next: z.string().optional() }).passthrough().optional();

export const RawStopsResponseSchema = z
  .object({ data: z.array(RawStopSchema), included: z.array(RawStopSchema).optional(), links })
  .passthrough();

/** `GET /stops/{id}?include=child_stops`: one stop in `data`, its children in `included`. */
export const RawStopWithChildrenSchema = z
  .object({ data: RawStopSchema, included: z.array(RawStopSchema).optional() })
  .passthrough();

export const RawFacilitySchema = z
  .object({
    id: z.string(),
    type: z.string(),
    attributes: z
      .object({
        long_name: z.string().nullable().optional(),
        short_name: z.string().nullable().optional(),
        type: z.string(),
        latitude: z.number().nullable().optional(),
        longitude: z.number().nullable().optional(),
        properties: z.array(z.object({ name: z.string(), value: z.unknown() }).passthrough()).optional(),
      })
      .passthrough(),
    relationships: z.object({ stop: relationship.optional() }).passthrough().optional(),
  })
  .passthrough();

export const RawFacilitiesResponseSchema = z
  .object({ data: z.array(RawFacilitySchema), included: z.array(RawStopSchema).optional(), links })
  .passthrough();

const informedEntity = z
  .object({
    stop: z.string().optional(),
    facility: z.string().optional(),
    route: z.string().optional(),
    route_type: z.number().optional(),
    activities: z.array(z.string()).optional(),
  })
  .passthrough();

export const RawAlertSchema = z
  .object({
    id: z.string(),
    type: z.string(),
    attributes: z
      .object({
        effect: z.string(),
        header: z.string().nullable().optional(),
        description: z.string().nullable().optional(),
        severity: z.number().nullable().optional(),
        lifecycle: z.string().nullable().optional(),
        created_at: z.string().nullable().optional(),
        updated_at: z.string().nullable().optional(),
        active_period: z
          .array(z.object({ start: z.string().nullable().optional(), end: z.string().nullable().optional() }).passthrough())
          .optional(),
        informed_entity: z.array(informedEntity).optional(),
      })
      .passthrough(),
  })
  .passthrough();

export const RawAlertsResponseSchema = z
  .object({ data: z.array(RawAlertSchema), links })
  .passthrough();

export type RawStopWithChildren = z.infer<typeof RawStopWithChildrenSchema>;
export type RawStop = z.infer<typeof RawStopSchema>;
export type RawStopsResponse = z.infer<typeof RawStopsResponseSchema>;
export type RawFacility = z.infer<typeof RawFacilitySchema>;
export type RawFacilitiesResponse = z.infer<typeof RawFacilitiesResponseSchema>;
export type RawAlert = z.infer<typeof RawAlertSchema>;
export type RawAlertsResponse = z.infer<typeof RawAlertsResponseSchema>;

// Schema for our own normalized snapshot (used when reading the committed snapshot file back).
export const DataSnapshotSchema = z.object({
  stations: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      lines: z.array(z.string()),
      wheelchairBoarding: z.enum(["accessible", "not_accessible", "unknown"]),
      lat: z.number(),
      lng: z.number(),
    }),
  ),
  facilities: z.array(
    z.object({
      id: z.string(),
      stationId: z.string(),
      type: z.enum(["elevator", "escalator"]),
      name: z.string(),
      servesPlatforms: z.union([z.array(z.string()), z.literal("unknown")]),
    }),
  ),
  alerts: z.array(
    z.object({
      id: z.string(),
      effect: z.string(),
      header: z.string(),
      description: z.string(),
      stationIds: z.array(z.string()),
      facilityIds: z.array(z.string()),
      activePeriod: z.array(z.object({ start: z.string(), end: z.string().nullable() })),
      severity: z.number(),
      updatedAt: z.string(),
    }),
  ),
  fetchedAt: z.string(),
  source: z.enum(["live", "snapshot", "demo"]),
});
