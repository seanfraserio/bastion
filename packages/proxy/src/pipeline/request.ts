import type { BastionConfig } from "@bastion-ai/config";
import type { PipelineMiddleware } from "./types.js";
import { RateLimitMiddleware } from "../middleware/rate-limit.js";
import { InjectionDetectorMiddleware } from "../middleware/injection.js";
import { PolicyMiddleware } from "../middleware/policy.js";
import { CacheMiddleware } from "../middleware/cache.js";

/**
 * Build the ordered array of request-phase middleware.
 *
 * Order: rate-limit -> injection -> policy -> cache
 */
export function buildRequestMiddleware(
  config: BastionConfig,
  sharedCache: CacheMiddleware,
  sharedPolicy: PolicyMiddleware,
): PipelineMiddleware[] {
  const middlewares: PipelineMiddleware[] = [];

  if (config.rate_limits?.enabled !== false) {
    middlewares.push(new RateLimitMiddleware(config));
  }

  middlewares.push(new InjectionDetectorMiddleware());
  middlewares.push(sharedPolicy);

  if (config.cache?.enabled !== false) {
    middlewares.push(sharedCache);
  }

  return middlewares;
}
