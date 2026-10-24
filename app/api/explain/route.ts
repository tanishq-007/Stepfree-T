import { ExplainRequestSchema } from "@/lib/api/schemas";
import { badRequest } from "@/lib/api/http";
import { clientKey, explainAiLimiter } from "@/lib/api/rate-limit";
import { explainTrip } from "@/lib/ai/explain";
import { fallbackExplanation } from "@/lib/ai/fallback-templates";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest({ formErrors: ["Body must be valid JSON."], fieldErrors: {} });
  }
  const parsed = ExplainRequestSchema.safeParse(body);
  if (!parsed.success) return badRequest(parsed.error.flatten());

  const { tripResult, profile } = parsed.data;
  // Only paid AI calls are limited. Over the limit the rider still gets plain-language templates.
  const aiAllowed = !process.env.ANTHROPIC_API_KEY || explainAiLimiter.take(clientKey(request));
  const explanation = aiAllowed ? await explainTrip(tripResult, profile) : fallbackExplanation(tripResult, profile); // never throws
  return Response.json(
    {
      ...explanation,
      dataSource: tripResult.dataSource,
      fetchedAt: tripResult.fetchedAt,
    },
    aiAllowed ? undefined : { headers: { "x-ai-rate-limited": "1" } },
  );
}
