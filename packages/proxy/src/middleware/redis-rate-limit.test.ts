import { describe, it, expect, vi, beforeEach } from "vitest";
import { RedisRateLimitMiddleware } from "./redis-rate-limit.js";
import { makeMockContext } from "../__tests__/helpers/mock-context.js";

function makeMockRedis() {
  return {
    eval: vi.fn(),
  } as any;
}

describe("RedisRateLimitMiddleware", () => {
  let redis: ReturnType<typeof makeMockRedis>;
  let middleware: RedisRateLimitMiddleware;

  beforeEach(() => {
    redis = makeMockRedis();
    middleware = new RedisRateLimitMiddleware(redis, {
      requestsPerMinute: 60,
    });
  });

  it('has correct name "redis-rate-limit" and phase "request"', () => {
    expect(middleware.name).toBe("redis-rate-limit");
    expect(middleware.phase).toBe("request");
  });

  it("continues when under limit", async () => {
    // eval returns [current_count, ttl]
    redis.eval.mockResolvedValue([1, 60]);

    const ctx = makeMockContext();
    const result = await middleware.process(ctx);

    expect(result.action).toBe("continue");
    expect(redis.eval).toHaveBeenCalledOnce();

    // Verify the key includes the agent name
    const callArgs = redis.eval.mock.calls[0];
    expect(callArgs[2]).toBe("ratelimit:test-agent"); // KEYS[1]
    expect(callArgs[3]).toBe(60); // ARGV[1] = limit
    expect(callArgs[4]).toBe(60); // ARGV[2] = window in seconds
  });

  it("blocks when over limit (429)", async () => {
    // Current count exceeds limit
    redis.eval.mockResolvedValue([61, 45]);

    const ctx = makeMockContext();
    const result = await middleware.process(ctx);

    expect(result.action).toBe("block");
    if (result.action === "block") {
      expect(result.statusCode).toBe(429);
      expect(result.reason).toContain("Rate limit exceeded");
    }
    expect(ctx.metadata.retryAfterSeconds).toBe(45);
  });

  it("uses agent-specific limits when configured", async () => {
    const mw = new RedisRateLimitMiddleware(redis, {
      requestsPerMinute: 60,
      agentOverrides: {
        "slow-agent": 10,
      },
    });

    redis.eval.mockResolvedValue([1, 60]);

    const ctx = makeMockContext({ agentName: "slow-agent" });
    const result = await mw.process(ctx);

    expect(result.action).toBe("continue");

    // Verify the limit passed to the Lua script is the agent override
    const callArgs = redis.eval.mock.calls[0];
    expect(callArgs[2]).toBe("ratelimit:slow-agent");
    expect(callArgs[3]).toBe(10); // ARGV[1] = agent-specific limit
  });

  it("uses sourceIp when no agentName is set", async () => {
    redis.eval.mockResolvedValue([1, 60]);

    const ctx = makeMockContext({ agentName: undefined, sourceIp: "192.168.1.1" });
    const result = await middleware.process(ctx);

    expect(result.action).toBe("continue");
    const callArgs = redis.eval.mock.calls[0];
    expect(callArgs[2]).toBe("ratelimit:192.168.1.1");
  });

  it('uses "global" key when neither agentName nor sourceIp is set', async () => {
    redis.eval.mockResolvedValue([1, 60]);

    const ctx = makeMockContext({ agentName: undefined, sourceIp: undefined });
    const result = await middleware.process(ctx);

    expect(result.action).toBe("continue");
    const callArgs = redis.eval.mock.calls[0];
    expect(callArgs[2]).toBe("ratelimit:global");
  });

  it("fails open on Redis error (continues)", async () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    redis.eval.mockRejectedValue(new Error("Connection refused"));

    const ctx = makeMockContext();
    const result = await middleware.process(ctx);

    expect(result.action).toBe("continue");
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("blocks at exactly the limit boundary", async () => {
    // Count equals limit exactly — should still be allowed (<=)
    redis.eval.mockResolvedValue([60, 30]);

    const ctx = makeMockContext();
    const result = await middleware.process(ctx);

    expect(result.action).toBe("continue");
  });

  it("blocks one past the limit", async () => {
    redis.eval.mockResolvedValue([61, 30]);

    const ctx = makeMockContext();
    const result = await middleware.process(ctx);

    expect(result.action).toBe("block");
    if (result.action === "block") {
      expect(result.statusCode).toBe(429);
    }
    expect(ctx.metadata.retryAfterSeconds).toBe(30);
  });
});
