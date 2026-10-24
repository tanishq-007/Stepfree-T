// In-memory TTL cache with in-flight de-duplication.
// Keeps us under the keyless MBTA rate limit (20 requests/minute).

export const DEFAULT_TTL_MS = 60_000;

interface Entry {
  value: unknown;
  expiresAt: number;
}

// Held on globalThis so every route bundle (Next compiles each route separately) shares ONE cache.
// Without this each route would call MBTA on its own and the keyless rate limit would be hit in seconds.
interface CacheState {
  store: Map<string, Entry>;
  inflight: Map<string, Promise<unknown>>;
}
const g = globalThis as typeof globalThis & { __accesspathCache?: CacheState };
const state: CacheState = (g.__accesspathCache ??= { store: new Map(), inflight: new Map() });
const { store, inflight } = state;

export async function cached<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  nowMs: () => number = Date.now,
): Promise<T> {
  const hit = store.get(key);
  if (hit && hit.expiresAt > nowMs()) return hit.value as T;

  const pending = inflight.get(key);
  if (pending) return pending as Promise<T>;

  const promise = loader()
    .then((value) => {
      store.set(key, { value, expiresAt: nowMs() + ttlMs });
      return value;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, promise);
  return promise;
}

/** Stores a value we already have, so a later `cached(key, ...)` call finds it instead of loading it again. */
export function primeCache<T>(key: string, ttlMs: number, value: T, nowMs: () => number = Date.now): void {
  store.set(key, { value, expiresAt: nowMs() + ttlMs });
}

export function clearCache(): void {
  store.clear();
  inflight.clear();
}
