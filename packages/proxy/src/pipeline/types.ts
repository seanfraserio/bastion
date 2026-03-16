export type ProviderName = "anthropic" | "openai" | "ollama" | "bedrock";
export type PolicyAction = "block" | "warn" | "redact" | "tag";

export interface PipelineContext {
  id: string;
  requestId: string;
  agentName?: string;
  teamName?: string;
  environment: string;
  provider: ProviderName;
  model: string;
  startTime: number;
  request: NormalizedRequest;
  response?: NormalizedResponse;
  decisions: PolicyDecision[];
  cacheHit: boolean;
  fallbackUsed: boolean;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  metadata: Record<string, unknown>;
}

export interface NormalizedRequest {
  model: string;
  messages: NormalizedMessage[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: NormalizedTool[];
  stream: boolean;
  rawBody: unknown;
}

export interface NormalizedMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  rawContent: unknown;
}

export interface NormalizedTool {
  name: string;
  description?: string;
  inputSchema: unknown;
}

export interface NormalizedResponse {
  content: string;
  stopReason?: string;
  inputTokens: number;
  outputTokens: number;
  rawBody: unknown;
}

export interface PolicyDecision {
  policyName: string;
  matched: boolean;
  action?: PolicyAction;
  reason?: string;
  timestamp: number;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  agentName?: string;
  teamName?: string;
  environment: string;
  provider: ProviderName;
  model: string;
  cacheHit: boolean;
  fallbackUsed: boolean;
  inputTokens?: number;
  outputTokens?: number;
  estimatedCostUsd?: number;
  policies: PolicyDecision[];
  durationMs: number;
  status: "success" | "blocked" | "error";
  requestId: string;
}

export interface IProvider {
  name: ProviderName;
  forward(
    request: NormalizedRequest,
    rawBody: unknown,
    config: ProviderConfig,
  ): Promise<NormalizedResponse>;
  supports(model: string): boolean;
  estimateCost(inputTokens: number, outputTokens: number, model: string): number;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl: string;
  timeoutMs: number;
}

export interface PipelineMiddleware {
  name: string;
  phase: "request" | "response" | "both";
  process(ctx: PipelineContext): Promise<PipelineMiddlewareResult>;
}

export type PipelineMiddlewareResult =
  | { action: "continue"; ctx: PipelineContext }
  | { action: "block"; reason: string; statusCode: number }
  | { action: "short-circuit"; response: NormalizedResponse };
