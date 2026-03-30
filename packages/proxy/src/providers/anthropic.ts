import type {
  IProvider,
  NormalizedRequest,
  NormalizedResponse,
  StreamingResponse,
  ProviderConfig,
  ProviderName,
} from "../pipeline/types.js";
import { estimateCost as sharedEstimateCost } from "../costs.js";

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicResponse {
  id: string;
  type: string;
  role: string;
  content: AnthropicContentBlock[];
  model: string;
  stop_reason: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

interface PreparedRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  controller: AbortController;
  timeout: ReturnType<typeof setTimeout>;
}

export class AnthropicProvider implements IProvider {
  readonly name: ProviderName = "anthropic";

  private buildRequest(
    request: NormalizedRequest,
    rawBody: unknown,
    config: ProviderConfig,
  ): PreparedRequest {
    if (!config.apiKey) {
      throw new Error(`API key not configured for provider '${this.name}'`);
    }

    const url = `${config.baseUrl}/v1/messages`;

    const body = (rawBody as Record<string, unknown>) ?? {
      model: request.model,
      max_tokens: request.maxTokens ?? 4096,
      messages: request.messages
        .filter((m) => m.role !== "system")
        .map((m) => ({
          role: m.role,
          content: m.content,
        })),
      ...(request.systemPrompt ? { system: request.systemPrompt } : {}),
      ...(request.temperature !== undefined
        ? { temperature: request.temperature }
        : {}),
      ...(request.tools && request.tools.length > 0
        ? {
            tools: request.tools.map((t) => ({
              name: t.name,
              description: t.description,
              input_schema: t.inputSchema,
            })),
          }
        : {}),
    };

    const headers: Record<string, string> = {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    return { url, headers, body, controller, timeout };
  }

  async forward(
    request: NormalizedRequest,
    rawBody: unknown,
    config: ProviderConfig,
  ): Promise<NormalizedResponse> {
    const { url, headers, body, controller, timeout } = this.buildRequest(
      request,
      rawBody,
      config,
    );

    // Preserve stream flag from the original request
    const requestBody = { ...body, stream: request.stream };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
        keepalive: true,
      });

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(
          `Anthropic API error (${res.status}): ${errorBody}`,
        );
      }

      const data = (await res.json()) as AnthropicResponse;

      const textContent = data.content
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("");

      return {
        content: textContent,
        stopReason: data.stop_reason ?? undefined,
        inputTokens: data.usage.input_tokens,
        outputTokens: data.usage.output_tokens,
        rawBody: data,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  async forwardStream(
    request: NormalizedRequest,
    rawBody: unknown,
    config: ProviderConfig,
  ): Promise<StreamingResponse> {
    const { url, headers, body, controller, timeout } = this.buildRequest(
      request,
      rawBody,
      config,
    );

    // Ensure stream: true regardless of rawBody
    const streamBody = { ...body, stream: true };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(streamBody),
        signal: controller.signal,
      });

      // Clear timeout once headers arrive — stream may take much longer
      clearTimeout(timeout);

      if (!res.ok) {
        const errorBody = await res.text();
        throw new Error(
          `Anthropic API error (${res.status}): ${errorBody}`,
        );
      }

      if (!res.body) {
        throw new Error("Anthropic API returned no body for streaming request");
      }

      return {
        body: res.body,
        contentType: res.headers.get("content-type") ?? "text/event-stream",
      };
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  }

  supports(model: string): boolean {
    return model.startsWith("claude-");
  }

  estimateCost(inputTokens: number, outputTokens: number, model: string): number {
    return sharedEstimateCost(model, inputTokens, outputTokens);
  }
}
