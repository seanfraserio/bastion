// Mock data for development — used when the Bastion API server is not connected.

export interface UsageStat {
  date: string;
  requests: number;
  blocked: number;
  cached: number;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  model: string;
  status: "allowed" | "blocked" | "redacted" | "warned";
  durationMs: number;
  provider: string;
  tokensIn: number;
  tokensOut: number;
}

export interface ApiKey {
  id: string;
  prefix: string;
  suffix: string;
  type: "proxy" | "control";
  createdAt: string;
  lastUsedAt: string | null;
}

export interface Policy {
  id: string;
  name: string;
  trigger: "request" | "response" | "both";
  action: "block" | "warn" | "redact" | "tag";
  conditionType: string;
  condition: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
}

export interface Provider {
  id: string;
  name: string;
  slug: string;
  configured: boolean;
  role: "primary" | "fallback" | "none";
  baseUrl: string | null;
  timeoutMs: number;
}

// ---------------------------------------------------------------------------
// Usage stats (last 30 days)
// ---------------------------------------------------------------------------

function generateUsageData(days: number): UsageStat[] {
  const data: UsageStat[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now);
    date.setDate(date.getDate() - i);
    const base = 800 + Math.floor(Math.random() * 400);
    data.push({
      date: date.toISOString().split("T")[0],
      requests: base,
      blocked: Math.floor(base * (0.02 + Math.random() * 0.04)),
      cached: Math.floor(base * (0.15 + Math.random() * 0.1)),
    });
  }
  return data;
}

export const mockUsage7d = generateUsageData(7);
export const mockUsage30d = generateUsageData(30);
export const mockUsage90d = generateUsageData(90);

export function getUsageData(range: "7d" | "30d" | "90d"): UsageStat[] {
  switch (range) {
    case "7d":
      return mockUsage7d;
    case "30d":
      return mockUsage30d;
    case "90d":
      return mockUsage90d;
  }
}

// Aggregate stats
export const mockOverviewStats = {
  totalRequests: mockUsage30d.reduce((s, d) => s + d.requests, 0),
  blocked: mockUsage30d.reduce((s, d) => s + d.blocked, 0),
  estimatedCost: 127.43,
  cacheHitRate: 21.7,
};

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

const models = [
  "claude-3.5-sonnet",
  "claude-3-opus",
  "gpt-4o",
  "gpt-4o-mini",
  "llama-3.1-70b",
];
const statuses: AuditEntry["status"][] = [
  "allowed",
  "allowed",
  "allowed",
  "allowed",
  "blocked",
  "redacted",
  "warned",
];
const providers = ["anthropic", "openai", "ollama"];

export const mockAuditLog: AuditEntry[] = Array.from(
  { length: 20 },
  (_, i) => {
    const date = new Date();
    date.setMinutes(date.getMinutes() - i * 7);
    return {
      id: `audit-${i + 1}`,
      timestamp: date.toISOString(),
      model: models[i % models.length],
      status: statuses[i % statuses.length],
      durationMs: 120 + Math.floor(Math.random() * 900),
      provider: providers[i % providers.length],
      tokensIn: 200 + Math.floor(Math.random() * 1800),
      tokensOut: 100 + Math.floor(Math.random() * 2400),
    };
  }
);

// ---------------------------------------------------------------------------
// API Keys
// ---------------------------------------------------------------------------

export const mockApiKeys: ApiKey[] = [
  {
    id: "key-1",
    prefix: "bst_proxy_",
    suffix: "a3f9",
    type: "proxy",
    createdAt: "2026-02-15T10:30:00Z",
    lastUsedAt: "2026-03-17T08:12:00Z",
  },
  {
    id: "key-2",
    prefix: "bst_ctrl_",
    suffix: "7c21",
    type: "control",
    createdAt: "2026-02-15T10:30:00Z",
    lastUsedAt: "2026-03-16T22:45:00Z",
  },
  {
    id: "key-3",
    prefix: "bst_proxy_",
    suffix: "e8b4",
    type: "proxy",
    createdAt: "2026-03-01T14:00:00Z",
    lastUsedAt: null,
  },
];

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

