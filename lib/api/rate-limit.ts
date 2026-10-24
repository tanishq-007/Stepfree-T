// Fixed-window rate limiter, in memory. Used to cap paid AI calls from /api/explain.
// Limitation: each serverless instance keeps its own counts, so the real cap is "limit per instance".
// That is enough to stop one client from running up the Anthropic bill; it is not a security boundary.

export interface RateLimiter {
  /** Uses one request for `key`. Returns false when the key is over its limit for this window. */
  take(key: string, nowMs?: number): boolean;
  reset(): void;
}

export function createRateLimiter(limit: number, windowMs: number, maxKeys = 5000): RateLimiter {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return {
    take(key, nowMs = Date.now()) {
      const w = windows.get(key);
      if (!w || nowMs >= w.resetAt) {
        if (windows.size >= maxKeys) {
          for (const [k, v] of windows) if (nowMs >= v.resetAt) windows.delete(k);
          if (windows.size >= maxKeys) windows.clear(); // never grow without bound
        }
        windows.set(key, { count: 1, resetAt: nowMs + windowMs });
        return limit > 0;
      }
      if (w.count >= limit) return false;
      w.count += 1;
      return true;
    },
    reset() {
      windows.clear();
    },
  };
}

/** Best-effort client key from proxy headers (Vercel sets x-forwarded-for). */
export function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip")?.trim() || "anonymous";
}

function limitFromEnv(): number {
  const raw = Number(process.env.EXPLAIN_AI_LIMIT_PER_MINUTE);
  return Number.isFinite(raw) && raw >= 0 ? Math.floor(raw) : 10;
}

/** AI rewrites per client per minute for /api/explain. Over the limit, riders get the plain templates instead. */
export const explainAiLimiter: RateLimiter = createRateLimiter(limitFromEnv(), 60_000);
