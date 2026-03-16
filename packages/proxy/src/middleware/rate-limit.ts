import type { BastionConfig } from "@openbastion-ai/config";
import type {
  PipelineContext,
  PipelineMiddleware,
  PipelineMiddlewareResult,
} from "../pipeline/types.js";

const MAX_BUCKETS = 10_000;

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
  private agentOverrides: Map<string, { rpm?: number; tpm?: number }>;

  constructor(config: BastionConfig) {
    const rl = config.rate_limits;
    this.globalRequestsPerMinute = rl?.requests_per_minute ?? 60;
    this.globalTokensPerMinute = rl?.tokens_per_minute ?? 100_000;
    this.agentOverrides = new Map();

    // Warn if tokens_per_minute is configured globally
    if (rl?.tokens_per_minute) {
      console.warn("Warning: tokens_per_minute is not yet enforced. Only requests_per_minute is active.");
    }

    if (rl?.agents) {
      for (const agent of rl.agents) {
        // Warn if tokens_per_minute is configured per agent
        if (agent.tokens_per_minute) {
          console.warn(`Warning: tokens_per_minute is not yet enforced. Only requests_per_minute is active.`);
        }
        this.agentOverrides.set(agent.name, {
          rpm: agent.requests_per_minute,
          tpm: agent.tokens_per_minute,
        });
      }
    }
  }

  private evictOldest(): void {
    let oldestKey: string | undefined;
    let oldestRefill = Infinity;

    for (const [key, bucket] of this.buckets) {
      if (bucket.lastRefill < oldestRefill) {
        oldestRefill = bucket.lastRefill;
        oldestKey = key;
      }
    }

    if (oldestKey !== undefined) {
      this.buckets.delete(oldestKey);
    }
  }

  private getBucket(key: string): TokenBucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
      // Enforce MAX_BUCKETS limit before creating a new one
      if (this.buckets.size >= MAX_BUCKETS) {
        this.evictOldest();
      }

      const overrides = this.agentOverrides.get(key);
      const rpm = overrides?.rpm ?? this.globalRequestsPerMinute;
      const tpm = overrides?.tpm ?? this.globalTokensPerMinute;

      bucket = {
        tokens: rpm,
        lastRefill: Date.now(),
        requestsPerMinute: rpm,
        tokensPerMinute: tpm,
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

    if (bucket.tokens <= 0) {
      return {
        action: "block",
        reason: `Rate limit exceeded for "${key}". Try again later.`,
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
