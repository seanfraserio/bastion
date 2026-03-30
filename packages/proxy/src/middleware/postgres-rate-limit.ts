import type { Pool } from "pg";
import type {
  PipelineContext,
  PipelineMiddleware,
  PipelineMiddlewareResult,
} from "../pipeline/types.js";

export interface PostgresRateLimitOptions {
  requestsPerMinute: number;
  agentOverrides?: Record<string, number>;
}

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS rate_limits (
    identity TEXT PRIMARY KEY,
    window_start TIMESTAMPTZ NOT NULL,
    count INT NOT NULL DEFAULT 1
  )
`;

const CREATE_INDEX_SQL = `
  CREATE INDEX IF NOT EXISTS rate_limits_window_start_idx
  ON rate_limits (window_start)
`;

const UPSERT_SQL = `
  INSERT INTO rate_limits (identity, window_start, count)
  VALUES ($1, NOW(), 1)
  ON CONFLICT (identity) DO UPDATE SET
    count = CASE
      WHEN rate_limits.window_start > NOW() - INTERVAL '60 seconds'
      THEN rate_limits.count + 1
      ELSE 1
    END,
    window_start = CASE
      WHEN rate_limits.window_start > NOW() - INTERVAL '60 seconds'
      THEN rate_limits.window_start
      ELSE NOW()
    END
  RETURNING count,
    GREATEST(0, EXTRACT(EPOCH FROM (rate_limits.window_start + INTERVAL '60 seconds' - NOW()))::INT) AS ttl
`;

const CLEANUP_SQL = `
  DELETE FROM rate_limits
  WHERE window_start < NOW() - INTERVAL '2 minutes'
`;

export class PostgresRateLimitMiddleware implements PipelineMiddleware {
  readonly name = "postgres-rate-limit";
  readonly phase = "request" as const;

  public pool: Pool;
  private requestsPerMinute: number;
  private agentOverrides: Record<string, number>;
  private schemaReady = false;
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(pool: Pool, options: PostgresRateLimitOptions) {
    this.pool = pool;
    this.requestsPerMinute = options.requestsPerMinute;
    this.agentOverrides = options.agentOverrides ?? {};

    this.cleanupTimer = setInterval(() => {
      this.pool.query(CLEANUP_SQL).catch((err: unknown) => {
        console.error(
          "[bastion] Postgres rate-limit cleanup error:",
          err instanceof Error ? err.message : err,
        );
      });
    }, 60_000);
  }

  private async ensureSchema(): Promise<void> {
    if (this.schemaReady) return;
    await this.pool.query(CREATE_TABLE_SQL);
    await this.pool.query(CREATE_INDEX_SQL);
    this.schemaReady = true;
  }

  async process(ctx: PipelineContext): Promise<PipelineMiddlewareResult> {
    const identity = ctx.agentName || ctx.sourceIp || "global";

    const limit =
      ctx.agentName && this.agentOverrides[ctx.agentName] != null
        ? this.agentOverrides[ctx.agentName]
        : this.requestsPerMinute;

    try {
      await this.ensureSchema();

      const result = await this.pool.query(UPSERT_SQL, [identity]);
      const row = result.rows[0] as { count: number; ttl: number };
      const { count, ttl } = row;

      if (count > limit) {
        ctx.metadata.retryAfterSeconds = ttl;
        return {
          action: "block",
          reason: "Rate limit exceeded. Try again later.",
          statusCode: 429,
        };
      }

      return { action: "continue", ctx };
    } catch (err) {
      // Fail-open: if Postgres is unavailable, allow the request through
      console.error(
        "[bastion] Postgres rate-limit error:",
        err instanceof Error ? err.message : err,
      );
      return { action: "continue", ctx };
    }
  }

  destroy(): void {
    clearInterval(this.cleanupTimer);
  }
}
