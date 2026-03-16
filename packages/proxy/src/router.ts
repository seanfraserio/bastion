import type { BastionConfig } from "@bastion-ai/config";
import type { ProviderName } from "./pipeline/types.js";

/**
 * Route an incoming request path to the appropriate provider name.
 *
 * - `/v1/messages` -> anthropic
 * - `/v1/chat/completions` -> openai
 * - Otherwise, fall back to config.providers.primary
 */
export function routeToProvider(
  path: string,
  config: BastionConfig,
): ProviderName {
  if (path === "/v1/messages" || path.startsWith("/v1/messages")) {
    return "anthropic";
  }

  if (
    path === "/v1/chat/completions" ||
    path.startsWith("/v1/chat/completions")
  ) {
    return "openai";
  }

  return config.providers.primary as ProviderName;
}
