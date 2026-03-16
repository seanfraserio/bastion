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

export const auditOutputSchema = z.enum(["file", "stdout", "http"]);

export const auditSchema = z.object({
  enabled: z.boolean().default(true),
  output: auditOutputSchema.default("file"),
  file_path: z.string().optional(),
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
});

// ---------------------------------------------------------------------------
// Top-level config
// ---------------------------------------------------------------------------

export const bastionConfigSchema = z.object({
  version: z.string(),
  proxy: proxySchema,
  providers: providersSchema,
  cache: cacheSchema.optional(),
  rate_limits: rateLimitsSchema.optional(),
  policies: z.array(policySchema).optional(),
  audit: auditSchema.optional(),
  lantern: lanternSchema.optional(),
});

export type BastionConfig = z.infer<typeof bastionConfigSchema>;
