import type { ProviderName } from "../pipeline/types.js";

/**
 * In edge mode, infer the logical provider from the request path.
 * Used for middleware context (policies, audit) — the actual forward
 * goes to the upstream Bastion proxy regardless.
 */
export function inferProviderFromPath(path: string): ProviderName {
  if (path === "/v1/messages" || path.startsWith("/v1/messages/")) {
    return "anthropic";
  }
  if (
    path === "/v1/chat/completions" ||
    path.startsWith("/v1/chat/completions/")
  ) {
    return "openai";
  }
  throw Object.assign(new Error(`Unsupported path: ${path}`), {
    statusCode: 400,
  });
}