export const mockPolicies: Policy[] = [
  {
    id: "pol-1",
    name: "Block prompt injection",
    trigger: "request",
    action: "block",
    conditionType: "injection_score",
    condition: { threshold: 0.85 },
    enabled: true,
    createdAt: "2026-02-15T10:30:00Z",
  },
  {
    id: "pol-2",
    name: "Redact PII in responses",
    trigger: "response",
    action: "redact",
    conditionType: "pii_detected",
    condition: { entities: ["email", "phone", "ssn"] },
    enabled: true,
    createdAt: "2026-02-18T09:00:00Z",
  },
  {
    id: "pol-3",
    name: "Warn on long prompts",
    trigger: "request",
    action: "warn",
    conditionType: "length_exceeds",
    condition: { field: "prompt", value: 50000 },
    enabled: true,
    createdAt: "2026-03-01T12:00:00Z",
  },
  {
    id: "pol-4",
    name: "Tag competitor mentions",
    trigger: "both",
    action: "tag",
    conditionType: "contains",
    condition: {
      field: "all",
      value: "competitor-product",
      case_sensitive: false,
    },
    enabled: false,
    createdAt: "2026-03-05T16:30:00Z",
  },
  {
    id: "pol-5",
    name: "Block SQL patterns",
    trigger: "request",
    action: "block",
    conditionType: "regex",
    condition: {
      field: "prompt",
      value: "(?i)(drop|delete|truncate)\\s+table",
      case_sensitive: false,
    },
    enabled: true,
    createdAt: "2026-03-10T11:00:00Z",
  },
];

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------

export const mockProviders: Provider[] = [
  {
    id: "prov-1",
    name: "Anthropic",
    slug: "anthropic",
    configured: true,
    role: "primary",
    baseUrl: null,
    timeoutMs: 30000,
  },
  {
    id: "prov-2",
    name: "OpenAI",
    slug: "openai",
    configured: true,
    role: "fallback",
    baseUrl: null,
    timeoutMs: 30000,
  },
  {
    id: "prov-3",
    name: "Ollama",
    slug: "ollama",
    configured: false,
    role: "none",
    baseUrl: "http://localhost:11434",
    timeoutMs: 60000,
  },
];

// ---------------------------------------------------------------------------
// Usage Analytics (time series + model breakdown + cost)
// ---------------------------------------------------------------------------

export interface UsageTimeSeriesPoint {
  date: string;
  anthropic: number;
  openai: number;
  ollama: number;
}

export interface ModelBreakdownRow {
  model: string;
  provider: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
}

function generateUsageTimeSeries(days: number): UsageTimeSeriesPoint[] {
  const data: UsageTimeSeriesPoint[] = [];
  const now = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    data.push({
      date: d.toISOString().split("T")[0],
      anthropic: Math.floor(Math.random() * 500) + 200,
      openai: Math.floor(Math.random() * 300) + 100,
      ollama: Math.floor(Math.random() * 100) + 20,
    });
  }
  return data;
}

export const mockUsageTimeSeries7d = generateUsageTimeSeries(7);
export const mockUsageTimeSeries30d = generateUsageTimeSeries(30);
export const mockUsageTimeSeries90d = generateUsageTimeSeries(90);

export function getUsageTimeSeries(range: "7d" | "30d" | "90d"): UsageTimeSeriesPoint[] {
  switch (range) {
    case "7d":
      return mockUsageTimeSeries7d;
    case "30d":
      return mockUsageTimeSeries30d;
    case "90d":
      return mockUsageTimeSeries90d;
  }
}

export const mockModelBreakdown: ModelBreakdownRow[] = [
  { model: "claude-3.5-sonnet", provider: "anthropic", requests: 4521, inputTokens: 2_340_000, outputTokens: 890_000, estimatedCostUsd: 34.56 },
  { model: "claude-3-haiku", provider: "anthropic", requests: 3102, inputTokens: 1_200_000, outputTokens: 450_000, estimatedCostUsd: 8.12 },
  { model: "gpt-4o", provider: "openai", requests: 2847, inputTokens: 1_800_000, outputTokens: 720_000, estimatedCostUsd: 28.90 },
  { model: "gpt-4o-mini", provider: "openai", requests: 1923, inputTokens: 890_000, outputTokens: 340_000, estimatedCostUsd: 4.67 },
  { model: "llama-3.1-70b", provider: "ollama", requests: 812, inputTokens: 450_000, outputTokens: 180_000, estimatedCostUsd: 0.00 },
  { model: "claude-3-opus", provider: "anthropic", requests: 356, inputTokens: 280_000, outputTokens: 120_000, estimatedCostUsd: 18.45 },
];

