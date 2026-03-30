import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Pool, QueryResult } from "pg";
import { PostgresRateLimitMiddleware } from "./postgres-rate-limit.js";
import { makeMockContext } from "../__tests__/helpers/mock-context.js";

function makeMockPool(queryResult?: Partial<QueryResult>): Pool {
  return {
    query: vi.fn().mockResolvedValue({
      rows: [{ count: 1, ttl: 60 }],
      ...queryResult,
    }),
  } as unknown as Pool;
}

describe("PostgresRateLimitMiddleware", () => {
  let pool: Pool;
  let middleware: PostgresRateLimitMiddleware;

  beforeEach(() => {
    vi.useFakeTimers();
    pool = makeMockPool();
    middleware = new PostgresRateLimitMiddleware(pool, {
      requestsPerMinute: 60,
    });
  });

  afterEach(() => {
    middleware.destroy();
    vi.useRealTimers();
  });

  it('has name "postgres-rate-limit" and phase "request"', () => {
    expect(middleware.name).toBe("postgres-rate-limit");
    expect(middleware.phase).toBe("request");
  });

  it("creates rate_limits table on first process() call (CREATE TABLE IF NOT EXISTS)", async () => {
    const ctx = makeMockContext();
    await middleware.process(ctx);

    const allCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const createTableCall = allCalls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" && call[0].includes("CREATE TABLE IF NOT EXISTS"),
    );
    expect(createTableCall).toBeDefined();
  });

  it("skips schema creation on subsequent calls", async () => {
    const ctx = makeMockContext();
    await middleware.process(ctx);
    await middleware.process(ctx);

    const allCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const createTableCalls = allCalls.filter(
      (call: unknown[]) =>
        typeof call[0] === "string" && call[0].includes("CREATE TABLE IF NOT EXISTS"),
    );
    expect(createTableCalls).toHaveLength(1);
  });

  it("continues when under limit (count=1, limit=60)", async () => {
    const ctx = makeMockContext();
    const result = await middleware.process(ctx);

    expect(result.action).toBe("continue");
  });

  it("blocks when over limit (count=61, limit=60) → 429 with Retry-After", async () => {
    pool = makeMockPool({ rows: [{ count: 61, ttl: 45 }] });
    middleware.pool = pool;
    middleware["schemaReady"] = true;

    const ctx = makeMockContext();
    const result = await middleware.process(ctx);

    expect(result.action).toBe("block");
    if (result.action === "block") {
      expect(result.statusCode).toBe(429);
      expect(result.reason).toContain("Rate limit exceeded");
    }
    expect(ctx.metadata.retryAfterSeconds).toBe(45);
  });

  it("allows at exactly the limit boundary (count=60, limit=60)", async () => {
    pool = makeMockPool({ rows: [{ count: 60, ttl: 30 }] });
    middleware.pool = pool;
    middleware["schemaReady"] = true;

    const ctx = makeMockContext();
    const result = await middleware.process(ctx);

    expect(result.action).toBe("continue");
  });

  it("blocks one past the limit (count=61)", async () => {
    pool = makeMockPool({ rows: [{ count: 61, ttl: 30 }] });
    middleware.pool = pool;
    middleware["schemaReady"] = true;

    const ctx = makeMockContext();
    const result = await middleware.process(ctx);

    expect(result.action).toBe("block");
    if (result.action === "block") {
      expect(result.statusCode).toBe(429);
    }
    expect(ctx.metadata.retryAfterSeconds).toBe(30);
  });

  it("uses agent-specific limits when configured (agentOverrides)", async () => {
    pool = makeMockPool({ rows: [{ count: 1, ttl: 60 }] });
    const mw = new PostgresRateLimitMiddleware(pool, {
      requestsPerMinute: 60,
      agentOverrides: { "slow-agent": 10 },
    });

    const ctx = makeMockContext({ agentName: "slow-agent" });
    const result = await mw.process(ctx);

    expect(result.action).toBe("continue");

    // The upsert call should have $1 = "slow-agent"
    const allCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const upsertCall = allCalls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" && call[0].includes("ON CONFLICT"),
    );
    expect(upsertCall).toBeDefined();
    expect(upsertCall![1][0]).toBe("slow-agent");

    mw.destroy();
  });

  it("uses sourceIp when no agentName is set", async () => {
    middleware["schemaReady"] = true;

    const ctx = makeMockContext({ agentName: undefined, sourceIp: "192.168.1.1" });
    const result = await middleware.process(ctx);

    expect(result.action).toBe("continue");

    const allCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const upsertCall = allCalls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" && call[0].includes("ON CONFLICT"),
    );
    expect(upsertCall).toBeDefined();
    expect(upsertCall![1][0]).toBe("192.168.1.1");
  });

  it('uses "global" key when neither agentName nor sourceIp is set', async () => {
    middleware["schemaReady"] = true;

    const ctx = makeMockContext({ agentName: undefined, sourceIp: undefined });
    const result = await middleware.process(ctx);

    expect(result.action).toBe("continue");

    const allCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const upsertCall = allCalls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" && call[0].includes("ON CONFLICT"),
    );
    expect(upsertCall).toBeDefined();
    expect(upsertCall![1][0]).toBe("global");
  });

  it("fails open on query error (continues, logs error)", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    pool = {
      query: vi.fn().mockRejectedValue(new Error("Connection refused")),
    } as unknown as Pool;
    middleware.pool = pool;
    middleware["schemaReady"] = true;

    const ctx = makeMockContext();
    const result = await middleware.process(ctx);

    expect(result.action).toBe("continue");
    expect(consoleSpy).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it("runs cleanup DELETE on timer interval", async () => {
    // The cleanup timer fires every 60 seconds
    await vi.advanceTimersByTimeAsync(60_000);

    const allCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const cleanupCall = allCalls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" && call[0].includes("DELETE"),
    );
    expect(cleanupCall).toBeDefined();
  });

  it("destroy() clears the cleanup timer", async () => {
    middleware.destroy();

    const callCountBefore = (pool.query as ReturnType<typeof vi.fn>).mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    const callCountAfter = (pool.query as ReturnType<typeof vi.fn>).mock.calls.length;

    // No cleanup calls should have been made after destroy
    const cleanupCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls
      .slice(callCountBefore)
      .filter(
        (call: unknown[]) =>
          typeof call[0] === "string" && call[0].includes("DELETE"),
      );
    expect(cleanupCalls).toHaveLength(0);
    expect(callCountAfter).toBe(callCountBefore);
  });
});
