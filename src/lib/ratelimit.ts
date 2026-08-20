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

/** Token budget per IP per rolling window. Tune for interactive agent use. */
const LIMIT = 30;
const WINDOW = "60 s" as const;

/**
 * Tokens consumed per call, by MCP tool name. Tools differ hugely in compute
 * cost: `get_range_grid` pushes the full 169-class expansion through the ONNX
 * session per call (13 pairs × 6 + 78 suited × 4 + 78 offsuit × 12 = 1,326
 * rows, worst case preflop with no dead cards — see src/lib/gto/ranges.ts),
 * versus 1 row for `get_gto_strategy`. Metering both at the same 1 token
 * would leave the expensive tool effectively unbounded (see issue #13).
 *
 * The literal 1,326:1 ratio isn't used directly — weighting `get_range_grid`
 * by its true cost against the existing LIMIT=30 budget would reject it on
 * the very first call. TOOL_COST instead picks a smaller multiplier that
 * still caps it to a handful of calls per window (30 / 10 = 3), a steep cut
 * from the 30/window it got before while keeping it usable interactively.
 * Any tool not listed here (including future ones) defaults to 1 token.
 */
const TOOL_COST: Record<string, number> = {
  get_range_grid: 10,
};

/**
 * Tokens to consume for one call to `toolName`. Unknown or unlisted tools
 * (and non-tool-call requests, e.g. `initialize`/`tools/list`) cost 1.
 */
function tokenCost(toolName: string | undefined): number {
  if (!toolName) return 1;
  return TOOL_COST[toolName] ?? 1;
}

/**
 * Best-effort extraction of the MCP tool name from a `tools/call` JSON-RPC
 * request body, without consuming the body the downstream handler still
 * needs to read. `req.clone()` gives an independent stream to peek at;
 * anything that isn't a JSON `tools/call` (SSE GETs, `initialize`, malformed
 * bodies) falls through to `undefined`, which costs the default 1 token.
 */
async function toolNameFromBody(req: Request): Promise<string | undefined> {
  try {
    const body = (await req.clone().json()) as {
      method?: string;
      params?: { name?: string };
    };
    if (body?.method === "tools/call") return body.params?.name;
  } catch {
    // No body, not JSON, or already consumed — treat as default cost.
  }
  return undefined;
}

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

  const rate = tokenCost(await toolNameFromBody(req));

  let result: Awaited<ReturnType<Ratelimit["limit"]>>;
  try {
    result = await limiter.limit(clientIp(req), { rate });
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
        message: `Rate limit exceeded — ${limit} tokens per ${WINDOW} (this call cost ${rate}). Retry in ${retryAfter}s.`,
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
