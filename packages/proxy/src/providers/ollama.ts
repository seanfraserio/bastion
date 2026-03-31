import type {
  IProvider,
  NormalizedRequest,
  NormalizedResponse,
  ProviderConfig,
  ProviderName,
} from "../pipeline/types.js";

interface OllamaMessage {
  role: string;
  content: string;
}

interface OllamaResponse {
  model: string;
  created_at: string;
  message: OllamaMessage;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
  done_reason?: string;
}

export class OllamaProvider implements IProvider {
  readonly name: ProviderName = "ollama";

  async forward(
    request: NormalizedRequest,
    _rawBody: unknown,
    config: ProviderConfig,
  ): Promise<NormalizedResponse> {
    if (request.stream) {
      console.warn("[bastion] Ollama provider does not support streaming. Request will be processed as non-streaming.");
    }

    const url = `${config.baseUrl}/api/chat`;

    const messages: OllamaMessage[] = [];

    if (request.systemPrompt) {
      messages.push({ role: "system", content: request.systemPrompt });
    }

    for (const msg of request.messages) {
      messages.push({ role: msg.role, content: msg.content });
    }

    const body = {
      model: request.model,
      messages,
      stream: false,
      ...(request.temperature !== undefined
        ? { options: { temperature: request.temperature } }
        : {}),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorBody = await res.text();
        console.error(`[bastion:ollama] Provider error (${res.status}): ${errorBody}`);
        throw new Error(`Provider request failed with status ${res.status}`);
      }

      const data = (await res.json()) as OllamaResponse;

      return {
        content: data.message?.content ?? "",
        stopReason: data.done_reason ?? (data.done ? "stop" : undefined),
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
        rawBody: data,
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  supports(_model: string): boolean {
    return true;
  }

  estimateCost(
    _inputTokens: number,
    _outputTokens: number,
    _model: string,
  ): number {
    return 0;
  }
}
