export interface HealthResponse {
  status: "ok";
  version: string;
  uptime: number;
}

export interface StatsResponse {
  totalRequests: number;
  blockedRequests: number;
  cacheHits: number;
  cacheMisses: number;
  cacheHitRate: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalEstimatedCostUsd: number;
  providerBreakdown: Record<string, { requests: number; tokens: number }>;
}

export interface BastionClientOptions {
  baseUrl: string;
  timeout?: number;
}
