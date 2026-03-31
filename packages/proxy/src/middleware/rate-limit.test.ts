import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimitMiddleware } from "./rate-limit.js";
import type { RateLimitOptions } from "./rate-limit.js";
import { makeMockContext } from "../__tests__/helpers/mock-context.js";

function makeMockOptions(
  overrides: Partial<RateLimitOptions> = {},
): RateLimitOptions {
  return {
    requestsPerMinute: 60,
    ...overrides,
  };
}

describe("RateLimitMiddleware", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit", async () => {
    const opts = makeMockOptions({ requestsPerMinute: 10 });
    const mw = new RateLimitMiddleware(opts);

    const result = await mw.process(makeMockContext());
    expect(result.action).toBe("continue");
  });

  it("blocks the (n+1)th request when limit is 1/minute", async () => {
    const opts = makeMockOptions({ requestsPerMinute: 1 });
    const mw = new RateLimitMiddleware(opts);

    // First request should pass
    const result1 = await mw.process(makeMockContext());
    expect(result1.action).toBe("continue");

    // Second request should be blocked
    const result2 = await mw.process(makeMockContext());
    expect(result2.action).toBe("block");
    if (result2.action === "block") {
      expect(result2.statusCode).toBe(429);
    }
  });

  it("resets bucket after 1 minute", async () => {
    const opts = makeMockOptions({ requestsPerMinute: 1 });
    const mw = new RateLimitMiddleware(opts);

    // Consume the single token
    await mw.process(makeMockContext());

    // Second should be blocked
    const blocked = await mw.process(makeMockContext());
    expect(blocked.action).toBe("block");

    // Advance 1 minute
    vi.advanceTimersByTime(60_000);

    // Should now be allowed
    const result = await mw.process(makeMockContext());
    expect(result.action).toBe("continue");
  });

  it("uses agent-specific limit overrides", async () => {
    const opts = makeMockOptions({
      requestsPerMinute: 100,
      agentOverrides: { "slow-agent": 1 },
    });
    const mw = new RateLimitMiddleware(opts);

    // Global agent should be fine
    const globalResult = await mw.process(makeMockContext());
    expect(globalResult.action).toBe("continue");

    // "slow-agent" should get its own bucket with limit 1
    const agentCtx1 = makeMockContext({ agentName: "slow-agent" });
    const agentResult1 = await mw.process(agentCtx1);
    expect(agentResult1.action).toBe("continue");

    // Second request from "slow-agent" should be blocked
    const agentCtx2 = makeMockContext({ agentName: "slow-agent" });
    const agentResult2 = await mw.process(agentCtx2);
    expect(agentResult2.action).toBe("block");
  });
});
