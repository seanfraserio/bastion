import type { BastionConfig } from "@bastion-ai/config";
import type {
  PipelineContext,
  PipelineMiddleware,
  PipelineMiddlewareResult,
} from "../pipeline/types.js";

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

    if (rl?.agents) {
      for (const agent of rl.agents) {
        this.agentOverrides.set(agent.name, {
          rpm: agent.requests_per_minute,
          tpm: agent.tokens_per_minute,
        });
      }
    }
  }

  private getBucket(key: string): TokenBucket {
    let bucket = this.buckets.get(key);
    if (!bucket) {
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
    const key = ctx.agentName ?? "__global__";
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
