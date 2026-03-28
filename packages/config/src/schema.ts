import { z } from "zod";

// ---------------------------------------------------------------------------
// Provider definition
// ---------------------------------------------------------------------------

export const providerDefinitionSchema = z.object({
  api_key: z.string().optional(),
  base_url: z.string().url().optional(),
  timeout_ms: z.number().int().positive().optional(),
});

export type ProviderDefinition = z.infer<typeof providerDefinitionSchema>;

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export const providersSchema = z.object({
  primary: z.string(),
  fallback: z.string().optional(),
  definitions: z.record(z.string(), providerDefinitionSchema),
});

// ---------------------------------------------------------------------------
// Proxy
// ---------------------------------------------------------------------------

export const logLevelSchema = z.enum(["debug", "info", "warn", "error"]);

export const proxySchema = z.object({
  port: z.number().int().positive(),
  host: z.string().default("127.0.0.1"),
  log_level: logLevelSchema.default("info"),
});

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

export const cacheStrategySchema = z.enum(["exact", "semantic"]);

export const cacheSchema = z.object({
  enabled: z.boolean().default(true),
  strategy: cacheStrategySchema.default("exact"),
  ttl_seconds: z.number().int().positive().default(3600),
  max_entries: z.number().int().positive().default(10000),
});

// ---------------------------------------------------------------------------
// Rate limits
// ---------------------------------------------------------------------------

export const agentRateLimitSchema = z.object({
  name: z.string(),
  requests_per_minute: z.number().int().positive().optional(),
  tokens_per_minute: z.number().int().positive().optional(),
});

export const rateLimitsSchema = z.object({
  enabled: z.boolean().default(true),
  requests_per_minute: z.number().int().positive().optional(),
  tokens_per_minute: z.number().int().positive().optional(),
  agents: z.array(agentRateLimitSchema).optional(),
});

// ---------------------------------------------------------------------------
// Policy conditions — flexible union with shared + type-specific fields
// ---------------------------------------------------------------------------

const policyFieldSchema = z.enum(["prompt", "response", "all"]);

const containsConditionSchema = z.object({
  type: z.literal("contains"),
  field: policyFieldSchema,
  value: z.string(),
  case_sensitive: z.boolean().default(false),
});

const regexConditionSchema = z.object({
  type: z.literal("regex"),
  field: policyFieldSchema,
  value: z.string(),
  case_sensitive: z.boolean().default(true),
});

const injectionScoreConditionSchema = z.object({
  type: z.literal("injection_score"),
  threshold: z.number().min(0).max(1),
});

const piiDetectedConditionSchema = z.object({
  type: z.literal("pii_detected"),
  entities: z.array(z.string()).min(1),
});

const lengthExceedsConditionSchema = z.object({
  type: z.literal("length_exceeds"),
  field: policyFieldSchema,
  value: z.number().int().positive(),
});

export const policyConditionSchema = z.discriminatedUnion("type", [
  containsConditionSchema,
  regexConditionSchema,
  injectionScoreConditionSchema,
  piiDetectedConditionSchema,
  lengthExceedsConditionSchema,
]);

export type PolicyCondition = z.infer<typeof policyConditionSchema>;

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

export const policyOnSchema = z.enum(["request", "response", "both"]);
export const policyActionSchema = z.enum(["block", "warn", "redact", "tag"]);

export const policySchema = z.object({
  name: z.string(),
  on: policyOnSchema,
  action: policyActionSchema,
  condition: policyConditionSchema,
});

export type Policy = z.infer<typeof policySchema>;

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export const auditOutputSchema = z.enum(["file", "stdout", "http", "pubsub"]);

export const auditSchema = z.object({
  enabled: z.boolean().default(true),
  output: auditOutputSchema.default("file"),
  file_path: z.string().optional(),
  endpoint: z.string().url().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  pubsub_topic: z.string().optional(),
  pubsub_project_id: z.string().optional(),
  pubsub_ordering_key: z.string().optional(),
  include_request_body: z.boolean().default(false),
  include_response_body: z.boolean().default(false),
});

// ---------------------------------------------------------------------------
// Lantern (observability)
// ---------------------------------------------------------------------------

export const lanternSchema = z.object({
  enabled: z.boolean().default(false),
  endpoint: z.string().url().optional(),
  agent_name: z.string().optional(),
  api_key: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Upstream (edge proxy mode)
// ---------------------------------------------------------------------------

export const upstreamSchema = z.object({
  url: z.string().url(),
  proxy_key: z.string().min(1),
  timeout_ms: z.number().int().positive().optional().default(30000),
  forward_agent_headers: z.boolean().optional().default(true),
});

export type UpstreamConfig = z.infer<typeof upstreamSchema>;

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export const authSchema = z.object({
  enabled: z.boolean().default(false),
  tokens: z.array(z.string()).default([]),
}).default({ enabled: false, tokens: [] });

// ---------------------------------------------------------------------------
// Top-level config
// ---------------------------------------------------------------------------

export const bastionConfigSchema = z.object({
  version: z.string(),
  proxy: proxySchema,
  providers: providersSchema.optional(),
  upstream: upstreamSchema.optional(),
  auth: authSchema,
  cache: cacheSchema.optional(),
  rate_limits: rateLimitsSchema.optional(),
  policies: z.array(policySchema).optional(),
  audit: auditSchema.optional(),
  lantern: lanternSchema.optional(),
}).refine(
  (data) => !(data.upstream && data.providers),
  { message: "upstream and providers are mutually exclusive — use one or the other" },
).refine(
  (data) => !!(data.upstream || data.providers),
  { message: "either upstream or providers must be configured" },
).refine(
  (data) => !data.providers || data.providers.primary in data.providers.definitions,
  { message: "providers.primary must reference a provider defined in providers.definitions" },
).refine(
  (data) => !data.providers || !data.providers.fallback || data.providers.fallback in data.providers.definitions,
  { message: "providers.fallback must reference a provider defined in providers.definitions" },
);

export type BastionConfig = z.infer<typeof bastionConfigSchema>;
