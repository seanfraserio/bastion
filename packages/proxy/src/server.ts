import Fastify from "fastify";
import { v4 as uuidv4 } from "uuid";
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
import { routeToProvider } from "./router.js";
import type { IAuditExporter } from "./exporters/types.js";
import { FileExporter } from "./exporters/file.js";
import { StdoutExporter } from "./exporters/stdout.js";
import { HttpExporter } from "./exporters/http.js";

const VERSION = "0.1.0";

interface RequestStats {
  totalRequests: number;
  blockedRequests: number;
  errors: number;
}

function buildNormalizedRequest(
  body: Record<string, unknown>,
  provider: ProviderName,
): NormalizedRequest {
  const messages: NormalizedMessage[] = [];

  if (provider === "anthropic") {
    // Anthropic format: { model, messages: [{role, content}], system?, ... }
    const rawMessages = (body.messages ?? []) as Array<{
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
      model: (body.model as string) ?? "",
      messages,
      systemPrompt: typeof body.system === "string" ? body.system : undefined,
      temperature: body.temperature as number | undefined,
      maxTokens: (body.max_tokens as number | undefined) ?? 4096,
      stream: (body.stream as boolean) ?? false,
      rawBody: body,
    };
  }

  // OpenAI format: { model, messages: [{role, content}], ... }
  const rawMessages = (body.messages ?? []) as Array<{
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
    model: (body.model as string) ?? "",
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
  return {
    id: uuidv4(),
    requestId: (headers["x-request-id"] as string) ?? uuidv4(),
    agentName: headers["x-bastion-agent"] as string | undefined,
    teamName: headers["x-bastion-team"] as string | undefined,
    environment: (headers["x-bastion-env"] as string) ?? "production",
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

function buildPipeline(config: BastionConfig): { pipeline: Pipeline; cacheMiddleware: CacheMiddleware } {
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

  if (config.audit?.enabled !== false) {
    const exporter = createAuditExporter(config);
    pipeline.use(new AuditMiddleware(config, exporter));
  }

  return { pipeline, cacheMiddleware };
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

  let { pipeline, cacheMiddleware } = buildPipeline(config);

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

    const authHeader = request.headers["authorization"];
    const apiKeyHeader = request.headers["x-api-key"];

    let token: string | undefined;

    if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
      token = authHeader.slice(7);
    } else if (typeof apiKeyHeader === "string") {
      token = apiKeyHeader;
    }

    if (!token || !config.auth.tokens.includes(token)) {
      reply.code(401).send({ error: "unauthorized" });
      return;
    }
  });

  // Proxy handler factory
  function createProxyHandler(defaultProvider: ProviderName) {
    return async (
      request: { body: unknown; headers: Record<string, string | string[] | undefined>; ip: string; log: { error: (msg: unknown) => void } },
      reply: { code: (c: number) => { send: (b: unknown) => void }; send: (b: unknown) => void },
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
        const result = await pipeline.run(ctx);

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
      // Check if the request is authenticated
      const authHeader = request.headers["authorization"];
      const apiKeyHeader = request.headers["x-api-key"];

      let token: string | undefined;
      if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
        token = authHeader.slice(7);
      } else if (typeof apiKeyHeader === "string") {
        token = apiKeyHeader;
      }

      if (!token || !config.auth.tokens.includes(token)) {
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

  // Hot reload on SIGHUP
  process.on("SIGHUP", async () => {
    try {
      const newConfig = await loadConfig(resolvedPath);
      const rebuilt = buildPipeline(newConfig);
      pipeline = rebuilt.pipeline;
      cacheMiddleware = rebuilt.cacheMiddleware;
      app.log.info("Configuration reloaded successfully");
    } catch (err) {
      app.log.error(
        `Failed to reload configuration: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  });

  // Warn if the proxy is bound to a non-localhost address without TLS
  if (config.proxy.host !== "127.0.0.1" && config.proxy.host !== "localhost") {
    console.warn("[bastion] WARNING: Proxy is bound to a non-localhost address without TLS. Consider using a TLS-terminating reverse proxy.");
  }

  return { app, config };
}
