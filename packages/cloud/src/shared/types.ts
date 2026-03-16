export interface Tenant {
  id: string;
  name: string;
  email: string;
  apiKeyHash: string;      // SHA-256 of control plane API key
  proxyKeyHash: string;    // SHA-256 of data plane proxy key
  providerKeys: ProviderKeys;
  plan: "free" | "team" | "enterprise";
  status: "active" | "suspended" | "deleted";
  createdAt: Date;
  updatedAt: Date;
}

export interface ProviderKeys {
  anthropic?: string;
  openai?: string;
  ollama?: string;
}

export interface TenantConfig {
  tenantId: string;
  config: TenantBastionConfig;
  version: number;
  updatedAt: Date;
}

// Subset of BastionConfig relevant per tenant
export interface TenantBastionConfig {
  providers: {
    primary: string;
    fallback?: string;
  };
  cache?: {
    enabled: boolean;
    strategy: string;
    ttl_seconds: number;
    max_entries: number;
  };
  rate_limits?: {
    enabled: boolean;
    requests_per_minute: number;
    tokens_per_minute?: number;
  };
  policies: Array<{
    name: string;
    on: "request" | "response" | "both";
    action: "block" | "warn" | "redact" | "tag";
    condition: Record<string, unknown>;
  }>;
}

export interface UsageRecord {
  id: string;
  tenantId: string;
  timestamp: Date;
  provider: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  status: "success" | "blocked" | "error";
  durationMs: number;
  cacheHit: boolean;
}

export interface UsageSummary {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCostUsd: number;
  blockedRequests: number;
  cacheHits: number;
  averageDurationMs: number;
  period: { start: string; end: string };
}

export interface CreateTenantRequest {
  name: string;
  email: string;
  providerKeys: ProviderKeys;
  plan?: "free" | "team" | "enterprise";
}

export interface CreateTenantResponse {
  tenant: { id: string; name: string; email: string; plan: string; status: string };
  controlKey: string;   // Plaintext, shown only once
  proxyKey: string;     // Plaintext, shown only once
}

export interface UpdateConfigRequest {
  config: TenantBastionConfig;
}
