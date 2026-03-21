import Fastify from "fastify";
import { v4 as uuidv4 } from "uuid";
import { timingSafeEqual } from "node:crypto";
import { createRequire } from "node:module";
import { loadConfig, type BastionConfig } from "@openbastion-ai/config";
import { Pipeline, PipelineBlockedError } from "./pipeline/index.js";
import type {
  PipelineContext,
  NormalizedRequest,
  NormalizedMessage,
  ProviderName,
} from "./pipeline/types.js";
import { CacheMiddleware } from "./middleware/cache.js";
import { PolicyMiddleware } from "./middleware/policy.js";
import { RateLimitMiddleware } from "./middleware/rate-limit.js";
import { InjectionDetectorMiddleware } from "./middleware/injection.js";
import { PiiRedactMiddleware } from "./middleware/pii-redact.js";
import { AuditMiddleware } from "./middleware/audit.js";
import { createProviderRouter } from "./fallback/router.js";
import type { ProviderRouter } from "./fallback/router.js";
import { routeToProvider } from "./router.js";
import type { IAuditExporter } from "./exporters/types.js";
import { createUsageTrackingStream } from "./streaming.js";
import { FileExporter } from "./exporters/file.js";
import { StdoutExporter } from "./exporters/stdout.js";
import { HttpExporter } from "./exporters/http.js";
import { registerObservability, recordMetric } from "./observability.js";

let VERSION = "0.0.0";
try {
  const _require = createRequire(import.meta.url);
  VERSION = (_require("../package.json") as { version: string }).version;
} catch {
  // Fallback for CJS builds where import.meta.url is unavailable
}

const VALID_REQUEST_ID = /^[a-zA-Z0-9._-]{1,128}$/;
const VALID_ENV = /^[a-zA-Z0-9._-]{1,64}$/;

/**
 * Constant-time comparison of a candidate token against a list of valid tokens.
 * Prevents timing side-channel attacks on auth token verification.
 */
function constantTimeTokenMatch(tokens: string[], candidate: string): boolean {
  const candidateBuf = Buffer.from(candidate);
  let matched = false;
  for (const token of tokens) {
    const tokenBuf = Buffer.from(token);
    if (candidateBuf.length === tokenBuf.length) {
      if (timingSafeEqual(candidateBuf, tokenBuf)) {
        matched = true;
      }
    } else {
      // Compare against self to keep constant time per token
      timingSafeEqual(candidateBuf, candidateBuf);
    }
  }
  return matched;
}

interface RequestStats {
  totalRequests: number;
  blockedRequests: number;
  errors: number;
}

function buildNormalizedRequest(
  body: Record<string, unknown>,
  provider: ProviderName,
): NormalizedRequest {
  // Validate required fields
  if (typeof body.model !== "string" || !body.model) {
    throw Object.assign(new Error("body.model must be a non-empty string"), { statusCode: 400 });
  }
  if (!Array.isArray(body.messages)) {
    throw Object.assign(new Error("body.messages must be an array"), { statusCode: 400 });
  }

  const messages: NormalizedMessage[] = [];

  if (provider === "anthropic") {
    // Anthropic format: { model, messages: [{role, content}], system?, ... }
    const rawMessages = body.messages as Array<{
      role: string;
      content: unknown;
    }>;
    for (const m of rawMessages) {
      messages.push({
        role: m.role as NormalizedMessage["role"],
        content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
        rawContent: m.content,
      });
    }

    return {
      model: body.model as string,
      messages,
      systemPrompt: typeof body.system === "string" ? body.system : undefined,
      temperature: body.temperature as number | undefined,
      maxTokens: (body.max_tokens as number | undefined) ?? 4096,
      stream: (body.stream as boolean) ?? false,
      rawBody: body,
    };
  }

  // OpenAI format: { model, messages: [{role, content}], ... }
  const rawMessages = body.messages as Array<{
    role: string;
    content: unknown;
  }>;

  let systemPrompt: string | undefined;
  for (const m of rawMessages) {
    if (m.role === "system") {
      systemPrompt = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
      continue;
    }
    messages.push({
      role: m.role as NormalizedMessage["role"],
      content: typeof m.content === "string" ? m.content : JSON.stringify(m.content),
      rawContent: m.content,
    });
  }

  return {
    model: body.model as string,
    messages,
    systemPrompt,
    temperature: body.temperature as number | undefined,
    maxTokens: body.max_tokens as number | undefined,
    stream: (body.stream as boolean) ?? false,
    rawBody: body,
  };
}

