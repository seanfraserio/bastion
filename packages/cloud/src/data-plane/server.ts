import Fastify from "fastify";
import { initializeDatabase, query } from "../db/client.js";
import { resolveTenant } from "./tenant-resolver.js";
import { buildBastionConfig } from "./config-cache.js";
import { Pipeline, PipelineBlockedError } from "@openbastion-ai/proxy";
// Note: we need to import internals. For now, we'll implement a simplified proxy handler.

export async function createDataPlane() {
  const app = Fastify({
    logger: { level: process.env.LOG_LEVEL || "info" },
  });

  await initializeDatabase();

  // Health check
  app.get("/health", async () => ({ status: "ok", service: "bastion-data-plane" }));

  // Main proxy handler — all LLM API paths
  const proxyHandler = async (request: any, reply: any) => {
    const startTime = Date.now();

    // Extract proxy key from auth header (tenant sends their proxy key as the API key)
    const authHeader = request.headers.authorization as string | undefined;
    const apiKeyHeader = request.headers["x-api-key"] as string | undefined;

    const proxyKey = authHeader?.startsWith("Bearer ")
      ? authHeader.slice(7)
      : apiKeyHeader;

    if (!proxyKey || !proxyKey.startsWith("bst_proxy_")) {
      return reply.code(401).send({ error: "unauthorized", message: "Invalid proxy key" });
    }

    // Resolve tenant
    const resolved = await resolveTenant(proxyKey);
    if (!resolved) {
      return reply.code(401).send({ error: "unauthorized", message: "Unknown or inactive tenant" });
    }

    const { tenant, config: tenantConfig } = resolved;

    // Determine provider from request path
    const path = request.url;
    let provider = tenantConfig.providers.primary;
    if (path.includes("/v1/chat/completions")) {
      provider = "openai";
    } else if (path.includes("/v1/messages")) {
      provider = "anthropic";
    }

    // Get provider API key
    const providerKey = tenant.providerKeys[provider as keyof typeof tenant.providerKeys];
    if (!providerKey) {
      return reply.code(400).send({ error: "provider_not_configured", message: `No API key configured for provider '${provider}'` });
    }

    // Forward to the real provider
    const body = request.body;
    let targetUrl: string;
    const headers: Record<string, string> = { "Content-Type": "application/json" };

    if (provider === "anthropic") {
      targetUrl = `https://api.anthropic.com${path}`;
      headers["x-api-key"] = providerKey;
      headers["anthropic-version"] = "2023-06-01";
    } else if (provider === "openai") {
      targetUrl = `https://api.openai.com${path}`;
      headers["Authorization"] = `Bearer ${providerKey}`;
    } else {
      return reply.code(400).send({ error: "unsupported_provider" });
    }

    try {
      const response = await fetch(targetUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(30000),
      });

      const responseBody = await response.json();
      const durationMs = Date.now() - startTime;

      // Extract token usage
      let inputTokens = 0;
      let outputTokens = 0;
      const rb = responseBody as any;
      if (provider === "anthropic" && rb.usage) {
        inputTokens = rb.usage.input_tokens ?? 0;
        outputTokens = rb.usage.output_tokens ?? 0;
      } else if (provider === "openai" && rb.usage) {
        inputTokens = rb.usage.prompt_tokens ?? 0;
        outputTokens = rb.usage.completion_tokens ?? 0;
      }

      // Log usage (fire and forget)
      query(
        `INSERT INTO usage_logs (tenant_id, provider, model, input_tokens, output_tokens, estimated_cost_usd, status, duration_ms, cache_hit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          tenant.id, provider, (body as any).model ?? "unknown",
          inputTokens, outputTokens, 0,
          response.ok ? "success" : "error", durationMs, false,
        ]
      ).catch((err: Error) => console.error("Failed to log usage:", err.message));

      return reply.code(response.status).send(responseBody);
    } catch (err) {
      const durationMs = Date.now() - startTime;

      // Log error usage
      query(
        `INSERT INTO usage_logs (tenant_id, provider, model, status, duration_ms)
         VALUES ($1, $2, $3, 'error', $4)`,
        [tenant.id, provider, (body as any)?.model ?? "unknown", durationMs]
      ).catch(() => {});

      return reply.code(502).send({ error: "upstream_error", message: "Failed to reach provider" });
    }
  };

  // Register proxy routes
  app.post("/v1/messages", proxyHandler);
  app.post("/v1/chat/completions", proxyHandler);

  return app;
}

// Entry point for Cloud Run
if (process.argv[1]?.includes("data-plane")) {
  const port = parseInt(process.env.PORT || "8080", 10);
  const host = process.env.HOST || "0.0.0.0";

  createDataPlane().then((app) => {
    app.listen({ port, host }).then(() => {
      console.log(`Bastion Data Plane running on http://${host}:${port}`);
    });
  });
}
