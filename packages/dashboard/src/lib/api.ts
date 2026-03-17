const CONTROL_PLANE_URL =
  process.env.NEXT_PUBLIC_CONTROL_PLANE_URL || "http://localhost:4100";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiOptions extends RequestInit {
  controlKey?: string;
}

async function apiClient<T>(path: string, options: ApiOptions = {}): Promise<T> {
  const { controlKey, ...fetchOptions } = options;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (controlKey) {
    headers["Authorization"] = `Bearer ${controlKey}`;
  }

  const response = await fetch(`${CONTROL_PLANE_URL}${path}`, {
    ...fetchOptions,
    headers,
  });

  if (!response.ok) {
    const body = await response.text();
    let message: string;
    try {
      const json = JSON.parse(body);
      message = json.error || json.message || body;
    } catch {
      message = body;
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json();
}

// ---------- Tenant ----------

export interface Tenant {
  id: string;
  name: string;
  controlKey: string;
  proxyKey: string;
  createdAt: string;
}

export interface CreateTenantRequest {
  name: string;
  providerKeys?: {
    anthropic?: string;
    openai?: string;
  };
}

export function createTenant(data: CreateTenantRequest): Promise<Tenant> {
  return apiClient<Tenant>("/tenants", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function getTenant(controlKey: string): Promise<Tenant> {
  return apiClient<Tenant>("/tenant", { controlKey });
}

export function updateTenant(
  controlKey: string,
  data: Partial<Pick<Tenant, "name">>
): Promise<Tenant> {
  return apiClient<Tenant>("/tenant", {
    method: "PATCH",
    controlKey,
    body: JSON.stringify(data),
  });
}

export function deleteTenant(controlKey: string): Promise<void> {
  return apiClient<void>("/tenant", {
    method: "DELETE",
    controlKey,
  });
}

// ---------- Config ----------

export interface TenantConfig {
  providers: Record<string, ProviderConfig>;
  policies: PolicyConfig[];
  rateLimit?: RateLimitConfig;
  cache?: CacheConfig;
  pii?: PiiConfig;
  injection?: InjectionConfig;
}

export interface ProviderConfig {
  apiKey: string;
  models?: string[];
  priority?: number;
}

export interface PolicyConfig {
  name: string;
  conditions: Record<string, unknown>[];
  action: string;
}

export interface RateLimitConfig {
  requestsPerMinute?: number;
  tokensPerMinute?: number;
}

export interface CacheConfig {
  enabled: boolean;
  ttlSeconds?: number;
}

export interface PiiConfig {
  enabled: boolean;
  action?: string;
}

export interface InjectionConfig {
  enabled: boolean;
  threshold?: number;
}

export function getConfig(controlKey: string): Promise<TenantConfig> {
  return apiClient<TenantConfig>("/tenant/config", { controlKey });
}

export function updateConfig(
  controlKey: string,
  config: Partial<TenantConfig>
): Promise<TenantConfig> {
  return apiClient<TenantConfig>("/tenant/config", {
    method: "PUT",
    controlKey,
    body: JSON.stringify(config),
  });
}

// ---------- Usage ----------

export interface UsageSummary {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  periodStart: string;
  periodEnd: string;
}

export interface UsageBreakdown {
  byProvider: Record<string, ProviderUsage>;
  byModel: Record<string, ModelUsage>;
  byDay: DailyUsage[];
}

export interface ProviderUsage {
  requests: number;
  tokens: number;
  cost: number;
}

export interface ModelUsage {
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cost: number;
}

export interface DailyUsage {
  date: string;
  requests: number;
  tokens: number;
  cost: number;
}

export function getUsage(
  controlKey: string,
  params?: { from?: string; to?: string }
): Promise<UsageSummary> {
  const query = new URLSearchParams();
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  const qs = query.toString();
  return apiClient<UsageSummary>(
    `/tenant/usage${qs ? `?${qs}` : ""}`,
    { controlKey }
  );
}

export function getUsageBreakdown(
  controlKey: string,
  params?: { from?: string; to?: string }
): Promise<UsageBreakdown> {
  const query = new URLSearchParams();
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  const qs = query.toString();
  return apiClient<UsageBreakdown>(
    `/tenant/usage/breakdown${qs ? `?${qs}` : ""}`,
    { controlKey }
  );
}

// ---------- API Keys ----------

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
  expiresAt?: string;
  scopes?: string[];
}

export interface CreateApiKeyRequest {
  name: string;
  expiresAt?: string;
  scopes?: string[];
}

export interface CreateApiKeyResponse extends ApiKey {
  key: string; // full key only returned on creation
}

export function listApiKeys(controlKey: string): Promise<ApiKey[]> {
  return apiClient<ApiKey[]>("/tenant/keys", { controlKey });
}

export function createApiKey(
  controlKey: string,
  data: CreateApiKeyRequest
): Promise<CreateApiKeyResponse> {
  return apiClient<CreateApiKeyResponse>("/tenant/keys", {
    method: "POST",
    controlKey,
    body: JSON.stringify(data),
  });
}

export function revokeApiKey(
  controlKey: string,
  keyId: string
): Promise<void> {
  return apiClient<void>(`/tenant/keys/${keyId}`, {
    method: "DELETE",
    controlKey,
  });
}

// ---------- Audit Log ----------

export interface AuditEntry {
  id: string;
  timestamp: string;
  action: string;
  actor: string;
  resource: string;
  details?: Record<string, unknown>;
  provider?: string;
  model?: string;
  status: "success" | "blocked" | "error";
  latencyMs?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export interface AuditLogParams {
  from?: string;
  to?: string;
  action?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

export function getAuditLog(
  controlKey: string,
  params?: AuditLogParams
): Promise<{ entries: AuditEntry[]; total: number }> {
  const query = new URLSearchParams();
  if (params?.from) query.set("from", params.from);
  if (params?.to) query.set("to", params.to);
  if (params?.action) query.set("action", params.action);
  if (params?.status) query.set("status", params.status);
  if (params?.limit) query.set("limit", String(params.limit));
  if (params?.offset) query.set("offset", String(params.offset));
  const qs = query.toString();
  return apiClient<{ entries: AuditEntry[]; total: number }>(
    `/tenant/audit${qs ? `?${qs}` : ""}`,
    { controlKey }
  );
}

// ---------- Team ----------

export interface TeamMember {
  id: string;
  email: string;
  name?: string;
  role: "owner" | "admin" | "member" | "viewer";
  joinedAt: string;
}

export interface InviteRequest {
  email: string;
  role: "admin" | "member" | "viewer";
}

export function listTeamMembers(controlKey: string): Promise<TeamMember[]> {
  return apiClient<TeamMember[]>("/tenant/team", { controlKey });
}

export function inviteTeamMember(
  controlKey: string,
  data: InviteRequest
): Promise<TeamMember> {
  return apiClient<TeamMember>("/tenant/team", {
    method: "POST",
    controlKey,
    body: JSON.stringify(data),
  });
}

export function updateTeamMember(
  controlKey: string,
  memberId: string,
  data: { role: string }
): Promise<TeamMember> {
  return apiClient<TeamMember>(`/tenant/team/${memberId}`, {
    method: "PATCH",
    controlKey,
    body: JSON.stringify(data),
  });
}

export function removeTeamMember(
  controlKey: string,
  memberId: string
): Promise<void> {
  return apiClient<void>(`/tenant/team/${memberId}`, {
    method: "DELETE",
    controlKey,
  });
}
