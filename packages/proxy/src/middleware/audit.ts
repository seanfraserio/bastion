import * as fs from "node:fs";
import * as path from "node:path";
import type { BastionConfig } from "@openbastion-ai/config";
import type {
  PipelineContext,
  PipelineMiddleware,
  PipelineMiddlewareResult,
  AuditEntry,
} from "../pipeline/types.js";

export class AuditMiddleware implements PipelineMiddleware {
  readonly name = "audit";
  readonly phase = "response" as const;

  private config: BastionConfig;
  private output: "file" | "stdout" | "http";
  private filePath?: string;
  private lanternEnabled: boolean;
  private lanternEndpoint?: string;
  private lanternApiKey?: string;

  constructor(config: BastionConfig) {
    this.config = config;
    this.output = config.audit?.output ?? "stdout";
    this.filePath = config.audit?.file_path;
    this.lanternEnabled = config.lantern?.enabled ?? false;
    this.lanternEndpoint = config.lantern?.endpoint;
    this.lanternApiKey = config.lantern?.api_key;

    // Warn if Lantern endpoint uses insecure HTTP
    if (this.lanternEnabled && this.lanternEndpoint && this.lanternEndpoint.startsWith("http://")) {
      console.warn("Warning: Lantern endpoint is using insecure http://. Consider using https:// instead.");
    }
  }

  private buildAuditEntry(ctx: PipelineContext): AuditEntry {
    const durationMs = Date.now() - ctx.startTime;

    let status: AuditEntry["status"] = "success";
    if (ctx.decisions.some((d) => d.matched && d.action === "block")) {
      status = "blocked";
    }

    const entry: AuditEntry = {
      id: ctx.id,
      timestamp: new Date().toISOString(),
      agentName: ctx.agentName,
      teamName: ctx.teamName,
      environment: ctx.environment,
      provider: ctx.provider,
      model: ctx.model,
      cacheHit: ctx.cacheHit,
      fallbackUsed: ctx.fallbackUsed,
      inputTokens: ctx.inputTokens,
      outputTokens: ctx.outputTokens,
      estimatedCostUsd: ctx.estimatedCostUsd,
      policies: ctx.decisions,
      durationMs,
      status,
      requestId: ctx.requestId,
    };

    if (this.config.audit?.include_request_body) {
      entry.requestBody = ctx.request.rawBody;
    }

    if (this.config.audit?.include_response_body) {
      entry.responseBody = ctx.response?.rawBody;
    }

    return entry;
  }

  async process(ctx: PipelineContext): Promise<PipelineMiddlewareResult> {
    const entry = this.buildAuditEntry(ctx);
    const jsonLine = JSON.stringify(entry);

    switch (this.output) {
      case "file": {
        if (this.filePath) {
          const dir = path.dirname(this.filePath);
          await fs.promises.mkdir(dir, { recursive: true });
          await fs.promises.appendFile(this.filePath, jsonLine + "\n", "utf-8");
        }
        break;
      }

      case "stdout": {
        console.log(jsonLine);
        break;
      }

      case "http": {
        // HTTP output is handled via lantern below
        break;
      }
    }

    // Fire-and-forget span to Lantern if enabled
    if (this.lanternEnabled && this.lanternEndpoint) {
      const endpoint = this.lanternEndpoint;
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (this.lanternApiKey) {
        headers["Authorization"] = `Bearer ${this.lanternApiKey}`;
      }
      fetch(endpoint, {
        method: "POST",
        headers,
        body: jsonLine,
      }).catch((err) => {
        console.warn(`Failed to send audit span to Lantern: ${String(err)}`);
      });
    }

    return { action: "continue", ctx };
  }
}
