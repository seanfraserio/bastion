import type {
  PipelineContext,
  NormalizedRequest,
  NormalizedResponse,
  StreamingResponse,
} from "../pipeline/types.js";

export interface UpstreamConfig {
  url: string;
  proxy_key: string;
  timeout_ms: number;
  forward_agent_headers: boolean;
}

const PROVIDER_PATHS: Record<string, string> = {
  anthropic: "/v1/messages",
  openai: "/v1/chat/completions",
};

export class UpstreamProvider {
  constructor(private config: UpstreamConfig) {}

  private buildHeaders(ctx: PipelineContext): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${this.config.proxy_key}`,
      "X-Request-Id": ctx.requestId,
    };
    if (this.config.forward_agent_headers) {
      if (ctx.agentName) headers["X-Bastion-Agent"] = ctx.agentName;
      if (ctx.teamName) headers["X-Bastion-Team"] = ctx.teamName;
      if (ctx.environment) headers["X-Bastion-Env"] = ctx.environment;
    }
    return headers;
  }

  private buildUrl(provider: string): string {
    const path = PROVIDER_PATHS[provider];
    if (!path) {
      throw Object.assign(
        new Error(`No upstream path for provider: ${provider}`),
        { statusCode: 400 },
      );
    }
    return this.config.url.replace(/\/+$/, "") + path;
  }

  async forward(ctx: PipelineContext): Promise<NormalizedResponse> {
    const url = this.buildUrl(ctx.provider);
    const headers = this.buildHeaders(ctx);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeout_ms);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(ctx.request.rawBody),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        const body = await response
          .json()
          .catch(() => ({ error: "upstream_error" }));
        throw Object.assign(
          new Error(`Upstream returned ${response.status}`),
          { statusCode: response.status, body },
        );
      }

      const body = (await response.json()) as Record<string, unknown>;

      // Parse Anthropic-style or OpenAI-style response
      const content = Array.isArray(body.content)
        ? (body.content as Array<{ type: string; text?: string }>)
            .filter((c) => c.type === "text")
            .map((c) => c.text ?? "")
            .join("")
        : ((body.choices as Array<{ message?: { content?: string } }>) ??
            [])[0]?.message?.content ?? "";

      const usage = (body.usage ?? {}) as {
        input_tokens?: number;
        output_tokens?: number;
        prompt_tokens?: number;
        completion_tokens?: number;
      };
      const inputTokens = usage.input_tokens ?? usage.prompt_tokens ?? 0;
      const outputTokens = usage.output_tokens ?? usage.completion_tokens ?? 0;

      ctx.inputTokens = inputTokens;
      ctx.outputTokens = outputTokens;

      return {
        content,
        stopReason:
          (body.stop_reason as string) ??
          (body.choices as any)?.[0]?.finish_reason ??
          undefined,
        inputTokens,
        outputTokens,
        rawBody: body,
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err && typeof err === "object" && "statusCode" in err) throw err;
      if (err instanceof DOMException && err.name === "AbortError") {
        throw Object.assign(new Error("Upstream request timed out"), {
          statusCode: 504,
          body: { error: "gateway_timeout", upstream_url: url },
        });
      }
      throw Object.assign(
        new Error(
          `Failed to reach upstream proxy: ${err instanceof Error ? err.message : "unknown error"}`,
        ),
        {
          statusCode: 502,
          body: { error: "upstream_unavailable", upstream_url: url },
        },
      );
    }
  }

  async forwardStream(
    request: NormalizedRequest,
    rawBody: unknown,
    ctx: PipelineContext,
  ): Promise<StreamingResponse> {
    const url = this.buildUrl(ctx.provider);
    const headers = this.buildHeaders(ctx);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeout_ms);

    try {
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(rawBody),
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) {
        const body = await response
          .json()
          .catch(() => ({ error: "upstream_error" }));
        throw Object.assign(
          new Error(`Upstream returned ${response.status}`),
          { statusCode: response.status, body },
        );
      }
      if (!response.body) {
        throw Object.assign(
          new Error("Upstream returned no body for streaming request"),
          { statusCode: 502 },
        );
      }
      return {
        body: response.body,
        contentType:
          response.headers.get("content-type") ?? "text/event-stream",
      };
    } catch (err: unknown) {
      clearTimeout(timer);
      if (err && typeof err === "object" && "statusCode" in err) throw err;
      if (err instanceof DOMException && err.name === "AbortError") {
        throw Object.assign(
          new Error("Upstream streaming request timed out"),
          {
            statusCode: 504,
            body: { error: "gateway_timeout", upstream_url: url },
          },
        );
      }
      throw Object.assign(
        new Error(
          `Failed to reach upstream proxy: ${err instanceof Error ? err.message : "unknown error"}`,
        ),
        {
          statusCode: 502,
          body: { error: "upstream_unavailable", upstream_url: url },
        },
      );
    }
  }
}
