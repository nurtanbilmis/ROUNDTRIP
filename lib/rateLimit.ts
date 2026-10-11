/**
 * Small in-memory, per-instance rate limiter (fixed window per key).
 * On serverless hosts each instance keeps its own counters, so this is a soft
 * limit that stops casual abuse, not a hard guarantee.
 */
export function createRateLimiter(max: number, windowMs: number) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return function allow(key: string): boolean {
    const now = Date.now();

    // Opportunistic cleanup so the map cannot grow without bound
    if (hits.size > 10_000) {
      for (const [k, record] of hits) {
        if (now > record.resetAt) hits.delete(k);
      }
    }

    const record = hits.get(key);
    if (!record || now > record.resetAt) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (record.count >= max) return false;
    record.count += 1;
    return true;
  };
}
