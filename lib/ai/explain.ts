import { z } from "zod";
import type { TripResult, UserProfile } from "@/lib/types";
import { ExplanationItemSchema, GuideSchema, type ExplainContext, type ExplainResponse, type Guide } from "@/lib/api/schemas";
import { fallbackExplanation } from "./fallback-templates";
import { templateGuide } from "./guide";

export const AI_TIMEOUT_MS = 8000;
const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const DEFAULT_MODEL = "claude-haiku-4-5";

const SYSTEM_PROMPT = [
  "You rewrite MBTA subway alerts for riders who need step-free travel.",
  "Rewrite each alert at a grade 6 reading level, in short sentences with everyday words.",
  "For each alert say: what is broken, what it means for this rider profile, and what to do next.",
  "Never invent facts that are not in the alert or the trip data. No phone numbers, times, or station names that are not in the input.",
  "Never claim a station is accessible or step-free unless the input status says STEP_FREE.",
  "The status is decided by a deterministic rules engine. Never change it, soften it, or contradict it.",
  "Also rewrite the guide: whatHappened (the one main problem), whyItMatters (why it matters for this exact profile), and nextSteps.",
  "For nextSteps, reword ONLY the steps given in draftGuide.nextSteps. Keep every id exactly. Do not add, remove or invent steps, routes, times, or working elevators.",
  'Reply with JSON only, no markdown: {"summary": string, "explanations": [{"alertId": string, "text": string}], "guide": {"whatHappened": string, "whyItMatters": string, "nextSteps": [{"id": string, "text": string}]}}.',
  "Include exactly one explanation for every alert id given, and also a short summary of the whole trip result.",
].join(" ");

const ModelOutputSchema = z.object({
  summary: z.string().min(1).max(1200),
  explanations: z.array(ExplanationItemSchema),
  // Optional: if the model omits it, the deterministic guide is used and labelled "template".
  guide: GuideSchema.optional(),
});

export function buildModelInput(result: TripResult, profile: UserProfile, context?: ExplainContext): string {
  const alerts = [...result.blockingAlerts, ...result.infoAlerts].map((a) => ({
    alertId: a.id,
    effect: a.effect,
    blocking: result.blockingAlerts.some((b) => b.id === a.id),
    header: a.header,
    description: a.description.slice(0, 700),
  }));
  return JSON.stringify({
    profile,
    status: result.status,
    isStale: result.isStale,
    dataSource: result.dataSource,
    fetchedAt: result.fetchedAt,
    origin: context?.originName ?? null,
    destination: context?.destinationName ?? null,
    route: context?.route ?? null,
    transferStations: context?.transferStationNames ?? [],
    coverage: "Only the start and end stations are checked. Transfer stations are not.",
    reasons: result.reasons.map((r) => r.message),
    alternativeStation: result.alternative?.name ?? null,
    alerts,
    draftGuide: templateGuide(result, profile, context),
  });
}

function extractJson(text: string): unknown {
  const cleaned = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("no JSON object in model output");
  return JSON.parse(cleaned.slice(start, end + 1));
}

