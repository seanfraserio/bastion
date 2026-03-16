import type { BastionConfig } from "@bastion-ai/config";
import type { PipelineMiddleware } from "./types.js";
import { CacheMiddleware } from "../middleware/cache.js";
import { PolicyMiddleware } from "../middleware/policy.js";
import { PiiRedactMiddleware } from "../middleware/pii-redact.js";
import { AuditMiddleware } from "../middleware/audit.js";

/**
 * Build the ordered array of response-phase middleware.
 *
 * Order: cache(store) -> pii-redact -> policy -> audit
 */
export function buildResponseMiddleware(
  config: BastionConfig,
  sharedCache: CacheMiddleware,
  sharedPolicy: PolicyMiddleware,
): PipelineMiddleware[] {
  const middlewares: PipelineMiddleware[] = [];

  if (config.cache?.enabled !== false) {
    middlewares.push(sharedCache);
  }

  middlewares.push(new PiiRedactMiddleware());
  middlewares.push(sharedPolicy);

  if (config.audit?.enabled !== false) {
    middlewares.push(new AuditMiddleware(config));
  }

  return middlewares;
}
