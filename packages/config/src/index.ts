export {
  bastionConfigSchema,
  proxySchema,
  logLevelSchema,
  providersSchema,
  providerDefinitionSchema,
  cacheSchema,
  cacheStrategySchema,
  rateLimitsSchema,
  agentRateLimitSchema,
  policySchema,
  policyConditionSchema,
  policyOnSchema,
  policyActionSchema,
  auditSchema,
  auditOutputSchema,
  lanternSchema,
} from "./schema.js";

export type {
  BastionConfig,
  ProviderDefinition,
  PolicyCondition,
  Policy,
} from "./schema.js";

export { loadConfig } from "./loader.js";

export { watchConfig } from "./watcher.js";
export type { ConfigChangeCallback } from "./watcher.js";
