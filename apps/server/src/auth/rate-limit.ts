const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 20;

/** In-memory limiter for login/signup: at most 20 attempts per IP per 15 minutes. */
export function createRateLimiter() {
  const attempts = new Map<string, { count: number; reset: number }>();

  return function isRateLimited(ip: string): boolean {
    const now = Date.now();
    if (attempts.size > 10_000) {
      for (const [k, v] of attempts) if (v.reset < now) attempts.delete(k);
    }
    const entry = attempts.get(ip);
    if (!entry || entry.reset < now) {
      attempts.set(ip, { count: 1, reset: now + WINDOW_MS });
      return false;
    }
    entry.count++;
    return entry.count > MAX_ATTEMPTS;
  };
}
