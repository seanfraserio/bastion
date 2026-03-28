import type { Redis } from "../lib/redis.js";
import type {
  PipelineContext,
  PipelineMiddleware,
  PipelineMiddlewareResult,
} from "../pipeline/types.js";

export interface RedisRateLimitOptions {
  requestsPerMinute: number;
  agentOverrides?: Record<string, number>;
}

/**
 * Lua script for atomic sliding-window counter rate limiting.
 *
 * KEYS[1] = rate limit key
 * ARGV[1] = max requests allowed in the window
 * ARGV[2] = window size in seconds
 *
 * Returns [currentCount, ttlSeconds].
 */
const RATE_LIMIT_LUA = `
local key = KEYS[1]
local limit = tonumber(ARGV[1])
local window = tonumber(ARGV[2])
local current = redis.call('INCR', key)
if current == 1 then
  redis.call('EXPIRE', key, window)
end
local ttl = redis.call('TTL', key)
return {current, ttl}
`;

export class RedisRateLimitMiddleware implements PipelineMiddleware {
  readonly name = "redis-rate-limit";
  readonly phase = "request" as const;

  private redis: Redis;
  private requestsPerMinute: number;
  private agentOverrides: Record<string, number>;

  constructor(redis: Redis, options: RedisRateLimitOptions) {
    this.redis = redis;
    this.requestsPerMinute = options.requestsPerMinute;
    this.agentOverrides = options.agentOverrides ?? {};
  }

  async process(ctx: PipelineContext): Promise<PipelineMiddlewareResult> {
    const identity = ctx.agentName || ctx.sourceIp || "global";
    const key = `ratelimit:${identity}`;

    // Resolve limit: agent-specific override or global default
    const limit =
      ctx.agentName && this.agentOverrides[ctx.agentName] != null
        ? this.agentOverrides[ctx.agentName]
        : this.requestsPerMinute;

    const windowSeconds = 60;

    try {
      const result = (await this.redis.eval(
        RATE_LIMIT_LUA,
        1, // number of keys
        key,
        limit,
        windowSeconds,
      )) as [number, number];

      const [current, ttl] = result;

      if (current > limit) {
        ctx.metadata.retryAfterSeconds = ttl;
        return {
          action: "block",
          reason: "Rate limit exceeded. Try again later.",
          statusCode: 429,
        };
      }

      return { action: "continue", ctx };
    } catch (err) {
      // Fail-open: if Redis is unavailable, allow the request through
      console.error(
        "[bastion] Redis rate-limit error:",
        err instanceof Error ? err.message : err,
      );
      return { action: "continue", ctx };
    }
  }
}
