/**
 * @jest-environment node
 *
 * Tests for the MCP endpoint's per-IP rate limiter. Upstash is mocked so the
 * three states can be driven directly — disabled (no creds), allowed, and
 * over-budget — plus the two fail-open guarantees (no creds, and Redis errors).
 * The module reads env + builds the limiter at import time, so each scenario
 * re-imports it under a controlled environment.
 */

type LimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

// Prefixed `mock*` so Jest allows referencing it inside the hoisted factory.
let mockLimit: (key: string) => Promise<LimitResult>;
let mockLastKey: string | undefined;
let mockLastRate: number | undefined;

jest.mock("@upstash/redis", () => ({
  Redis: jest.fn().mockImplementation(() => ({})),
}));
jest.mock("@upstash/ratelimit", () => ({
  Ratelimit: Object.assign(
    jest.fn().mockImplementation(() => ({
      limit: (key: string, opts?: { rate?: number }) => {
        mockLastKey = key;
        mockLastRate = opts?.rate;
        return mockLimit(key);
      },
    })),
    { slidingWindow: jest.fn(() => "sliding-window") },
  ),
}));

const ORIGINAL_ENV = process.env;

async function load(env: Record<string, string | undefined>) {
  jest.resetModules();
  process.env = { ...ORIGINAL_ENV, ...env };
  return import("./ratelimit");
}

function req(headers: Record<string, string> = {}, body?: unknown): Request {
  return new Request("https://x/api/mcp", {
    method: "POST",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function toolCall(name: string): Request {
  return req({}, { jsonrpc: "2.0", method: "tools/call", params: { name } });
}

beforeEach(() => {
  mockLastKey = undefined;
  mockLastRate = undefined;
  mockLimit = async () => ({
    success: true,
    limit: 30,
    remaining: 29,
    reset: Date.now() + 60_000,
  });
});
afterAll(() => {
  process.env = ORIGINAL_ENV;
});

const CREDS = {
  UPSTASH_REDIS_REST_URL: "https://fake.upstash.io",
  UPSTASH_REDIS_REST_TOKEN: "tok",
};

describe("fail-open when disabled", () => {
  test("no credentials → limiter inert, every request passes", async () => {
    const { enforceRateLimit, rateLimitEnabled } = await load({
      UPSTASH_REDIS_REST_URL: undefined,
      UPSTASH_REDIS_REST_TOKEN: undefined,
    });
    expect(rateLimitEnabled).toBe(false);
    expect(await enforceRateLimit(req())).toBeNull();
  });
});

describe("enabled with credentials", () => {
  test("under budget → allowed (null)", async () => {
    const { enforceRateLimit, rateLimitEnabled } = await load(CREDS);
    expect(rateLimitEnabled).toBe(true);
    expect(await enforceRateLimit(req())).toBeNull();
  });

  test("over budget → 429 with Retry-After and ratelimit headers", async () => {
    const reset = Date.now() + 15_000;
    mockLimit = async () => ({
      success: false,
      limit: 30,
      remaining: 0,
      reset,
    });
    const { enforceRateLimit } = await load(CREDS);

    const res = await enforceRateLimit(req());
    expect(res).not.toBeNull();
    expect(res?.status).toBe(429);
    expect(res?.headers.get("x-ratelimit-limit")).toBe("30");
    expect(res?.headers.get("x-ratelimit-remaining")).toBe("0");
    const retry = Number(res?.headers.get("retry-after"));
    expect(retry).toBeGreaterThan(0);
    expect(retry).toBeLessThanOrEqual(15);

    const body = await res?.json();
    expect(body.jsonrpc).toBe("2.0");
    expect(body.error.message).toMatch(/rate limit exceeded/i);
  });

  test("Redis error → fail-open (allowed), does not throw", async () => {
    mockLimit = async () => {
      throw new Error("redis unreachable");
    };
    const { enforceRateLimit } = await load(CREDS);
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    expect(await enforceRateLimit(req())).toBeNull();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("client IP keying", () => {
  test("on Vercel, prefers x-vercel-forwarded-for over a caller-supplied x-forwarded-for", async () => {
    const { enforceRateLimit } = await load({ ...CREDS, VERCEL: "1" });
    // The whole point of the preference: x-forwarded-for is appended to, so a
    // caller can put anything in its leftmost slot. Keying on that would let one
    // client mint a fresh bucket per request. The Vercel-set header wins.
    await enforceRateLimit(
      req({
        "x-forwarded-for": "203.0.113.99",
        "x-vercel-forwarded-for": "1.2.3.4",
      }),
    );
    expect(mockLastKey).toBe("1.2.3.4");
  });

  test("off Vercel, ignores a caller-supplied x-vercel-forwarded-for (not trustworthy without Vercel's proxy)", async () => {
    const { enforceRateLimit } = await load({ ...CREDS, VERCEL: undefined });
    // Self-hosted deployments (per mcp/README.md) have no Vercel proxy to set
    // or strip this header, so a caller could set it to a fresh value on every
    // request and mint a new bucket each time. Must not be trusted here.
    await enforceRateLimit(
      req({
        "x-forwarded-for": "203.0.113.99",
        "x-vercel-forwarded-for": "1.2.3.4",
      }),
    );
    expect(mockLastKey).toBe("203.0.113.99");
  });

  test("uses the first hop of x-forwarded-for", async () => {
    const { enforceRateLimit } = await load(CREDS);
    await enforceRateLimit(req({ "x-forwarded-for": "1.2.3.4, 10.0.0.1" }));
    expect(mockLastKey).toBe("1.2.3.4");
  });

  test("falls back to x-real-ip, then anonymous", async () => {
    const { enforceRateLimit } = await load(CREDS);
    await enforceRateLimit(req({ "x-real-ip": "9.9.9.9" }));
    expect(mockLastKey).toBe("9.9.9.9");
    await enforceRateLimit(req());
    expect(mockLastKey).toBe("anonymous");
  });
});

describe("tool cost weighting", () => {
  test("get_range_grid consumes more tokens than get_gto_strategy", async () => {
    const { enforceRateLimit } = await load(CREDS);

    await enforceRateLimit(toolCall("get_range_grid"));
    expect(mockLastRate).toBe(10);

    await enforceRateLimit(toolCall("get_gto_strategy"));
    expect(mockLastRate).toBe(1);
  });

  test("non tools/call requests (e.g. initialize) default to 1 token", async () => {
    const { enforceRateLimit } = await load(CREDS);
    await enforceRateLimit(
      req({}, { jsonrpc: "2.0", method: "initialize", params: {} }),
    );
    expect(mockLastRate).toBe(1);
  });

  test("an unlisted tool name defaults to 1 token", async () => {
    const { enforceRateLimit } = await load(CREDS);
    await enforceRateLimit(toolCall("some_future_tool"));
    expect(mockLastRate).toBe(1);
  });

  test("a body-less or malformed request defaults to 1 token instead of throwing", async () => {
    const { enforceRateLimit } = await load(CREDS);
    await expect(enforceRateLimit(req())).resolves.toBeNull();
    expect(mockLastRate).toBe(1);

    const malformed = new Request("https://x/api/mcp", {
      method: "POST",
      body: "{not json",
    });
    await expect(enforceRateLimit(malformed)).resolves.toBeNull();
    expect(mockLastRate).toBe(1);
  });

  test("peeking the tool name leaves the body intact for the downstream handler", async () => {
    const { enforceRateLimit } = await load(CREDS);
    const request = toolCall("get_range_grid");
    await enforceRateLimit(request);
    const body = await request.json();
    expect(body.params.name).toBe("get_range_grid");
  });
});
