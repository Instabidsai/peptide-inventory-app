/**
 * Sliding-window rate limiter for Supabase Edge Functions.
 * Uses an in-memory Map per function instance (resets on cold start).
 * Limits: maxRequests per windowMs per user.
 */

interface RateLimitEntry {
  timestamps: number[];
}

const store = new Map<string, RateLimitEntry>();

interface RateLimitConfig {
  maxRequests: number; // e.g. 30
  windowMs: number;    // e.g. 60_000 (1 minute)
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 20,
  windowMs: 60_000, // 1 minute
};

/**
 * Check if a user is rate-limited.
 * Returns { allowed: true } or { allowed: false, retryAfterMs }.
 */
export function checkRateLimit(
  userId: string,
  config: Partial<RateLimitConfig> = {},
): { allowed: true } | { allowed: false; retryAfterMs: number } {
  const { maxRequests, windowMs } = { ...DEFAULT_CONFIG, ...config };
  const now = Date.now();
  const windowStart = now - windowMs;

  let entry = store.get(userId);
  if (!entry) {
    entry = { timestamps: [] };
    store.set(userId, entry);
  }

  // Prune old timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => t > windowStart);

  if (entry.timestamps.length >= maxRequests) {
    const oldestInWindow = entry.timestamps[0];
    const retryAfterMs = oldestInWindow + windowMs - now;
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
  }

  entry.timestamps.push(now);
  return { allowed: true };
}

/**
 * Helper to return a 429 Response.
 */
export function rateLimitResponse(
  retryAfterMs: number,
  corsHeaders: Record<string, string>,
): Response {
  const retryAfterSec = Math.ceil(retryAfterMs / 1000);
  return new Response(
    JSON.stringify({
      error: "Too many requests. Please slow down.",
      retry_after_seconds: retryAfterSec,
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": String(retryAfterSec),
      },
    },
  );
}