function buildPipelineContext(
  request: NormalizedRequest,
  provider: ProviderName,
  headers: Record<string, string | string[] | undefined>,
): PipelineContext {
  // Validate x-request-id: must match safe pattern or generate fresh
  const rawRequestId = headers["x-request-id"] as string | undefined;
  const requestId =
    rawRequestId && VALID_REQUEST_ID.test(rawRequestId)
      ? rawRequestId
      : uuidv4();

  // Validate x-bastion-env: must match safe pattern or default to "production"
  const rawEnv = headers["x-bastion-env"] as string | undefined;
  const environment =
    rawEnv && VALID_ENV.test(rawEnv)
      ? rawEnv
      : "production";

  return {
    id: uuidv4(),
    requestId,
    agentName: typeof headers["x-bastion-agent"] === "string" && VALID_ENV.test(headers["x-bastion-agent"]) ? headers["x-bastion-agent"] : undefined,
    teamName: typeof headers["x-bastion-team"] === "string" && VALID_ENV.test(headers["x-bastion-team"]) ? headers["x-bastion-team"] : undefined,
    environment,
    provider,
    model: request.model,
    startTime: Date.now(),
    request,
    decisions: [],
    cacheHit: false,
    fallbackUsed: false,
    metadata: {},
  };
}

function extractBearerToken(
  headers: Record<string, string | string[] | undefined>,
): string | undefined {
  const authHeader = headers["authorization"];
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7);
  }
  const apiKeyHeader = headers["x-api-key"];
  if (typeof apiKeyHeader === "string") {
    return apiKeyHeader;
  }
  return undefined;
}

function createAuditExporter(config: BastionConfig): IAuditExporter {
  switch (config.audit?.output) {
    case "file":
      return new FileExporter(config.audit.file_path ?? "./logs/audit.jsonl");
    case "http":
      return new HttpExporter(config.audit.endpoint ?? "", config.audit.headers);
    case "stdout":
    default:
      return new StdoutExporter();
  }
}

function buildPipeline(config: BastionConfig): { pipeline: Pipeline; cacheMiddleware: CacheMiddleware; exporter: IAuditExporter | undefined; providerRouter: ProviderRouter } {
  const providerRouter = createProviderRouter(config);
  const pipeline = new Pipeline((ctx) => providerRouter.forward(ctx));

  // Order: rate-limit -> injection -> policy(request) -> cache(request)
  //        -> [provider]
  //        -> cache(response) -> pii-redact -> policy(response) -> audit

  if (config.rate_limits?.enabled !== false) {
    pipeline.use(new RateLimitMiddleware(config));
  }

  pipeline.use(new InjectionDetectorMiddleware());

  const policyMiddleware = new PolicyMiddleware(config);
  pipeline.use(policyMiddleware);

  const cacheMiddleware = new CacheMiddleware(config);
  if (config.cache?.enabled !== false) {
    pipeline.use(cacheMiddleware);
  }

  pipeline.use(new PiiRedactMiddleware());

  let exporter: IAuditExporter | undefined;
  if (config.audit?.enabled !== false) {
    exporter = createAuditExporter(config);
    pipeline.use(new AuditMiddleware(config, exporter));
  }

  return { pipeline, cacheMiddleware, exporter, providerRouter };
}

