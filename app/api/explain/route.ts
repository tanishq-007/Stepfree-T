import { ExplainRequestSchema } from "@/lib/api/schemas";
import { badRequest } from "@/lib/api/http";
import { explainTrip } from "@/lib/ai/explain";

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

  const { tripResult, profile, context } = parsed.data;
  const explanation = await explainTrip(tripResult, profile, {}, context); // never throws
  return Response.json({
    ...explanation,
    dataSource: tripResult.dataSource,
    fetchedAt: tripResult.fetchedAt,
  });
}
