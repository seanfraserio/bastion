import type {
  PipelineContext,
  PipelineMiddleware,
  PipelineMiddlewareResult,
} from "../pipeline/types.js";

const MAX_BUCKETS = 10_000;

export interface RateLimitOptions {
  requestsPerMinute: number;
  tokensPerMinute?: number;
  agentOverrides?: Record<string, number>;
}

interface TokenBucket {
  tokens: number;
  lastRefill: number;
  requestsPerMinute: number;
  tokensPerMinute: number;
}

export class RateLimitMiddleware implements PipelineMiddleware {
  readonly name = "rate-limit";
  readonly phase = "request" as const;

  private buckets = new Map<string, TokenBucket>();
  private globalRequestsPerMinute: number;
  private globalTokensPerMinute: number;
  private agentOverrides: Map<string, { rpm?: number }>;

  constructor(options: RateLimitOptions) {
    this.globalRequestsPerMinute = options.requestsPerMinute;
    this.globalTokensPerMinute = options.tokensPerMinute ?? 100_000;
    this.agentOverrides = new Map();

    if (options.agentOverrides) {
      for (const [name, rpm] of Object.entries(options.agentOverrides)) {
        this.agentOverrides.set(name, { rpm });
      }
    }
  }

  private evictStale(): void {
    const staleThreshold = Date.now() - 60_000; // 60 seconds
    for (const [key, bucket] of this.buckets) {
      if (bucket.lastRefill < staleThreshold) {
        this.buckets.delete(key);
      }
    }
  }

  private getBucket(key: string): TokenBucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      // Enforce MAX_BUCKETS limit before creating a new one
      if (this.buckets.size >= MAX_BUCKETS) {
        this.evictStale();
      }

      // If still at capacity after stale eviction, LRU-evict the oldest bucket
      if (this.buckets.size >= MAX_BUCKETS) {
        let oldestKey: string | null = null;
        let oldestTime = Infinity;
        for (const [key, bucket] of this.buckets) {
          if (bucket.lastRefill < oldestTime) {
            oldestTime = bucket.lastRefill;
            oldestKey = key;
          }
        }
        if (oldestKey) this.buckets.delete(oldestKey);
      }

      const overrides = this.agentOverrides.get(key);
      const rpm = overrides?.rpm ?? this.globalRequestsPerMinute;

      bucket = {
        tokens: rpm,
        lastRefill: Date.now(),
        requestsPerMinute: rpm,
        tokensPerMinute: this.globalTokensPerMinute,
      };
      this.buckets.set(key, bucket);
    }
    return bucket;
  }

  private refill(bucket: TokenBucket): void {
    const now = Date.now();
    const elapsed = now - bucket.lastRefill;
    const refillAmount =
      (elapsed / 60_000) * bucket.requestsPerMinute;

    bucket.tokens = Math.min(
      bucket.requestsPerMinute,
      bucket.tokens + refillAmount,
    );
    bucket.lastRefill = now;
  }

  async process(ctx: PipelineContext): Promise<PipelineMiddlewareResult> {
    // If there is an agent-specific override, key by agent name;
    // otherwise key by source IP (falling back to "__global__")
    let key: string;
    if (ctx.agentName && this.agentOverrides.has(ctx.agentName)) {
      key = ctx.agentName;
    } else {
      key = ctx.sourceIp ?? "__global__";
    }

    const bucket = this.getBucket(key);

    this.refill(bucket);

    if (bucket.tokens < 1) {
      // Compute how many seconds until 1 token is available
      const retryAfterSeconds = Math.ceil(60 / bucket.requestsPerMinute);
      ctx.metadata.retryAfterSeconds = retryAfterSeconds;
      return {
        action: "block",
        reason: "Rate limit exceeded. Try again later.",
        statusCode: 429,
      };
    }

    bucket.tokens -= 1;

    return { action: "continue", ctx };
  }

  /** Exposed for testing: reset all buckets */
  reset(): void {
    this.buckets.clear();
  }
}
