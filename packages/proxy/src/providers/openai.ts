import type {
  IProvider,
  NormalizedRequest,
  NormalizedResponse,
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

export class OpenAIProvider implements IProvider {
  readonly name: ProviderName = "openai";

  async forward(
    request: NormalizedRequest,
    rawBody: unknown,
    config: ProviderConfig,
  ): Promise<NormalizedResponse> {
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

    const body = rawBody ?? {
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
      stream: request.stream,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
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

  supports(model: string): boolean {
    return model.startsWith("gpt-") || model.startsWith("o3");
  }

  estimateCost(inputTokens: number, outputTokens: number, model: string): number {
    return sharedEstimateCost(model, inputTokens, outputTokens);
  }
}
