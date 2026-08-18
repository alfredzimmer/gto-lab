/**
 * Per-IP rate limiting for the hosted MCP endpoint (src/app/api/[transport]),
 * so the shared instance can't be hammered. Uses @upstash/ratelimit over
 * Upstash Redis — connectionless HTTP, the standard for Vercel serverless.
 *
 * Fail-open: with no Upstash credentials in the environment (local dev, the
 * stdio server, self-hosters who don't want limiting) this is inert and every
 * request passes. It only engages once UPSTASH_REDIS_REST_URL and
 * UPSTASH_REDIS_REST_TOKEN are set.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/** Requests allowed per IP per rolling window. Tune for interactive agent use. */
const LIMIT = 30;
const WINDOW = "60 s" as const;

// One warm instance can serve many requests; an in-process cache lets obviously
// over-limit IPs short-circuit without a Redis round-trip every time.
const ephemeralCache = new Map<string, number>();

const limiter: Ratelimit | null = (() => {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null; // fail-open — no credentials, no limiting
  return new Ratelimit({
    redis: new Redis({ url, token }),
    limiter: Ratelimit.slidingWindow(LIMIT, WINDOW),
    ephemeralCache,
    prefix: "mcp",
    analytics: true,
  });
})();

/** True when limiting is actually active (credentials present). */
export const rateLimitEnabled = limiter !== null;

/**
 * True only inside an actual Vercel deployment — Vercel sets this itself in the
 * function's runtime env, so a caller can't spoof it by sending a header.
 * https://vercel.com/docs/environment-variables/system-environment-variables
 */
const ON_VERCEL = process.env.VERCEL === "1";

/**
 * Client IP to key the limit on, preferring the header the platform writes over
 * the one the caller can write.
 *
 * `x-forwarded-for` is caller-writable: proxies *append* to it, so its leftmost
 * entry is whatever the original client claimed about itself. Anywhere upstream
 * appends rather than overwrites, keying on that entry lets one caller mint a
 * fresh bucket per request and the limit stops binding at all.
 *
 * `x-vercel-forwarded-for` is set by Vercel's own proxy, which drops any
 * client-supplied copy, so it can't be forged — but only when a Vercel proxy is
 * actually in front of this process. mcp/README.md documents self-hosting with
 * rate limiting enabled, and off-Vercel nothing strips that header, so trusting
 * it unconditionally would let a self-hosted caller forge a fresh IP per
 * request and bypass the limit entirely. Only trust it on Vercel; fall back to
 * the previous chain everywhere else (self-hosted, local dev), where the
 * fallback is no worse than what it replaces.
 */
function clientIp(req: Request): string {
  if (ON_VERCEL) {
    const trusted = req.headers.get("x-vercel-forwarded-for");
    if (trusted) return trusted.split(",")[0].trim();
  }
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "anonymous";
}

/**
 * Enforce the per-IP limit for `req`. Returns a 429 `Response` to short-circuit
 * the route when the caller is over budget, or `null` to let it proceed
 * (including always, when limiting is disabled).
 */
export async function enforceRateLimit(req: Request): Promise<Response | null> {
  if (!limiter) return null;

  let result: Awaited<ReturnType<Ratelimit["limit"]>>;
  try {
    result = await limiter.limit(clientIp(req));
  } catch (err) {
    // A Redis outage must not take the endpoint down — fail open and log.
    console.error("rate limit check failed, allowing request:", err);
    return null;
  }

  const { success, limit, remaining, reset } = result;
  if (success) return null;

  const retryAfter = Math.max(0, Math.ceil((reset - Date.now()) / 1000));
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: {
        code: -32029, // implementation-defined; signals "slow down"
        message: `Rate limit exceeded — ${limit} requests per ${WINDOW}. Retry in ${retryAfter}s.`,
      },
      id: null,
    }),
    {
      status: 429,
      headers: {
        "content-type": "application/json",
        "retry-after": String(retryAfter),
        "x-ratelimit-limit": String(limit),
        "x-ratelimit-remaining": String(remaining),
        "x-ratelimit-reset": String(reset),
      },
    },
  );
}
