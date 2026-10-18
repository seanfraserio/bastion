import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Pool, QueryResult } from "pg";
import { instrumentPool } from "./timed-pool.js";
import { recordMetric } from "../observability.js";

vi.mock("../observability.js", () => ({
  recordMetric: vi.fn(),
}));

function result(rows: unknown[] = [{ ok: true }]): QueryResult {
  return {
    command: "SELECT",
    rowCount: rows.length,
    oid: 0,
    rows,
    fields: [],
  } as QueryResult;
}

function makePool(impl?: (...args: unknown[]) => unknown): { pool: Pool; query: ReturnType<typeof vi.fn> } {
  const query = vi.fn(impl ?? (async () => result()));
  return { pool: { query } as unknown as Pool, query };
}

describe("instrumentPool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("forwards string queries and records duration with a bounded label", async () => {
    const { pool, query } = makePool();
    const instrumented = instrumentPool(pool);

    const rows = await instrumented.query("SELECT id FROM rate_limits WHERE key = $1", ["agent"]);

    expect(rows.rows).toEqual([{ ok: true }]);
    expect(query).toHaveBeenCalledWith("SELECT id FROM rate_limits WHERE key = $1", ["agent"]);
    expect(recordMetric).toHaveBeenCalledWith(
      "db.query_ms",
      expect.any(Number),
      { operation: "SELECT rate_limits" },
    );
  });

  it("forwards query config objects and uses config text for the label", async () => {
    const { pool, query } = makePool();
    const instrumented = instrumentPool(pool);
    const config = { text: "INSERT INTO rate_limits (key) VALUES ($1)", values: ["a"] };

    await instrumented.query(config);

    expect(query).toHaveBeenCalledWith(config);
    expect(recordMetric).toHaveBeenCalledWith(
      "db.query_ms",
      expect.any(Number),
      { operation: "INSERT rate_limits" },
    );
  });

  it("preserves callback-style queries and still records the metric", async () => {
    const expected = result([{ count: 2 }]);
    const { pool } = makePool((_sql: unknown, cb: (err: Error | null, result: QueryResult) => void) => {
      cb(null, expected);
    });
    const instrumented = instrumentPool(pool);

    const returned = await new Promise<QueryResult>((resolve, reject) => {
      instrumented.query("UPDATE rate_limits SET count = count + 1", (err, res) => {
        if (err) reject(err);
        else resolve(res);
      });
    });

    expect(returned).toBe(expected);
    expect(recordMetric).toHaveBeenCalledWith(
      "db.query_ms",
      expect.any(Number),
      { operation: "UPDATE rate_limits" },
    );
  });

  it("does not record a callback query until the deferred callback succeeds", async () => {
    const expected = result([{ count: 3 }]);
    let captured: ((err: Error | null, res?: QueryResult) => void) | undefined;
    const calls: unknown[][] = [];
    const { pool } = makePool(function (this: { tag: string }, sql: unknown, values: unknown, cb: (err: Error | null, res?: QueryResult) => void) {
      calls.push([this, sql, values, cb]);
      captured = cb;
      return undefined;
    });
    const instrumented = instrumentPool(pool);
    const seen: Array<{ err: Error | null; res?: QueryResult }> = [];

    const returned = instrumented.query(
      "DELETE FROM rate_limits WHERE key = $1",
      ["agent"],
      function (this: { listener: string }, err, res) {
        seen.push({ err, res });
        expect(this).toEqual({ listener: "caller" });
      }.bind({ listener: "caller" }),
    );

    expect(returned).toBeUndefined();
    expect(recordMetric).not.toHaveBeenCalled();
    expect(calls[0]?.[0]).toBe(pool);
    expect(calls[0]?.[1]).toBe("DELETE FROM rate_limits WHERE key = $1");
    expect(calls[0]?.[2]).toEqual(["agent"]);

    captured?.(null, expected);

    expect(seen).toEqual([{ err: null, res: expected }]);
    expect(recordMetric).toHaveBeenCalledTimes(1);
    expect(recordMetric).toHaveBeenCalledWith(
      "db.query_ms",
      expect.any(Number),
      { operation: "DELETE rate_limits" },
    );
  });

  it("records a deferred callback error once and forwards the original arguments", () => {
    let captured: ((err: Error, res?: QueryResult) => void) | undefined;
    const { pool } = makePool((_sql: unknown, cb: (err: Error, res?: QueryResult) => void) => {
      captured = cb;
    });
    const instrumented = instrumentPool(pool);
    const failure = new Error("timeout");
    const seen: unknown[][] = [];

    instrumented.query("SELECT id FROM rate_limits", (err, res) => {
      seen.push([err, res]);
    });

    expect(recordMetric).not.toHaveBeenCalled();
    captured?.(failure);
    captured?.(failure);

    expect(seen).toEqual([[failure, undefined], [failure, undefined]]);
    expect(recordMetric).toHaveBeenCalledTimes(1);
    expect(recordMetric).toHaveBeenCalledWith(
      "db.query_ms",
      expect.any(Number),
      { operation: "SELECT rate_limits" },
    );
  });

  it("does not treat a returned Submittable as finished until its end or error event", () => {
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    const submittable = {
      submit() {},
      on(event: string, listener: (...args: unknown[]) => void) {
        const current = listeners.get(event) ?? [];
        current.push(listener);
        listeners.set(event, current);
        return this;
      },
    };
    const { pool } = makePool(() => submittable);
    const instrumented = instrumentPool(pool);

    const returned = instrumented.query(submittable);

    expect(returned).toBe(submittable);
    expect(recordMetric).not.toHaveBeenCalled();

    listeners.get("end")?.[0]?.();
    listeners.get("error")?.[0]?.(new Error("late"));

    expect(recordMetric).toHaveBeenCalledTimes(1);
  });

  it("records the metric and rethrows when the query rejects", async () => {
    const { pool } = makePool(async () => {
      throw new Error("connection refused");
    });
    const instrumented = instrumentPool(pool);

    await expect(instrumented.query("DELETE FROM rate_limits")).rejects.toThrow("connection refused");
    expect(recordMetric).toHaveBeenCalledWith(
      "db.query_ms",
      expect.any(Number),
      { operation: "DELETE rate_limits" },
    );
  });

  it("warns when a query exceeds the slow threshold", async () => {
    vi.spyOn(performance, "now")
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(750);
    const { pool } = makePool();
    const instrumented = instrumentPool(pool);

    await instrumented.query("SELECT 1");

    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("Slow query (750ms)"));
  });
});
