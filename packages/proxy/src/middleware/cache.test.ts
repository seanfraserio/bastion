import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CacheMiddleware } from "./cache.js";
import type { PipelineContext, NormalizedResponse } from "../pipeline/types.js";
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
      temperature: 0.7,
      maxTokens: 1024,
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

function makeMockResponse(): NormalizedResponse {
  return {
    content: "Hello there!",
    stopReason: "end_turn",
    inputTokens: 10,
    outputTokens: 5,
    rawBody: { id: "resp-1" },
  };
}

function makeMockConfig(
  cacheOverrides: Partial<NonNullable<BastionConfig["cache"]>> = {},
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
    cache: {
      enabled: true,
      strategy: "exact",
      ttl_seconds: 3600,
      max_entries: 10000,
      ...cacheOverrides,
    },
  } as BastionConfig;
}

describe("CacheMiddleware", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns short-circuit on cache hit", async () => {
    const config = makeMockConfig();
    const cache = new CacheMiddleware(config);

    // First call (request phase - miss)
    const ctx1 = makeMockContext();
    const result1 = await cache.process(ctx1);
    expect(result1.action).toBe("continue");

    // Simulate response phase: store in cache
    ctx1.response = makeMockResponse();
    const storeResult = await cache.process(ctx1);
    expect(storeResult.action).toBe("continue");

    // Second call with same request (request phase - hit)
    const ctx2 = makeMockContext();
    const result2 = await cache.process(ctx2);
    expect(result2.action).toBe("short-circuit");
    if (result2.action === "short-circuit") {
      expect(result2.response.content).toBe("Hello there!");
    }
  });

  it("passes through on cache miss", async () => {
    const config = makeMockConfig();
    const cache = new CacheMiddleware(config);

    const ctx = makeMockContext();
    const result = await cache.process(ctx);
    expect(result.action).toBe("continue");
  });

  it("different temperature produces different cache key", async () => {
    const config = makeMockConfig();
    const cache = new CacheMiddleware(config);

    // Store response with temperature 0.7
    const ctx1 = makeMockContext();
    ctx1.request.temperature = 0.7;
    await cache.process(ctx1);
    ctx1.response = makeMockResponse();
    await cache.process(ctx1);

    // Request with temperature 0.9 should miss
    const ctx2 = makeMockContext();
    ctx2.request.temperature = 0.9;
    const result = await cache.process(ctx2);
    expect(result.action).toBe("continue");
    expect(ctx2.cacheHit).toBe(false);
  });

  it("expires entries after TTL", async () => {
    const config = makeMockConfig({ ttl_seconds: 60 }); // 60 seconds TTL
    const cache = new CacheMiddleware(config);

    // Store a response
    const ctx1 = makeMockContext();
    await cache.process(ctx1);
    ctx1.response = makeMockResponse();
    await cache.process(ctx1);

    // Advance time past TTL
    vi.advanceTimersByTime(61_000);

    // Should miss (expired)
    const ctx2 = makeMockContext();
    const result = await cache.process(ctx2);
    expect(result.action).toBe("continue");
    expect(ctx2.cacheHit).toBe(false);
  });
});
