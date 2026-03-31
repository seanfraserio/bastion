import { createHash } from "node:crypto";
import type { Redis } from "../lib/redis.js";
import type {
  PipelineContext,
  PipelineMiddleware,
  PipelineMiddlewareResult,
} from "../pipeline/types.js";

export class RedisCacheMiddleware implements PipelineMiddleware {
  readonly name = "redis-cache";
  readonly phase = "both" as const;

  private redis: Redis;
  private ttlSeconds: number;

  constructor(redis: Redis, ttlSeconds: number) {
    this.redis = redis;
    this.ttlSeconds = ttlSeconds;
  }

  private computeKey(ctx: PipelineContext): string {
    // Match the exact key computation from CacheMiddleware
    const messages = ctx.request.messages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    const keyData = JSON.stringify({
      model: ctx.request.model,
      messages,
      systemPrompt: ctx.request.systemPrompt,
      temperature: ctx.request.temperature,
      maxTokens: ctx.request.maxTokens,
      agentName: ctx.agentName,
      teamName: ctx.teamName,
      environment: ctx.environment,
    });

    return "cache:" + createHash("sha256").update(keyData).digest("hex");
  }

  async process(ctx: PipelineContext): Promise<PipelineMiddlewareResult> {
    // Request phase: check Redis for cached response
    if (!ctx.response) {
      const key = this.computeKey(ctx);
      ctx.metadata.cacheKey = key;

      try {
        const cached = await this.redis.get(key);
        if (cached) {
          ctx.cacheHit = true;
          const response = JSON.parse(cached);
          return { action: "short-circuit", response };
        }
      } catch (err) {
        console.error(
          "[bastion] Redis cache GET error:",
          err instanceof Error ? err.message : err,
        );
      }

      return { action: "continue", ctx };
    }

    // Response phase: store in Redis if not already a cache hit
    if (ctx.response && !ctx.cacheHit) {
      const key = (ctx.metadata.cacheKey as string) ?? this.computeKey(ctx);

      try {
        await this.redis.setex(key, this.ttlSeconds, JSON.stringify(ctx.response));
      } catch (err) {
        console.error(
          "[bastion] Redis cache SETEX error:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    return { action: "continue", ctx };
  }
}