export async function createServer(configPath?: string) {
  const resolvedPath =
    configPath ?? process.env.BASTION_CONFIG ?? "./bastion.yaml";
  const config = await loadConfig(resolvedPath);

  // Warn if PII detection policies are configured (enterprise-only feature)
  const hasPiiPolicies = config.policies?.some(
    (p) => p.condition.type === "pii_detected",
  );
  if (hasPiiPolicies) {
    console.warn(
      "[bastion] WARNING: PII detection policies are configured but require Bastion Enterprise. PII policies will have no effect in the OSS version.",
    );
  }

  const app = Fastify({
    logger: { level: config.proxy.log_level },
    bodyLimit: 10 * 1024 * 1024, // 10MB — generous for multi-turn LLM conversations
  });

  let { pipeline, cacheMiddleware, exporter, providerRouter } = buildPipeline(config);

  // Observability: send metrics + logs to Grafana Cloud via OTLP
  registerObservability(app, "bastion-proxy");

  const stats: RequestStats = {
    totalRequests: 0,
    blockedRequests: 0,
    errors: 0,
  };

  // Authentication hook
  app.addHook("onRequest", async (request, reply) => {
    if (!config.auth.enabled) {
      return;
    }

    // GET /health is always allowed (but returns limited info for unauth'd)
    if (request.method === "GET" && request.url === "/health") {
      return;
    }

    const token = extractBearerToken(request.headers);

    if (!token || !constantTimeTokenMatch(config.auth.tokens, token)) {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
  });

  // Security headers
  app.addHook("onSend", async (_request, reply) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Cache-Control", "no-store");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
  });

  // Proxy handler factory
  function createProxyHandler(defaultProvider: ProviderName) {
    return async (
      request: { body: unknown; headers: Record<string, string | string[] | undefined>; ip: string; log: { error: (msg: unknown) => void } },
      reply: { code: (c: number) => { send: (b: unknown) => void }; send: (b: unknown) => void; header: (k: string, v: string) => void; raw: import("http").ServerResponse },
    ) => {
      stats.totalRequests += 1;

      const body = request.body as Record<string, unknown>;
      const provider = routeToProvider(
        defaultProvider === "anthropic" ? "/v1/messages" : "/v1/chat/completions",
        config,
      );
      const normalizedRequest = buildNormalizedRequest(body, provider);
      const ctx = buildPipelineContext(
        normalizedRequest,
        provider,
        request.headers as Record<string, string | string[] | undefined>,
      );
      ctx.sourceIp = request.ip;

      try {
        // Streaming path: pipe SSE chunks directly to the client
        if (normalizedRequest.stream) {
          const reqResult = await pipeline.runRequestPhase(ctx);

          // Short-circuit (cache hit) — unlikely for streaming but handle it
          if (reqResult.response) {
            reply.send(reqResult.response.rawBody);
            return;
          }

          const provider = providerRouter.getProvider(reqResult.provider);
          if (!provider.forwardStream) {
            reply.code(400).send({
              error: "streaming_not_supported",
              message: `Provider '${reqResult.provider}' does not support streaming`,
            });
            return;
          }

          const providerConfig = providerRouter.getProviderConfig(reqResult.provider);
          const streamRes = await provider.forwardStream(
            reqResult.request,
            reqResult.request.rawBody,
            providerConfig,
          );

          const { stream, usage } = createUsageTrackingStream(streamRes.body, reqResult.provider);

          // Set SSE headers
          reply.raw.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Content-Type-Options": "nosniff",
            "X-Frame-Options": "DENY",
            "X-Request-Id": reqResult.requestId,
          });

          // Pipe stream to client
          const reader = stream.getReader();
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              reply.raw.write(value);
            }
          } finally {
            reader.releaseLock();
            reply.raw.end();
          }

          // After stream completes, extract usage and run response-phase middleware
          const streamUsage = await usage;
          reqResult.inputTokens = streamUsage.inputTokens;
          reqResult.outputTokens = streamUsage.outputTokens;
          reqResult.response = {
            content: "[streaming]",
            stopReason: "end_turn",
            inputTokens: streamUsage.inputTokens,
            outputTokens: streamUsage.outputTokens,
            rawBody: { streaming: true },
          };

          // Business metrics
          recordMetric("requests_proxied_total", 1, { provider: reqResult.provider ?? "unknown", model: reqResult.model ?? "unknown" });
          if (streamUsage.inputTokens) recordMetric("tokens_input_total", streamUsage.inputTokens, { provider: reqResult.provider ?? "unknown" });
          if (streamUsage.outputTokens) recordMetric("tokens_output_total", streamUsage.outputTokens, { provider: reqResult.provider ?? "unknown" });

          // Run response-phase middleware (audit) fire-and-forget
          pipeline.runResponsePhase(reqResult).catch((err) => {
            request.log.error(err);
          });

          return;
        }

        // Non-streaming path: buffer full response
        const result = await pipeline.run(ctx);

        // Business metrics
        recordMetric("requests_proxied_total", 1, { provider: ctx.provider ?? "unknown", model: ctx.model ?? "unknown" });
        if (result.cacheHit) recordMetric("cache_hit_total", 1, {});
        if (ctx.inputTokens) recordMetric("tokens_input_total", ctx.inputTokens, { provider: ctx.provider ?? "unknown" });
        if (ctx.outputTokens) recordMetric("tokens_output_total", ctx.outputTokens, { provider: ctx.provider ?? "unknown" });
        if (ctx.estimatedCostUsd) recordMetric("estimated_cost_usd", ctx.estimatedCostUsd, { provider: ctx.provider ?? "unknown" });
        if (ctx.metadata?.injectionScore != null) {
          recordMetric("injection_score", ctx.metadata.injectionScore as number, {});
        }

        if (result.response?.rawBody) {
          reply.send(result.response.rawBody);
        } else {
          reply.send({
            content: result.response?.content ?? "",
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
          });
        }
      } catch (err) {
        if (err instanceof PipelineBlockedError) {
          stats.blockedRequests += 1;
          recordMetric("requests_blocked_total", 1, { reason: err.reason.substring(0, 50) });
          if (err.statusCode === 429 && ctx.metadata?.retryAfterSeconds) {
            reply.header("Retry-After", String(ctx.metadata.retryAfterSeconds));
          }
          reply.code(err.statusCode).send({
            error: {
              type: "policy_blocked",
              message: err.reason,
            },
          });
          return;
        }

        stats.errors += 1;
        request.log.error(err);
        const statusCode =
          err instanceof Error && "statusCode" in err
            ? (err as { statusCode: number }).statusCode
            : 502;
        reply.code(statusCode).send({
          error: "internal_error",
          message: "An internal error occurred",
          requestId: ctx.requestId,
        });
      }
    };
  }

  // Routes
  app.post("/v1/messages", createProxyHandler("anthropic"));
  app.post("/v1/chat/completions", createProxyHandler("openai"));

  app.get("/health", async (request) => {
    if (config.auth.enabled) {
      const token = extractBearerToken(request.headers);
      if (!token || !constantTimeTokenMatch(config.auth.tokens, token)) {
        return { status: "ok" };
      }
    }

    return {
      status: "ok",
      version: VERSION,
      uptime: process.uptime(),
    };
  });

  app.get("/stats", async () => ({
    totalRequests: stats.totalRequests,
    blockedRequests: stats.blockedRequests,
    errors: stats.errors,
    cache: cacheMiddleware.stats,
  }));

  // Graceful shutdown: flush exporters and close on signals
  app.addHook("onClose", async () => {
    await exporter?.shutdown?.();
  });

  const shutdownGracefully = async () => {
    await app.close();
  };

  process.once("SIGTERM", shutdownGracefully);
  process.once("SIGINT", shutdownGracefully);

  // Hot reload on SIGHUP (re-registers so subsequent SIGHUPs also reload)
  async function handleSighup(): Promise<void> {
    try {
      const newConfig = await loadConfig(resolvedPath);
      const rebuilt = buildPipeline(newConfig);
      await exporter?.shutdown?.();
      pipeline = rebuilt.pipeline;
      cacheMiddleware = rebuilt.cacheMiddleware;
      exporter = rebuilt.exporter;
      providerRouter = rebuilt.providerRouter;
      app.log.info("Configuration reloaded successfully");
    } catch (err) {
      app.log.error(
        `Failed to reload configuration: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
    process.once("SIGHUP", handleSighup);
  }
  process.once("SIGHUP", handleSighup);

  // Warn if the proxy is bound to a non-localhost address without TLS
  if (config.proxy.host !== "127.0.0.1" && config.proxy.host !== "localhost") {
    console.warn("[bastion] WARNING: Proxy is bound to a non-localhost address without TLS. Consider using a TLS-terminating reverse proxy.");
  }

  // Warn if auth is disabled on a non-localhost binding
  if (
    !config.auth.enabled &&
    config.proxy.host !== "127.0.0.1" &&
    config.proxy.host !== "localhost"
  ) {
    console.warn("[bastion] WARNING: Authentication is disabled on a non-localhost address. This is insecure in production.");
  }

  return { app, config };
}
