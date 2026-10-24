import { z } from "zod";

// Zod schemas for API input and for the TripResult that /api/explain receives back from the client.

export const ProfileSchema = z.enum(["wheelchair", "stroller", "no_stairs"]);

export const StationSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  lines: z.array(z.string()),
  wheelchairBoarding: z.enum(["accessible", "not_accessible", "unknown"]),
  lat: z.number(),
  lng: z.number(),
});

export const AlertSchema = z.object({
  id: z.string().min(1),
  effect: z.string(),
  header: z.string(),
  description: z.string(),
  stationIds: z.array(z.string()),
  facilityIds: z.array(z.string()),
  activePeriod: z.array(z.object({ start: z.string(), end: z.string().nullable() })),
  severity: z.number(),
  updatedAt: z.string(),
});

export const ReasonSchema = z.object({ code: z.string(), stationId: z.string(), message: z.string() });

export const TripResultSchema = z.object({
  status: z.enum(["STEP_FREE", "NOT_STEP_FREE", "UNKNOWN"]),
  reasons: z.array(ReasonSchema),
  blockingAlerts: z.array(AlertSchema),
  infoAlerts: z.array(AlertSchema),
  alternative: StationSchema.nullable(),
  dataSource: z.enum(["live", "snapshot", "demo"]),
  fetchedAt: z.string(),
  isStale: z.boolean(),
});

export const ExplainRequestSchema = z.object({ tripResult: TripResultSchema, profile: ProfileSchema });

export const StatusQuerySchema = z.object({
  origin: z.string().min(1, "origin is required"),
  destination: z.string().min(1, "destination is required"),
  profile: ProfileSchema,
});

export const AlternativesQuerySchema = z.object({
  stationId: z.string().min(1, "stationId is required"),
  profile: ProfileSchema.default("wheelchair"),
});

export const StationFilterQuerySchema = z.object({ stationId: z.string().min(1).optional() });

export const DemoQuerySchema = z.object({
  scenario: z.enum([
    "elevator-outage-alewife",
    "backup-elevator-alewife",
    "plan-b-davis",
    "planned-outage",
    "all-clear",
    "api-down",
  ]),
});

export const ExplanationItemSchema = z.object({ alertId: z.string(), text: z.string().min(1).max(1200) });

export const ExplainResponseSchema = z.object({
  explanations: z.array(ExplanationItemSchema),
  summary: z.string().min(1).max(1200),
  usedAI: z.boolean(),
});

export type ExplainRequest = z.infer<typeof ExplainRequestSchema>;
export type ExplainResponse = z.infer<typeof ExplainResponseSchema>;
