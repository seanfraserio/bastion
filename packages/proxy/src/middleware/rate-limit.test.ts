import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { RateLimitMiddleware } from "./rate-limit.js";
import type { PipelineContext } from "../pipeline/types.js";
import type { BastionConfig } from "@openbastion-ai/config";

function makeMockContext(overrides: Partial<PipelineContext> = {}): PipelineContext {
  return {
    id: "test-id",
    requestId: "req-1",
    environment: "test",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    startTime: Date.now(),
    request: {
      model: "claude-sonnet-4-6",
      messages: [
        { role: "user", content: "Hello", rawContent: "Hello" },
      ],
      stream: false,
      rawBody: {},
    },
    decisions: [],
    cacheHit: false,
    fallbackUsed: false,
    metadata: {},
    ...overrides,
  };
}

function makeMockConfig(
  overrides: Partial<BastionConfig["rate_limits"]> = {},
): BastionConfig {
  return {
    version: "1",
    proxy: { port: 3000, host: "127.0.0.1", log_level: "info" },
    providers: {
      primary: "anthropic",
      definitions: {
        anthropic: { base_url: "https://api.anthropic.com" },
      },
    },
    rate_limits: {
      enabled: true,
      requests_per_minute: 60,
      tokens_per_minute: 100000,
      ...overrides,
    },
  } as BastionConfig;
}

describe("RateLimitMiddleware", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit", async () => {
    const config = makeMockConfig({ requests_per_minute: 10 });
    const mw = new RateLimitMiddleware(config);

    const result = await mw.process(makeMockContext());
    expect(result.action).toBe("continue");
  });

  it("blocks the (n+1)th request when limit is 1/minute", async () => {
    const config = makeMockConfig({ requests_per_minute: 1 });
    const mw = new RateLimitMiddleware(config);

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
    const config = makeMockConfig({ requests_per_minute: 1 });
    const mw = new RateLimitMiddleware(config);

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
    const config = makeMockConfig({
      requests_per_minute: 100,
      agents: [{ name: "slow-agent", requests_per_minute: 1 }],
    });
    const mw = new RateLimitMiddleware(config);

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
