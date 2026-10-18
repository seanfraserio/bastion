import type {
  Pool,
  QueryArrayConfig,
  QueryArrayResult,
  QueryConfig,
  QueryConfigValues,
  QueryResult,
  QueryResultRow,
  Submittable,
} from "pg";
import { recordMetric } from "../observability.js";

const SLOW_QUERY_THRESHOLD_MS = 500;

/**
 * Extract a short label from a SQL query for metric cardinality control.
 * Returns the first SQL keyword + table name, e.g. "SELECT rate_limits", "INSERT rate_limits".
 */
function extractQueryLabel(sql: string): string {
  const trimmed = sql.trim().replace(/\s+/g, " ");

  // SELECT ... FROM table
  const selectMatch = trimmed.match(/^SELECT\s+.+?\s+FROM\s+(?:public\.)?(?:"[^"]*"\.)?"?(\w+)"?/i);
  if (selectMatch) {
    return `SELECT ${selectMatch[1].toLowerCase()}`;
  }

  // INSERT INTO table
  const insertMatch = trimmed.match(/^INSERT\s+(?:OR\s+\w+\s+)?INTO\s+(?:public\.)?(?:"[^"]*"\.)?"?(\w+)"?/i);
  if (insertMatch) {
    return `INSERT ${insertMatch[1].toLowerCase()}`;
  }

  // UPDATE table
  const updateMatch = trimmed.match(/^UPDATE\s+(?:public\.)?(?:"[^"]*"\.)?"?(\w+)"?/i);
  if (updateMatch) {
    return `UPDATE ${updateMatch[1].toLowerCase()}`;
  }

  // DELETE FROM table
  const deleteMatch = trimmed.match(/^DELETE\s+FROM\s+(?:public\.)?(?:"[^"]*"\.)?"?(\w+)"?/i);
  if (deleteMatch) {
    return `DELETE ${deleteMatch[1].toLowerCase()}`;
  }

  // CREATE TABLE [IF NOT EXISTS] table
  const createMatch = trimmed.match(/^CREATE\s+(?:TABLE|INDEX|SCHEMA)\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(?:public\.)?(?:"[^"]*"\.)?"?(\w+)"?/i);
  if (createMatch) {
    return `CREATE ${createMatch[1].toLowerCase()}`;
  }

  // DROP TABLE/SCHEMA
  const dropMatch = trimmed.match(/^DROP\s+(?:TABLE|INDEX|SCHEMA)\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(?:"[^"]*"\.)?"?(\w+)"?/i);
  if (dropMatch) {
    return `DROP ${dropMatch[1].toLowerCase()}`;
  }

  // Fallback: just the verb
  const verb = trimmed.split(/\s/)[0].toUpperCase();
  return verb.length <= 10 ? verb : "QUERY";
}

/**
 * Wrap a pg.Pool to instrument all queries with timing metrics.
 *
 * Every `pool.query()` call records:
 * - `db.query_ms` gauge with labels { operation }
 * - Console warning for queries exceeding 500ms
 *
 * Timing starts when query() is invoked and is recorded once when the query
 * settles:
 * - Promise overloads: when the returned promise fulfills or rejects.
 * - Callback overloads: when pg invokes the callback, including a deferred
 *   callback. Returning from query() is not completion.
 * - Submittable (pg.Query / query streams): when the returned object emits
 *   "end" or "error". A returned Submittable is not finished yet.
 *
 * The wrapper is transparent — it returns the same Pool interface
 * so all existing code works unchanged.
 */
type QueryCallback = (err: Error, result: unknown) => void;

interface EventSubmittable extends Submittable {
  on(event: "end" | "error", listener: (...args: unknown[]) => void): unknown;
}

function isPromise(value: unknown): value is Promise<unknown> {
  return typeof value === "object" && value !== null && typeof (value as Promise<unknown>).then === "function";
}

function isQueryConfig(value: unknown): value is QueryConfig | QueryArrayConfig {
  return typeof value === "object" && value !== null && "text" in value && typeof (value as { text?: unknown }).text === "string";
}

function isSubmittable(value: unknown): value is Submittable {
  return typeof value === "object" && value !== null && typeof (value as { submit?: unknown }).submit === "function";
}

function isEventSubmittable(value: unknown): value is EventSubmittable {
  return isSubmittable(value) && typeof (value as { on?: unknown }).on === "function";
}

function queryText(value: unknown): string {
  if (typeof value === "string") return value;
  if (isQueryConfig(value)) return value.text;
  return "";
}

function callbackIndex(args: readonly unknown[]): number {
  for (let i = args.length - 1; i >= 0; i -= 1) {
    if (typeof args[i] === "function") return i;
  }
  return -1;
}

export function instrumentPool(pool: Pool): Pool {
  const originalQuery = pool.query.bind(pool) as (
    ...args: readonly unknown[]
  ) => Promise<unknown> | Submittable | void;

  function timedQuery(queryStream: Submittable): Submittable;
  function timedQuery<R extends unknown[] = unknown[], I = unknown[]>(
    queryConfig: QueryArrayConfig<I>,
    values?: QueryConfigValues<I>,
  ): Promise<QueryArrayResult<R>>;
  function timedQuery<R extends QueryResultRow = QueryResultRow, I = unknown[]>(
    queryConfig: QueryConfig<I>,
  ): Promise<QueryResult<R>>;
  function timedQuery<R extends QueryResultRow = QueryResultRow, I = unknown[]>(
    queryTextOrConfig: string | QueryConfig<I>,
    values?: QueryConfigValues<I>,
  ): Promise<QueryResult<R>>;
  function timedQuery<R extends unknown[] = unknown[], I = unknown[]>(
    queryConfig: QueryArrayConfig<I>,
    callback: (err: Error, result: QueryArrayResult<R>) => void,
  ): void;
  function timedQuery<R extends QueryResultRow = QueryResultRow, I = unknown[]>(
    queryTextOrConfig: string | QueryConfig<I>,
    callback: (err: Error, result: QueryResult<R>) => void,
  ): void;
  function timedQuery<R extends QueryResultRow = QueryResultRow, I = unknown[]>(
    queryText: string,
    values: QueryConfigValues<I>,
    callback: (err: Error, result: QueryResult<R>) => void,
  ): void;
  function timedQuery(...args: readonly unknown[]): Promise<unknown> | Submittable | void {
    const start = performance.now();
    let settled = false;
    const record = () => {
      if (settled) return;
      settled = true;
      const durationMs = Math.round(performance.now() - start);
      const sql = queryText(args[0]);
      const operation = extractQueryLabel(sql);

      recordMetric("db.query_ms", durationMs, { operation });

      if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
        console.warn(
          `[db] Slow query (${durationMs}ms): ${operation} — ${sql.slice(0, 120).replace(/\s+/g, " ")}`,
        );
      }
    };

    const forwarded = args.slice();
    const cbIndex = isSubmittable(args[0]) ? -1 : callbackIndex(args);
    if (cbIndex >= 0) {
      const originalCallback = args[cbIndex] as QueryCallback;
      const wrappedCallback: QueryCallback = function (this: unknown, err, result) {
        record();
        return originalCallback.call(this, err, result);
      };
      forwarded[cbIndex] = wrappedCallback;
    }

    try {
      const result = originalQuery(...forwarded);
      if (isPromise(result)) {
        return result.then(
          (value) => {
            record();
            return value;
          },
          (err: unknown) => {
            record();
            throw err;
          },
        );
      }
      if (isEventSubmittable(result)) {
        result.on("end", () => record());
        result.on("error", () => record());
        return result;
      }
      if (cbIndex >= 0) {
        return result;
      }
      record();
      return result;
    } catch (err) {
      record();
      throw err;
    }
  }

  pool.query = timedQuery;
  return pool;
}
