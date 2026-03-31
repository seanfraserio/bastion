import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Pool, QueryResult } from "pg";
import { PostgresRateLimitMiddleware } from "./postgres-rate-limit.js";
import { makeMockContext } from "../__tests__/helpers/mock-context.js";

function makeMockPool(queryResult?: Partial<QueryResult>): Pool {
  return {
    query: vi.fn().mockResolvedValue({
      rows: [{ count: 1 }],
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

  it("creates schema idempotently on first process() call (no DROP TABLE)", async () => {
    const ctx = makeMockContext();
    await middleware.process(ctx);

    const allCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const dropCall = allCalls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" && call[0].includes("DROP TABLE"),
    );
    const createTableCall = allCalls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" && call[0].includes("CREATE TABLE IF NOT EXISTS"),
    );
    expect(dropCall).toBeUndefined();
    expect(createTableCall).toBeDefined();
  });

  it("uses BIGINT window_start with composite PK in schema", async () => {
    const ctx = makeMockContext();
    await middleware.process(ctx);

    const allCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const createCall = allCalls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" && call[0].includes("CREATE TABLE"),
    );
    expect(createCall).toBeDefined();
    const sql = createCall![0] as string;
    expect(sql).toContain("window_start BIGINT");
    expect(sql).toContain("PRIMARY KEY (key, window_start)");
    expect(sql).not.toContain("TIMESTAMPTZ");
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

  it("passes identity and floored windowStart to upsert", async () => {
    middleware["schemaReady"] = true;

    const now = 1711900000000; // known timestamp
    vi.setSystemTime(now);

    const ctx = makeMockContext({ agentName: undefined, sourceIp: "10.0.0.1" });
    await middleware.process(ctx);

    const allCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const upsertCall = allCalls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" && call[0].includes("ON CONFLICT"),
    );
    expect(upsertCall).toBeDefined();
    expect(upsertCall![1][0]).toBe("10.0.0.1");
    // windowStart should be floored to nearest 60_000ms
    const expectedWindow = Math.floor(now / 60_000) * 60_000;
    expect(upsertCall![1][1]).toBe(expectedWindow);
  });

  it("blocks when over limit (count=61, limit=60) → 429 with retryAfterSeconds", async () => {
    pool = makeMockPool({ rows: [{ count: 61 }] });
    middleware.pool = pool;
    middleware["schemaReady"] = true;

    const ctx = makeMockContext();
    const result = await middleware.process(ctx);

    expect(result.action).toBe("block");
    if (result.action === "block") {
      expect(result.statusCode).toBe(429);
      expect(result.reason).toContain("Rate limit exceeded");
    }
    expect(ctx.metadata.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("allows at exactly the limit boundary (count=60, limit=60)", async () => {
    pool = makeMockPool({ rows: [{ count: 60 }] });
    middleware.pool = pool;
    middleware["schemaReady"] = true;

    const ctx = makeMockContext();
    const result = await middleware.process(ctx);

    expect(result.action).toBe("continue");
  });

  it("blocks one past the limit (count=61)", async () => {
    pool = makeMockPool({ rows: [{ count: 61 }] });
    middleware.pool = pool;
    middleware["schemaReady"] = true;

    const ctx = makeMockContext();
    const result = await middleware.process(ctx);

    expect(result.action).toBe("block");
    if (result.action === "block") {
      expect(result.statusCode).toBe(429);
    }
    expect(ctx.metadata.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("uses agent-specific limits when configured (agentOverrides)", async () => {
    pool = makeMockPool({ rows: [{ count: 1 }] });
    const mw = new PostgresRateLimitMiddleware(pool, {
      requestsPerMinute: 60,
      agentOverrides: { "slow-agent": 10 },
    });

    const ctx = makeMockContext({ agentName: "slow-agent" });
    const result = await mw.process(ctx);

    expect(result.action).toBe("continue");

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

  it("runs cleanup DELETE with epoch cutoff on timer interval", async () => {
    await vi.advanceTimersByTimeAsync(60_000);

    const allCalls = (pool.query as ReturnType<typeof vi.fn>).mock.calls;
    const cleanupCall = allCalls.find(
      (call: unknown[]) =>
        typeof call[0] === "string" && call[0].includes("DELETE"),
    );
    expect(cleanupCall).toBeDefined();
    // Cleanup passes epoch cutoff as parameter, not SQL INTERVAL
    expect(cleanupCall![1]).toBeDefined();
    expect(typeof cleanupCall![1][0]).toBe("number");
  });

  it("destroy() clears the cleanup timer", async () => {
    middleware.destroy();

    const callCountBefore = (pool.query as ReturnType<typeof vi.fn>).mock.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    const callCountAfter = (pool.query as ReturnType<typeof vi.fn>).mock.calls.length;

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
