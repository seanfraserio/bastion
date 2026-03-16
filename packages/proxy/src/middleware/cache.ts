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
}

export class CacheMiddleware implements PipelineMiddleware {
  readonly name = "cache";
  readonly phase = "both" as const;

  private cache = new Map<string, CacheEntry>();
  private ttlMs: number;
  private maxEntries: number;

  constructor(config: BastionConfig) {
    this.ttlMs = (config.cache?.ttl_seconds ?? 3600) * 1000;
    this.maxEntries = config.cache?.max_entries ?? 10_000;
  }

  private computeKey(ctx: PipelineContext): string {
    const messages = ctx.request.messages
      .map((m) => ({ role: m.role, content: m.content }))
      .sort((a, b) => {
        if (a.role !== b.role) return a.role.localeCompare(b.role);
        return a.content.localeCompare(b.content);
      });

    const payload = JSON.stringify({
      model: ctx.request.model,
      messages,
      temperature: ctx.request.temperature,
      maxTokens: ctx.request.maxTokens,
    });

    return createHash("sha256").update(payload).digest("hex");
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
    // Request phase: check cache for hit
    if (!ctx.response) {
      const key = this.computeKey(ctx);
      const entry = this.cache.get(key);

      if (entry && entry.expiresAt > Date.now()) {
        entry.hits += 1;
        ctx.cacheHit = true;
        ctx.metadata.cacheKey = key;
        return { action: "short-circuit", response: entry.response };
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

      // If still at capacity after eviction, remove the oldest entry
      if (this.cache.size >= this.maxEntries) {
        const firstKey = this.cache.keys().next().value;
        if (firstKey !== undefined) {
          this.cache.delete(firstKey);
        }
      }

      this.cache.set(key, {
        response: ctx.response,
        expiresAt: Date.now() + this.ttlMs,
        hits: 0,
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