// A model that says "is accessible" about a trip we did not verify has broken the safety contract.
const POSITIVE_CLAIM = /\b(is|are|remains?|looks?)\s+(now\s+|fully\s+)?(step-free|wheelchair accessible|accessible)\b/i;
// And one that calls a verified trip blocked or uncertain has contradicted the engine.
const NEGATIVE_CLAIM = /\b(not step-free|cannot confirm|can't confirm|not accessible|inaccessible)\b/i;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Station names the AI is allowed to mention: the ones the engine and the alerts actually used.
 * Any other known station name in AI text is treated as invented and the output is rejected.
 */
export function allowedStationNames(result: TripResult, context?: ExplainContext): Set<string> {
  const allowed = new Set<string>();
  for (const n of [context?.originName, context?.destinationName, result.alternative?.name, ...(context?.transferStationNames ?? [])]) {
    if (n) allowed.add(n);
  }
  const corpus = [...result.reasons.map((r) => r.message), ...[...result.blockingAlerts, ...result.infoAlerts].flatMap((a) => [a.header, a.description])].join("\n");
  for (const n of context?.stationNames ?? []) if (new RegExp(`\\b${escapeRe(n)}\\b`).test(corpus)) allowed.add(n);
  return allowed;
}

export function inventedStation(texts: string[], result: TripResult, context?: ExplainContext): string | null {
  const known = context?.stationNames ?? [];
  if (known.length === 0) return null;
  const allowed = allowedStationNames(result, context);
  const joined = texts.join("\n");
  // Longest names first, and blank out allowed names so "Park Street" is not flagged as "Park".
  let scrubbed = joined;
  for (const n of [...allowed].sort((a, b) => b.length - a.length)) scrubbed = scrubbed.replace(new RegExp(`\\b${escapeRe(n)}\\b`, "g"), " ");
  for (const n of [...known].sort((a, b) => b.length - a.length)) {
    if (allowed.has(n)) continue;
    if (new RegExp(`\\b${escapeRe(n)}\\b`).test(scrubbed)) return n;
  }
  return null;
}

/** Returns validated output or throws. Callers fall back to templates on any throw. */
export function validateModelOutput(raw: unknown, result: TripResult, context?: ExplainContext, profile: UserProfile = "wheelchair"): ExplainResponse {
  const parsed = ModelOutputSchema.parse(raw);
  const expected = [...result.blockingAlerts, ...result.infoAlerts].map((a) => a.id);
  const byId = new Map(parsed.explanations.map((e) => [e.alertId, e.text] as const));
  const explanations = expected.map((id) => {
    const text = byId.get(id);
    if (!text) throw new Error(`model skipped alert ${id}`);
    return { alertId: id, text };
  });

  // Next steps are chosen by templates from the data. The AI may reword them, not add or drop them.
  const draft = templateGuide(result, profile, context);
  let guide: Guide = draft;
  if (parsed.guide) {
    const aiGuide = parsed.guide;
    const wanted = draft.nextSteps.map((s) => s.id);
    const got = aiGuide.nextSteps.map((s) => s.id);
    if (wanted.length !== got.length || new Set(got).size !== got.length || wanted.some((id) => !got.includes(id))) {
      throw new Error("model changed the set of next steps");
    }
    guide = {
      whatHappened: aiGuide.whatHappened,
      whyItMatters: aiGuide.whyItMatters,
      nextSteps: wanted.map((id) => aiGuide.nextSteps.find((s) => s.id === id) ?? { id, text: id }),
      source: "ai",
    };
  }

  const texts = [parsed.summary, ...explanations.map((e) => e.text), guide.whatHappened, guide.whyItMatters, ...guide.nextSteps.map((s) => s.text)];
  if (result.status !== "STEP_FREE" && texts.some((t) => POSITIVE_CLAIM.test(t))) {
    throw new Error("model claimed accessibility without verified data");
  }
  if (result.status === "STEP_FREE" && [parsed.summary, guide.whatHappened].some((t) => NEGATIVE_CLAIM.test(t))) {
    throw new Error("model contradicted a verified step-free result");
  }
  const invented = inventedStation(texts, result, context);
  if (invented) throw new Error(`model named a station not in the evidence: ${invented}`);
  return { explanations, summary: parsed.summary, usedAI: true, guide };
}

export interface ExplainDeps {
  apiKey?: string | undefined;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  model?: string | undefined;
}

async function callAnthropic(result: TripResult, profile: UserProfile, deps: ExplainDeps, apiKey: string, context?: ExplainContext): Promise<ExplainResponse> {
  const doFetch = deps.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? AI_TIMEOUT_MS);
  try {
    const res = await doFetch(ANTHROPIC_URL, {
      method: "POST",
      signal: controller.signal,
      headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: deps.model ?? process.env.ANTHROPIC_MODEL ?? DEFAULT_MODEL,
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildModelInput(result, profile, context) }],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic responded ${res.status}`);
    const body: unknown = await res.json();
    const text = z
      .object({ content: z.array(z.object({ type: z.string(), text: z.string().optional() }).passthrough()) })
      .parse(body)
      .content.map((c) => c.text ?? "")
      .join("");
    return validateModelOutput(extractJson(text), result, context, profile);
  } finally {
    clearTimeout(timer);
  }
}

/** Never throws. AI when a key is set and the output validates; templates otherwise. */
export async function explainTrip(result: TripResult, profile: UserProfile, deps: ExplainDeps = {}, context?: ExplainContext): Promise<ExplainResponse> {
  const apiKey = deps.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallbackExplanation(result, profile, context);
  try {
    return await callAnthropic(result, profile, deps, apiKey, context);
  } catch {
    return fallbackExplanation(result, profile, context);
  }
}
