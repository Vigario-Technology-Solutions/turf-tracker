/**
 * Per-IP rate limiter for public endpoints that don't go through
 * Better-Auth's built-in limiter (the password-reset routes today;
 * future invite-accept etc.).
 *
 * Better-Auth's `customRules` only applies to its own routes
 * (`/sign-in/email`, `/sign-up/email`, `/forget-password`); our app-
 * router routes at `/api/password-reset/*` aren't reached by it.
 * Without this, an attacker can hammer `/request` to spam reset
 * emails at arbitrary addresses, or hammer `/accept` to brute-force
 * tokens (computationally infeasible against 256-bit tokens but
 * still floods logs + journal). Same shape as
 * vis-daily-tracker/src/lib/auth/rate-limit.ts.
 *
 * In-memory, single-process. If turf ever grows to multiple Node
 * processes behind a load balancer, move to Redis / Upstash so the
 * limit holds across processes. For the current single-process RPM
 * deployment this is sufficient.
 *
 * Sliding window: each bucket records its first-request timestamp.
 * Requests inside the window count up; once the window expires the
 * bucket resets on the next request. Periodic pruning every 1000
 * checks to bound memory.
 */

interface Bucket {
  count: number;
  start: number;
}

const buckets = new Map<string, Bucket>();

let checkCount = 0;
function maybePrune(windowMs: number): void {
  checkCount++;
  if (checkCount < 1000) return;
  checkCount = 0;
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.start > windowMs * 2) {
      buckets.delete(key);
    }
  }
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number,
): RateLimitResult {
  const windowMs = windowSeconds * 1000;
  const now = Date.now();

  maybePrune(windowMs);

  const existing = buckets.get(key);

  if (!existing || now - existing.start > windowMs) {
    buckets.set(key, { count: 1, start: now });
    return { allowed: true };
  }

  if (existing.count >= maxRequests) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((existing.start + windowMs - now) / 1000),
    };
  }

  existing.count += 1;
  return { allowed: true };
}

/**
 * Pull the caller's IP from the proxy chain. Apache's snippet sets
 * `X-Forwarded-For: <client>` for every request — first comma-
 * separated entry is the originating client. Falls back to "unknown"
 * when no header is present (direct dev hits without a proxy), which
 * means every unkeyed request shares a single bucket — fine for
 * single-dev local work, dangerous in prod if the proxy is ever
 * misconfigured to strip the header. Worth a follow-up audit if the
 * journal shows "unknown"-bucketed traffic in production.
 */
export function callerIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return "unknown";
}

/**
 * Convenience: builds a JSON 429 response with the Retry-After
 * header per RFC 6585. Routes can `return tooManyRequests(rl)` after
 * a failed checkRateLimit() call.
 */
export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  if (result.allowed || !result.retryAfterSeconds) return {};
  return { "Retry-After": String(result.retryAfterSeconds) };
}
