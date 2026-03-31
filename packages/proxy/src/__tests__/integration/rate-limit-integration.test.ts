import { describe, it, expect, beforeEach } from "vitest";
import { Pipeline, PipelineBlockedError } from "../../pipeline/index.js";
import { RateLimitMiddleware } from "../../middleware/rate-limit.js";
import type { NormalizedResponse } from "../../pipeline/types.js";
import { makeMockContext } from "../helpers/mock-context.js";

function makeMockResponse(): NormalizedResponse {
  return {
    content: "Test response",
    stopReason: "end_turn",
    inputTokens: 10,
    outputTokens: 5,
    rawBody: { id: "resp-1" },
  };
}

describe("Rate Limit Integration", () => {
  let rateLimitMiddleware: RateLimitMiddleware;

  beforeEach(() => {
    rateLimitMiddleware?.reset();
  });

  it("under limit succeeds", async () => {
    rateLimitMiddleware = new RateLimitMiddleware({
      requestsPerMinute: 10,
    });

    const forwardFn = async () => makeMockResponse();
    const pipeline = new Pipeline(forwardFn);
    pipeline.use(rateLimitMiddleware);

    // Send 5 requests, all should succeed
    for (let i = 0; i < 5; i++) {
      const ctx = makeMockContext({ sourceIp: "10.0.0.1" });
      const result = await pipeline.run(ctx);
      expect(result.response).toBeDefined();
    }
  });

  it("over limit throws PipelineBlockedError", async () => {
    // Use a very low RPM so token refill between sequential calls is negligible
    rateLimitMiddleware = new RateLimitMiddleware({
      requestsPerMinute: 1,
    });

    const forwardFn = async () => makeMockResponse();
    const pipeline = new Pipeline(forwardFn);
    pipeline.use(rateLimitMiddleware);

    // First request succeeds (consumes the 1 token)
    const ctx1 = makeMockContext({ sourceIp: "10.0.0.1" });
    await pipeline.run(ctx1);

    // Second request should be blocked (no tokens left, refill rate is 1/60s)
    const ctx2 = makeMockContext({ sourceIp: "10.0.0.1" });
    await expect(pipeline.run(ctx2)).rejects.toThrow(PipelineBlockedError);
  });

  it("different IPs get independent rate limit buckets", async () => {
    rateLimitMiddleware = new RateLimitMiddleware({
      requestsPerMinute: 2,
    });

    const forwardFn = async () => makeMockResponse();
    const pipeline = new Pipeline(forwardFn);
    pipeline.use(rateLimitMiddleware);

    // IP A: 2 requests (fills bucket)
    for (let i = 0; i < 2; i++) {
      const ctx = makeMockContext({ sourceIp: "10.0.0.1" });
      await pipeline.run(ctx);
    }

    // IP A: third request is blocked
    const ctxA3 = makeMockContext({ sourceIp: "10.0.0.1" });
    await expect(pipeline.run(ctxA3)).rejects.toThrow(PipelineBlockedError);

    // IP B: first request should still succeed (independent bucket)
    const ctxB1 = makeMockContext({ sourceIp: "10.0.0.2" });
    const result = await pipeline.run(ctxB1);
    expect(result.response).toBeDefined();
  });

  it("blocked response has 429 status code", async () => {
    rateLimitMiddleware = new RateLimitMiddleware({
      requestsPerMinute: 1,
    });

    const forwardFn = async () => makeMockResponse();
    const pipeline = new Pipeline(forwardFn);
    pipeline.use(rateLimitMiddleware);

    // First request succeeds
    const ctx1 = makeMockContext({ sourceIp: "10.0.0.1" });
    await pipeline.run(ctx1);

    // Second request blocked
    const ctx2 = makeMockContext({ sourceIp: "10.0.0.1" });
    await expect(pipeline.run(ctx2)).rejects.toSatisfy((err: unknown) => {
      return err instanceof PipelineBlockedError && err.statusCode === 429;
    });
  });

  it("agent-specific overrides are respected", async () => {
    rateLimitMiddleware = new RateLimitMiddleware({
      requestsPerMinute: 10,
      agentOverrides: { "restricted-agent": 1 },
    });

    const forwardFn = async () => makeMockResponse();
    const pipeline = new Pipeline(forwardFn);
    pipeline.use(rateLimitMiddleware);

    // Restricted agent: first request ok
    const ctx1 = makeMockContext({ agentName: "restricted-agent" });
    await pipeline.run(ctx1);

    // Restricted agent: second request blocked
    const ctx2 = makeMockContext({ agentName: "restricted-agent" });
    await expect(pipeline.run(ctx2)).rejects.toThrow(PipelineBlockedError);

    // Normal agent: should still be allowed (global limit is 10)
    const ctx3 = makeMockContext({ agentName: "normal-agent", sourceIp: "10.0.0.99" });
    const result = await pipeline.run(ctx3);
    expect(result.response).toBeDefined();
  });
});
