import type {
  IProvider,
  NormalizedRequest,
  NormalizedResponse,
  StreamingResponse,
  ProviderConfig,
  ProviderName,
} from "../pipeline/types.js";
import { estimateCost as sharedEstimateCost } from "../costs.js";

interface OpenAIMessage {
  role: string;
  content: string | null;
}

interface OpenAIChoice {
  index: number;
  message: OpenAIMessage;
  finish_reason: string | null;
}

interface OpenAIResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: OpenAIChoice[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface PreparedRequest {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
  controller: AbortController;
  timeout: ReturnType<typeof setTimeout>;
}

export class OpenAIProvider implements IProvider {
  readonly name: ProviderName = "openai";

  private buildRequest(
    request: NormalizedRequest,
    rawBody: unknown,
    config: ProviderConfig,
  ): PreparedRequest {
    if (!config.apiKey) {
      throw new Error(`API key not configured for provider '${this.name}'`);
    }

    const url = `${config.baseUrl}/v1/chat/completions`;

    const messages: OpenAIMessage[] = [];

    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }

    for (const msg of request.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    const body = (rawBody as Record<string, unknown>) ?? {
      model: request.model,
      messages,
      ...(request.temperature !== undefined
        ? { temperature: request.temperature }
        : {}),
      ...(request.maxTokens !== undefined
        ? { max_tokens: request.maxTokens }
        : {}),
      ...(request.tools && request.tools.length > 0
        ? {
            tools: request.tools.map((t) => ({
              type: "function" as const,
              function: {
                name: t.name,
                description: t.description,
                parameters: t.inputSchema,
              },
            })),
          }
        : {}),
    };

    const headers: Record<string, string> = {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
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
        throw new Error(`OpenAI API error (${res.status}): ${errorBody}`);
      }

      const data = (await res.json()) as OpenAIResponse;
      const choice = data.choices[0];

      return {
        content: choice?.message?.content ?? "",
        stopReason: choice?.finish_reason ?? undefined,
        inputTokens: data.usage.prompt_tokens,
        outputTokens: data.usage.completion_tokens,
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

    // Ensure stream: true and request usage in final chunk
    const streamBody = {
      ...body,
      stream: true,
      stream_options: { include_usage: true },
    };

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
        throw new Error(`OpenAI API error (${res.status}): ${errorBody}`);
      }

      if (!res.body) {
        throw new Error("OpenAI API returned no body for streaming request");
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
    return model.startsWith("gpt-") || model.startsWith("o3");
  }

  estimateCost(inputTokens: number, outputTokens: number, model: string): number {
    return sharedEstimateCost(model, inputTokens, outputTokens);
  }
}