// ---------------------------------------------------------------------------
// Extended Audit Entries (with policy decisions and pagination-friendly count)
// ---------------------------------------------------------------------------

export interface ExtendedAuditEntry {
  id: string;
  timestamp: string;
  provider: string;
  model: string;
  status: "success" | "blocked" | "error";
  durationMs: number;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  cacheHit: boolean;
  policyDecisions?: Array<{
    policy: string;
    action: string;
    reason: string;
  }>;
}

const extStatuses: ExtendedAuditEntry["status"][] = ["success", "success", "success", "success", "blocked", "error"];
const extModels = ["claude-3.5-sonnet", "gpt-4o", "claude-3-haiku", "gpt-4o-mini", "llama-3.1-70b"];
const extProviders = ["anthropic", "openai", "anthropic", "openai", "ollama"];

export const mockExtendedAuditLog: ExtendedAuditEntry[] = Array.from({ length: 200 }, (_, i) => {
  const modelIdx = i % extModels.length;
  const status = extStatuses[i % extStatuses.length];

  const entry: ExtendedAuditEntry = {
    id: `audit-ext-${String(i + 1).padStart(4, "0")}`,
    timestamp: new Date(Date.now() - i * 3_600_000 * (0.5 + Math.random())).toISOString(),
    provider: extProviders[modelIdx],
    model: extModels[modelIdx],
    status,
    durationMs: Math.floor(Math.random() * 3000) + 200,
    inputTokens: Math.floor(Math.random() * 5000) + 100,
    outputTokens: Math.floor(Math.random() * 2000) + 50,
    estimatedCostUsd: parseFloat((Math.random() * 0.05).toFixed(4)),
    cacheHit: Math.random() > 0.8,
  };

  if (status === "blocked") {
    entry.policyDecisions = [
      { policy: "pii-filter", action: "block", reason: "PII detected in request: email address" },
    ];
  } else if (status === "error") {
    entry.policyDecisions = [
      { policy: "rate-limit", action: "block", reason: "Rate limit exceeded: 1000 req/min" },
    ];
  } else if (Math.random() > 0.7) {
    entry.policyDecisions = [
      { policy: "content-filter", action: "warn", reason: "Potentially sensitive content detected" },
    ];
  }

  return entry;
});

// ---------------------------------------------------------------------------
// Team Members
// ---------------------------------------------------------------------------

export interface TeamMember {
  id: string;
  email: string;
  role: "admin" | "member";
  invitedAt: string;
  acceptedAt: string | null;
}

export const mockTeamMembers: TeamMember[] = [
  { id: "tm-001", email: "admin@company.com", role: "admin", invitedAt: "2025-01-15T10:00:00Z", acceptedAt: "2025-01-15T10:30:00Z" },
  { id: "tm-002", email: "dev@company.com", role: "member", invitedAt: "2025-02-01T14:00:00Z", acceptedAt: "2025-02-01T15:00:00Z" },
  { id: "tm-003", email: "alice@company.com", role: "member", invitedAt: "2025-03-10T09:00:00Z", acceptedAt: "2025-03-10T09:45:00Z" },
  { id: "tm-004", email: "bob@company.com", role: "member", invitedAt: "2025-03-12T11:00:00Z", acceptedAt: null },
  { id: "tm-005", email: "carol@company.com", role: "admin", invitedAt: "2025-03-14T16:00:00Z", acceptedAt: "2025-03-14T17:00:00Z" },
];

// ---------------------------------------------------------------------------
// Tenant & Plan Details
// ---------------------------------------------------------------------------

export const mockTenant = {
  id: "tenant-001",
  name: "Acme Corp",
  email: "admin@acme.com",
  plan: "team" as const,
  status: "active" as const,
  usage: {
    requestsUsed: 12_345,
    requestsLimit: 50_000,
    tokensUsed: 8_900_000,
    tokensLimit: 20_000_000,
  },
};

export const planDetails: Record<string, { name: string; price: string; requestsLimit: number; tokensLimit: number }> = {
  free: { name: "Free", price: "$0/mo", requestsLimit: 1_000, tokensLimit: 500_000 },
  team: { name: "Team", price: "$49/mo", requestsLimit: 50_000, tokensLimit: 20_000_000 },
  enterprise: { name: "Enterprise", price: "Custom", requestsLimit: 1_000_000, tokensLimit: 500_000_000 },
};
