import { TenantBastionConfig, ProviderKeys } from "../shared/types.js";

// Build a full BastionConfig from tenant config + provider keys
export function buildBastionConfig(
  tenantConfig: TenantBastionConfig,
  providerKeys: ProviderKeys,
  port: number = 4000
) {
  const definitions: Record<string, { api_key?: string; base_url?: string; timeout_ms: number }> = {};

  if (providerKeys.anthropic) {
    definitions.anthropic = {
      api_key: providerKeys.anthropic,
      base_url: "https://api.anthropic.com",
      timeout_ms: 30000,
    };
  }
  if (providerKeys.openai) {
    definitions.openai = {
      api_key: providerKeys.openai,
      base_url: "https://api.openai.com",
      timeout_ms: 30000,
    };
  }
  if (providerKeys.ollama) {
    definitions.ollama = {
      base_url: providerKeys.ollama, // Ollama URL, not key
      timeout_ms: 60000,
    };
  }

  return {
    version: "1" as const,
    proxy: { port, host: "0.0.0.0", log_level: "info" as const },
    providers: {
      primary: tenantConfig.providers.primary,
      fallback: tenantConfig.providers.fallback,
      definitions,
    },
    cache: tenantConfig.cache ?? { enabled: false, strategy: "exact" as const, ttl_seconds: 3600, max_entries: 10000 },
    rate_limits: tenantConfig.rate_limits ?? { enabled: false, requests_per_minute: 1000 },
    policies: tenantConfig.policies ?? [],
    audit: { enabled: true, output: "stdout" as const, include_request_body: false, include_response_body: false },
    auth: { enabled: false, tokens: [] },
  };
}
