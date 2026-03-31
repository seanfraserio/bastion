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

const WINDOW_MS = 60_000;

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS rate_limits (
    key TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    window_start BIGINT NOT NULL,
    PRIMARY KEY (key, window_start)
  )
`;

const UPSERT_SQL = `
  INSERT INTO rate_limits (key, count, window_start)
  VALUES ($1, 1, $2)
  ON CONFLICT (key, window_start)
  DO UPDATE SET count = rate_limits.count + 1
  RETURNING count
`;

const CLEANUP_SQL = `DELETE FROM rate_limits WHERE window_start < $1`;

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
      const cutoff = Date.now() - 5 * 60_000;
      this.pool.query(CLEANUP_SQL, [cutoff]).catch((err: unknown) => {
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

      const windowStart = Math.floor(Date.now() / WINDOW_MS) * WINDOW_MS;
      const result = await this.pool.query(UPSERT_SQL, [identity, windowStart]);
      const count = result.rows[0].count as number;

      if (count > limit) {
        const retryAfterMs = windowStart + WINDOW_MS - Date.now();
        ctx.metadata.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
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
