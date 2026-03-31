import type { BastionConfig } from "@openbastion-ai/config";
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
import { isPrivateUrl } from "@freelancer/shared-utils";

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

// Known safe default URLs that are allowed even though some match private patterns
const SAFE_DEFAULT_URLS = new Set([
  "http://localhost:11434", // Ollama local runner
]);

function buildProviderConfig(
  providerName: string,
  config: BastionConfig,
): ProviderConfig {
  const def = config.providers!.definitions[providerName];
  const defaultUrls: Record<string, string> = {
    anthropic: "https://api.anthropic.com",
    openai: "https://api.openai.com",
    ollama: "http://localhost:11434",
    bedrock: "https://bedrock-runtime.us-east-1.amazonaws.com",
  };

  const baseUrl = def?.base_url ?? defaultUrls[providerName] ?? "https://localhost";

  // Warn on private IPs in user-configured base_url (allow known defaults like Ollama).
  // This is admin-controlled config (YAML file), so we warn rather than block — the admin
  // may intentionally use a local URL (e.g., Ollama, local model server, test mock).
  if (def?.base_url && isPrivateUrl(def.base_url) && !SAFE_DEFAULT_URLS.has(def.base_url)) {
    console.warn(`[bastion] WARNING: Provider "${providerName}" uses private base_url "${def.base_url}". This is unsafe in production — use a public endpoint or allowlisted URL.`);
  }

  return {
    apiKey: def?.api_key,
    baseUrl,
    timeoutMs: def?.timeout_ms ?? 30_000,
  };
}

export interface ProviderRouter {
  forward(ctx: PipelineContext): Promise<NormalizedResponse>;
  getProvider(name: ProviderName): IProvider;
  getProviderConfig(name: string): ProviderConfig;
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

  function enrichContext(
    ctx: PipelineContext,
    response: NormalizedResponse,
    provider: IProvider,
  ): void {
    ctx.inputTokens = response.inputTokens;
    ctx.outputTokens = response.outputTokens;
    ctx.estimatedCostUsd = provider.estimateCost(
      response.inputTokens,
      response.outputTokens,
      ctx.model,
    );
  }

  async function forward(ctx: PipelineContext): Promise<NormalizedResponse> {
    const primaryName = ctx.provider ?? config.providers!.primary;
    const primary = getProvider(primaryName as ProviderName);
    const primaryConfig = buildProviderConfig(primaryName, config);

    try {
      const response = await primary.forward(
        ctx.request,
        ctx.request.rawBody,
        primaryConfig,
      );

      enrichContext(ctx, response, primary);

      return response;
    } catch (err) {
      const statusCode = extractStatusCode(err);
      const shouldFallback =
        statusCode !== undefined &&
        (statusCode === 429 || statusCode >= 500);

      if (shouldFallback && config.providers?.fallback) {
        const fallbackName = config.providers.fallback!;
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

          enrichContext(ctx, response, fallback);

          return response;
        } catch (fallbackErr) {
          console.error(
            `Both primary ("${primaryName}") and fallback ("${fallbackName}") providers failed.`,
            `Primary error:`, err,
            `Fallback error:`, fallbackErr,
          );
          throw new ProviderError(
            502,
            "Provider request failed",
          );
        }
      }

      if (err instanceof ProviderError) {
        throw err;
      }
      console.error(`Provider "${primaryName}" failed:`, err);
      throw new ProviderError(
        statusCode ?? 502,
        "Provider request failed",
      );
    }
  }

  function getProviderConfig(name: string): ProviderConfig {
    return buildProviderConfig(name, config);
  }

  return { forward, getProvider, getProviderConfig };
}

function extractStatusCode(err: unknown): number | undefined {
  if (err instanceof ProviderError) {
    return err.statusCode;
  }
  if (err instanceof Error) {
    // Match "status 429" or "(429)" patterns
    const match = err.message.match(/\((\d{3})\)/) ?? err.message.match(/status (\d{3})/);
    if (match) {
      return parseInt(match[1], 10);
    }
  }
  return undefined;
}
