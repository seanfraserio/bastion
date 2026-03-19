import { HealthResponse, StatsResponse, BastionClientOptions } from "./types.js";

export class BastionClient {
  private baseUrl: string;
  private timeout: number;

  constructor(options: BastionClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.timeout = options.timeout ?? 5000;
  }

  async health(): Promise<HealthResponse> {
    const res = await fetch(`${this.baseUrl}/health`, {
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) {
      throw new Error(`Health check failed with status ${res.status}`);
    }
    return res.json() as Promise<HealthResponse>;
  }

  async stats(): Promise<StatsResponse> {
    const res = await fetch(`${this.baseUrl}/stats`, {
      signal: AbortSignal.timeout(this.timeout),
    });
    if (!res.ok) {
      throw new Error(`Stats request failed with status ${res.status}`);
    }
    return res.json() as Promise<StatsResponse>;
  }

  // TODO: Add admin endpoints for config reload, policy updates, etc.
}
