import { describe, it, expect, vi, beforeEach } from "vitest";
import { RedisCacheMiddleware } from "./redis-cache.js";
import type { NormalizedResponse } from "../pipeline/types.js";
import { makeMockContext } from "../__tests__/helpers/mock-context.js";

function makeMockResponse(): NormalizedResponse {
  return {
    content: "Hello there!",
    stopReason: "end_turn",
    inputTokens: 10,
    outputTokens: 5,
    rawBody: { id: "resp-1" },
  };
}

function makeMockRedis() {
  return {
    get: vi.fn(),
    setex: vi.fn(),
  } as any;
}

describe("RedisCacheMiddleware", () => {
  let redis: ReturnType<typeof makeMockRedis>;
  let middleware: RedisCacheMiddleware;

  beforeEach(() => {
    redis = makeMockRedis();
    middleware = new RedisCacheMiddleware(redis, 300);
  });

  it('has correct name "redis-cache" and phase "both"', () => {
    expect(middleware.name).toBe("redis-cache");
    expect(middleware.phase).toBe("both");
  });

  it("continues on cache miss (request phase)", async () => {
    redis.get.mockResolvedValue(null);

    const ctx = makeMockContext();
    const result = await middleware.process(ctx);

    expect(result.action).toBe("continue");
    expect(redis.get).toHaveBeenCalledOnce();
    // Cache key should be stored in metadata for response phase
    expect(ctx.metadata.cacheKey).toBeDefined();
    expect(typeof ctx.metadata.cacheKey).toBe("string");
  });

  it("short-circuits on cache hit (request phase)", async () => {
    const cachedResponse = makeMockResponse();
    redis.get.mockResolvedValue(JSON.stringify(cachedResponse));

    const ctx = makeMockContext();
    const result = await middleware.process(ctx);

    expect(result.action).toBe("short-circuit");
    if (result.action === "short-circuit") {
      expect(result.response.content).toBe("Hello there!");
      expect(result.response.inputTokens).toBe(10);
      expect(result.response.outputTokens).toBe(5);
    }
    expect(ctx.cacheHit).toBe(true);
  });

  it("stores response in Redis on response phase (SETEX with TTL)", async () => {
    redis.setex.mockResolvedValue("OK");

    const ctx = makeMockContext();
    const response = makeMockResponse();
    ctx.response = response;
    ctx.cacheHit = false;
    ctx.metadata.cacheKey = "cache:abc123";

    const result = await middleware.process(ctx);

    expect(result.action).toBe("continue");
    expect(redis.setex).toHaveBeenCalledOnce();
    expect(redis.setex).toHaveBeenCalledWith(
      "cache:abc123",
      300,
      JSON.stringify(response),
    );
  });

  it("does NOT store if cacheHit is true", async () => {
    const ctx = makeMockContext();
    ctx.response = makeMockResponse();
    ctx.cacheHit = true;
    ctx.metadata.cacheKey = "cache:abc123";

    const result = await middleware.process(ctx);

    expect(result.action).toBe("continue");
    expect(redis.setex).not.toHaveBeenCalled();
  });

  it("continues gracefully on Redis error (fail-open)", async () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    // Request phase: Redis GET throws
    redis.get.mockRejectedValue(new Error("Connection refused"));

    const ctx = makeMockContext();
    const result = await middleware.process(ctx);

    expect(result.action).toBe("continue");
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("continues gracefully on Redis SETEX error (fail-open)", async () => {
    const consoleSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});

    redis.setex.mockRejectedValue(new Error("Connection refused"));

    const ctx = makeMockContext();
    ctx.response = makeMockResponse();
    ctx.cacheHit = false;
    ctx.metadata.cacheKey = "cache:abc123";

    const result = await middleware.process(ctx);

    expect(result.action).toBe("continue");
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
