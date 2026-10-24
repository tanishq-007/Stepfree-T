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

/**
 * Optional journey context (additive). Station names let the AI guard reject text that names a station
 * the engine did not return. Old clients that send only {tripResult, profile} keep working.
 */
export const ExplainContextSchema = z.object({
  originName: z.string().max(80).optional(),
  destinationName: z.string().max(80).optional(),
  route: z.enum(["direct", "transfer", "unknown"]).optional(),
  transferStationNames: z.array(z.string().max(80)).max(10).optional(),
  /** Every station name the rider could see, used only to detect invented station mentions. */
  stationNames: z.array(z.string().max(80)).max(300).optional(),
});
export type ExplainContext = z.infer<typeof ExplainContextSchema>;

export const ExplainRequestSchema = z.object({ tripResult: TripResultSchema, profile: ProfileSchema, context: ExplainContextSchema.optional() });

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
  scenario: z.enum(["elevator-outage-alewife", "all-clear", "api-down"]),
  // Optional and additive: older clients that send only `scenario` still get the wheelchair result.
  profile: ProfileSchema.default("wheelchair"),
});

export const ExplanationItemSchema = z.object({ alertId: z.string(), text: z.string().min(1).max(1200) });

/** Next-step actions are chosen by the templates from the result. The AI may only reword them by id. */
export const NextStepIdSchema = z.enum(["use-alternative", "read-notice", "refresh", "ask-staff", "check-transfer", "recheck-before-leaving"]);
export type NextStepId = z.infer<typeof NextStepIdSchema>;

/** Guide content (what the model may produce). */
export const GuideSchema = z.object({
  whatHappened: z.string().min(1).max(600),
  whyItMatters: z.string().min(1).max(600),
  nextSteps: z.array(z.object({ id: NextStepIdSchema, text: z.string().min(1).max(400) })).min(1).max(6),
});
export type GuideContent = z.infer<typeof GuideSchema>;

/** Guide as returned to the client, with where its text came from (drives the "AI-generated" badge). */
export const GuideResponseSchema = GuideSchema.extend({ source: z.enum(["ai", "template"]) });
export type Guide = z.infer<typeof GuideResponseSchema>;

export const ExplainResponseSchema = z.object({
  explanations: z.array(ExplanationItemSchema),
  summary: z.string().min(1).max(1200),
  usedAI: z.boolean(),
  guide: GuideResponseSchema.optional(),
});

export type ExplainRequest = z.infer<typeof ExplainRequestSchema>;
export type ExplainResponse = z.infer<typeof ExplainResponseSchema>;
