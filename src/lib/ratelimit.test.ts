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

jest.mock("@upstash/redis", () => ({
  Redis: jest.fn().mockImplementation(() => ({})),
}));
jest.mock("@upstash/ratelimit", () => ({
  Ratelimit: Object.assign(
    jest.fn().mockImplementation(() => ({
      limit: (key: string) => {
        mockLastKey = key;
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

function req(headers: Record<string, string> = {}): Request {
  return new Request("https://x/api/mcp", { method: "POST", headers });
}

beforeEach(() => {
  mockLastKey = undefined;
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
