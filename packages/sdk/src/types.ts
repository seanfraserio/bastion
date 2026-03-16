export interface HealthResponse {
  status: "ok";
  version: string;
  uptime: number;
}

export interface StatsResponse {
  totalRequests: number;
  blockedRequests: number;
  errors: number;
  cache: {
    size: number;
    totalHits: number;
  };
}

export interface BastionClientOptions {
  baseUrl: string;
  timeout?: number;
}
