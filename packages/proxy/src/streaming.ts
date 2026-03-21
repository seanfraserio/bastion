import type { ProviderName } from "./pipeline/types.js";

export interface StreamingUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface UsageTrackingResult {
  stream: ReadableStream<Uint8Array>;
  usage: Promise<StreamingUsage>;
}

/**
 * Wraps a provider SSE stream in a TransformStream that:
 * 1. Passes all chunks through to the client unchanged
 * 2. Parses SSE events to extract token usage from the final events
 *
 * Anthropic sends usage in `message_start` (input_tokens) and `message_delta` (output_tokens).
 * OpenAI sends usage in the final chunk when `stream_options.include_usage` is true.
 */
export function createUsageTrackingStream(
  source: ReadableStream<Uint8Array>,
  provider: ProviderName | string,
): UsageTrackingResult {
  let resolveUsage: (usage: StreamingUsage) => void;
  const usage = new Promise<StreamingUsage>((resolve) => {
    resolveUsage = resolve;
  });

  const decoder = new TextDecoder();
  let buffer = "";
  let inputTokens = 0;
  let outputTokens = 0;

  const transform = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      controller.enqueue(chunk);

      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ") || line === "data: [DONE]") continue;
        try {
          const data = JSON.parse(line.slice(6));
          if (provider === "anthropic") {
            if (data.type === "message_start" && data.message?.usage) {
              inputTokens = data.message.usage.input_tokens ?? 0;
            }
            if (data.type === "message_delta" && data.usage) {
              outputTokens = data.usage.output_tokens ?? 0;
            }
          } else if (provider === "openai") {
            if (data.usage) {
              inputTokens = data.usage.prompt_tokens ?? 0;
              outputTokens = data.usage.completion_tokens ?? 0;
            }
          }
        } catch {
          // Not valid JSON — skip
        }
      }
    },
    flush() {
      resolveUsage!({ inputTokens, outputTokens });
    },
  });

  return {
    stream: source.pipeThrough(transform),
    usage,
  };
}
