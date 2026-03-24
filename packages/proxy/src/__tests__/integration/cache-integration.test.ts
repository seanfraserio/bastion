import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Pipeline } from "../../pipeline/index.js";
import { CacheMiddleware } from "../../middleware/cache.js";
import type { NormalizedResponse } from "../../pipeline/types.js";
import { makeMockContext } from "../helpers/mock-context.js";

function makeMockResponse(overrides?: Partial<NormalizedResponse>): NormalizedResponse {
  return {
    content: "Test response",
    stopReason: "end_turn",
    inputTokens: 10,
    outputTokens: 5,
    rawBody: { id: "resp-1" },
    ...overrides,
  };
}

describe("Cache Integration", () => {
  let cacheMiddleware: CacheMiddleware;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cacheMiddleware?.clear();
  });

  it("cache miss then hit: provider called once for same request", async () => {
    cacheMiddleware = new CacheMiddleware({
      cache: { enabled: true, strategy: "exact", ttl_seconds: 3600, max_entries: 100 },
    } as any);

    const forwardFn = vi.fn(async () => makeMockResponse({ content: "From provider" }));

    const pipeline = new Pipeline(forwardFn);
    pipeline.use(cacheMiddleware);

    // First request: cache miss
    const ctx1 = makeMockContext();
    const result1 = await pipeline.run(ctx1);
    expect(result1.response?.content).toBe("From provider");
    expect(forwardFn).toHaveBeenCalledTimes(1);

    // Second request: same params -> cache hit
    const ctx2 = makeMockContext();
    const result2 = await pipeline.run(ctx2);
    expect(result2.response?.content).toBe("From provider");
    expect(forwardFn).toHaveBeenCalledTimes(1); // NOT called again
    expect(result2.cacheHit).toBe(true);
  });

  it("different agents produce different cache keys", async () => {
    cacheMiddleware = new CacheMiddleware({
      cache: { enabled: true, strategy: "exact", ttl_seconds: 3600, max_entries: 100 },
    } as any);

    const forwardFn = vi.fn(async () => makeMockResponse());

    const pipeline = new Pipeline(forwardFn);
    pipeline.use(cacheMiddleware);

    // Agent A
    const ctx1 = makeMockContext({ agentName: "agent-a" });
    await pipeline.run(ctx1);
    expect(forwardFn).toHaveBeenCalledTimes(1);

    // Agent B, same request content
    const ctx2 = makeMockContext({ agentName: "agent-b" });
    await pipeline.run(ctx2);
    expect(forwardFn).toHaveBeenCalledTimes(2); // Both hit provider
  });

  it("different temperature produces different cache key", async () => {
    cacheMiddleware = new CacheMiddleware({
      cache: { enabled: true, strategy: "exact", ttl_seconds: 3600, max_entries: 100 },
    } as any);

    const forwardFn = vi.fn(async () => makeMockResponse());

    const pipeline = new Pipeline(forwardFn);
    pipeline.use(cacheMiddleware);

    // Temperature 0.7
    const ctx1 = makeMockContext({
      request: {
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "Hello", rawContent: "Hello" }],
        temperature: 0.7,
        maxTokens: 1024,
        stream: false,
        rawBody: {},
      },
    });
    await pipeline.run(ctx1);
    expect(forwardFn).toHaveBeenCalledTimes(1);

    // Temperature 0.0
    const ctx2 = makeMockContext({
      request: {
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "Hello", rawContent: "Hello" }],
        temperature: 0.0,
        maxTokens: 1024,
        stream: false,
        rawBody: {},
      },
    });
    await pipeline.run(ctx2);
    expect(forwardFn).toHaveBeenCalledTimes(2); // Different key
  });

  it("cache TTL expiry causes second call to hit provider", async () => {
    cacheMiddleware = new CacheMiddleware({
      cache: { enabled: true, strategy: "exact", ttl_seconds: 1, max_entries: 100 },
    } as any);

    const forwardFn = vi.fn(async () => makeMockResponse());

    const pipeline = new Pipeline(forwardFn);
    pipeline.use(cacheMiddleware);

    // First request
    const now = Date.now();
    vi.spyOn(Date, "now").mockReturnValue(now);

    const ctx1 = makeMockContext();
    await pipeline.run(ctx1);
    expect(forwardFn).toHaveBeenCalledTimes(1);

    // Advance past TTL (1 second = 1000ms)
    vi.spyOn(Date, "now").mockReturnValue(now + 1500);

    // Second request: cache should be expired
    const ctx2 = makeMockContext();
    await pipeline.run(ctx2);
    expect(forwardFn).toHaveBeenCalledTimes(2);
  });

  it("cached responses from cache hits are independent clones", async () => {
    cacheMiddleware = new CacheMiddleware({
      cache: { enabled: true, strategy: "exact", ttl_seconds: 3600, max_entries: 100 },
    } as any);

    const forwardFn = vi.fn(async () => makeMockResponse({ content: "Original" }));

    const pipeline = new Pipeline(forwardFn);
    pipeline.use(cacheMiddleware);

    // First request populates the cache (provider called)
    const ctx1 = makeMockContext();
    await pipeline.run(ctx1);
    expect(forwardFn).toHaveBeenCalledTimes(1);

    // Second request: cache hit returns a clone
    const ctx2 = makeMockContext();
    const result2 = await pipeline.run(ctx2);
    expect(result2.cacheHit).toBe(true);

    // Mutate the result from the second request
    result2.response!.content = "Mutated";

    // Third request: cache hit should still return the original (not the mutated clone)
    const ctx3 = makeMockContext();
    const result3 = await pipeline.run(ctx3);
    expect(result3.response?.content).toBe("Original");
  });
});
