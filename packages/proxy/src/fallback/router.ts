import type { BastionConfig } from "@bastion-ai/config";
import type {
  PipelineContext,
  NormalizedResponse,
  IProvider,
  ProviderConfig,
  ProviderName,
} from "../pipeline/types.js";
import { AnthropicProvider } from "../providers/anthropic.js";
import { OpenAIProvider } from "../providers/openai.js";
import { OllamaProvider } from "../providers/ollama.js";
import { BedrockProvider } from "../providers/bedrock.js";

export class ProviderError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

const PROVIDER_MAP: Record<string, () => IProvider> = {
  anthropic: () => new AnthropicProvider(),
  openai: () => new OpenAIProvider(),
  ollama: () => new OllamaProvider(),
  bedrock: () => new BedrockProvider(),
};

function buildProviderConfig(
  providerName: string,
  config: BastionConfig,
): ProviderConfig {
  const def = config.providers.definitions[providerName];
  const defaultUrls: Record<string, string> = {
    anthropic: "https://api.anthropic.com",
    openai: "https://api.openai.com",
    ollama: "http://localhost:11434",
    bedrock: "https://bedrock-runtime.us-east-1.amazonaws.com",
  };

  return {
    apiKey: def?.api_key,
    baseUrl: def?.base_url ?? defaultUrls[providerName] ?? "http://localhost",
    timeoutMs: def?.timeout_ms ?? 30_000,
  };
}

export interface ProviderRouter {
  forward(ctx: PipelineContext): Promise<NormalizedResponse>;
  getProvider(name: ProviderName): IProvider;
}

export function createProviderRouter(config: BastionConfig): ProviderRouter {
  const providers = new Map<string, IProvider>();

  for (const [name, factory] of Object.entries(PROVIDER_MAP)) {
    providers.set(name, factory());
  }

  function getProvider(name: ProviderName): IProvider {
    const provider = providers.get(name);
    if (!provider) {
      throw new Error(`Unknown provider: ${name}`);
    }
    return provider;
  }

  async function forward(ctx: PipelineContext): Promise<NormalizedResponse> {
    const primaryName = ctx.provider ?? config.providers.primary;
    const primary = getProvider(primaryName as ProviderName);
    const primaryConfig = buildProviderConfig(primaryName, config);

    try {
      const response = await primary.forward(
        ctx.request,
        ctx.request.rawBody,
        primaryConfig,
      );

      ctx.inputTokens = response.inputTokens;
      ctx.outputTokens = response.outputTokens;
      ctx.estimatedCostUsd = primary.estimateCost(
        response.inputTokens,
        response.outputTokens,
        ctx.model,
      );

      return response;
    } catch (err) {
      const statusCode = extractStatusCode(err);
      const shouldFallback =
        statusCode !== undefined &&
        (statusCode === 429 || statusCode >= 500);

      if (shouldFallback && config.providers.fallback) {
        const fallbackName = config.providers.fallback;
        const fallback = getProvider(fallbackName as ProviderName);
        const fallbackConfig = buildProviderConfig(fallbackName, config);

        console.warn(
          `Primary provider "${primaryName}" failed with ${statusCode}, falling back to "${fallbackName}"`,
        );

        ctx.fallbackUsed = true;

        try {
          const response = await fallback.forward(
            ctx.request,
            ctx.request.rawBody,
            fallbackConfig,
          );

          ctx.inputTokens = response.inputTokens;
          ctx.outputTokens = response.outputTokens;
          ctx.estimatedCostUsd = fallback.estimateCost(
            response.inputTokens,
            response.outputTokens,
            ctx.model,
          );

          return response;
        } catch (fallbackErr) {
          throw new ProviderError(
            502,
            `Both primary ("${primaryName}") and fallback ("${fallbackName}") providers failed. ` +
              `Primary: ${String(err)}. Fallback: ${String(fallbackErr)}`,
          );
        }
      }

      if (err instanceof ProviderError) {
        throw err;
      }
      throw new ProviderError(
        statusCode ?? 502,
        `Provider "${primaryName}" failed: ${String(err)}`,
      );
    }
  }

  return { forward, getProvider };
}

function extractStatusCode(err: unknown): number | undefined {
  if (err instanceof ProviderError) {
    return err.statusCode;
  }
  if (err instanceof Error) {
    const match = err.message.match(/\((\d{3})\)/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return undefined;
}
