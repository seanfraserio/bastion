import { createHash } from "node:crypto";
import type { BastionConfig } from "@openbastion-ai/config";
import type {
  PipelineContext,
  PipelineMiddleware,
  PipelineMiddlewareResult,
  NormalizedResponse,
} from "../pipeline/types.js";

interface CacheEntry {
  response: NormalizedResponse;
  expiresAt: number;
  hits: number;
  lastAccessedAt: number;
}

export class CacheMiddleware implements PipelineMiddleware {
  readonly name = "cache";
  readonly phase = "both" as const;

  private cache = new Map<string, CacheEntry>();
  private ttlMs: number;
  private maxEntries: number;

  constructor(config: BastionConfig) {
    this.ttlMs = (config.cache?.ttl_seconds ?? 300) * 1000;
    this.maxEntries = config.cache?.max_entries ?? 10_000;
  }

  private computeKey(ctx: PipelineContext): string {
    // C6: Preserve message order (no sorting) — order is semantically meaningful
    const messages = ctx.request.messages
      .map((m) => ({ role: m.role, content: m.content }));

    // C6: Scope cache by agent/team/environment
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

    return createHash("sha256").update(keyData).digest("hex");
  }

  private evictExpired(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache) {
      if (entry.expiresAt <= now) {
        this.cache.delete(key);
      }
    }
  }

  async process(ctx: PipelineContext): Promise<PipelineMiddlewareResult> {
    // Skip caching entirely for streaming requests
    if (ctx.request.stream) {
      return { action: "continue", ctx };
    }

    // Request phase: check cache for hit
    if (!ctx.response) {
      const key = this.computeKey(ctx);
      const entry = this.cache.get(key);

      if (entry && entry.expiresAt > Date.now()) {
        entry.hits += 1;
        entry.lastAccessedAt = Date.now();
        ctx.cacheHit = true;
        ctx.metadata.cacheKey = key;
        return { action: "short-circuit", response: { ...entry.response } };
      }

      // Store key in metadata for the response phase
      ctx.metadata.cacheKey = key;
      return { action: "continue", ctx };
    }

    // Response phase: store in cache
    if (ctx.response && !ctx.cacheHit) {
      const key = (ctx.metadata.cacheKey as string) ?? this.computeKey(ctx);

      // Evict expired entries if we are at capacity
      if (this.cache.size >= this.maxEntries) {
        this.evictExpired();
      }

      // If still at capacity after eviction, remove the least recently accessed entry
      if (this.cache.size >= this.maxEntries) {
        let lruKey: string | undefined;
        let lruTime = Infinity;
        for (const [k, v] of this.cache) {
          if (v.lastAccessedAt < lruTime) {
            lruTime = v.lastAccessedAt;
            lruKey = k;
          }
        }
        if (lruKey !== undefined) {
          this.cache.delete(lruKey);
        }
      }

      const now = Date.now();
      this.cache.set(key, {
        response: { ...ctx.response },
        expiresAt: now + this.ttlMs,
        hits: 0,
        lastAccessedAt: now,
      });
    }

    return { action: "continue", ctx };
  }

  /** Exposed for stats/testing */
  get size(): number {
    return this.cache.size;
  }

  get stats(): { size: number; totalHits: number } {
    let totalHits = 0;
    for (const entry of this.cache.values()) {
      totalHits += entry.hits;
    }
    return { size: this.cache.size, totalHits };
  }

  clear(): void {
    this.cache.clear();
  }
}
