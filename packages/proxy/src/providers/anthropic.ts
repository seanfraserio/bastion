import type {
  IProvider,
  NormalizedRequest,
  NormalizedResponse,
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

export class AnthropicProvider implements IProvider {
  readonly name: ProviderName = "anthropic";

  async forward(
    request: NormalizedRequest,
    rawBody: unknown,
    config: ProviderConfig,
  ): Promise<NormalizedResponse> {
    if (!config.apiKey) {
      throw new Error(`API key not configured for provider '${this.name}'`);
    }

    const url = `${config.baseUrl}/v1/messages`;

    const body = rawBody ?? {
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
      stream: request.stream,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "x-api-key": config.apiKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
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

  supports(model: string): boolean {
    return model.startsWith("claude-");
  }

  estimateCost(inputTokens: number, outputTokens: number, model: string): number {
    return sharedEstimateCost(model, inputTokens, outputTokens);
  }
}
