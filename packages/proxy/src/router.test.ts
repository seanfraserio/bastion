import { describe, it, expect } from "vitest";
import { routeToProvider } from "./router.js";
import type { BastionConfig } from "@openbastion-ai/config";

function makeConfig(primary: string = "anthropic"): BastionConfig {
  return {
    version: "1",
    proxy: { port: 3000, host: "127.0.0.1", log_level: "info" },
    providers: {
      primary,
      definitions: {
        [primary]: { base_url: "https://example.com" },
      },
    },
  } as BastionConfig;
}

describe("routeToProvider", () => {
  it("/v1/messages routes to anthropic", () => {
    const result = routeToProvider("/v1/messages", makeConfig("openai"));
    expect(result).toBe("anthropic");
  });

  it("/v1/chat/completions routes to openai", () => {
    const result = routeToProvider("/v1/chat/completions", makeConfig("anthropic"));
    expect(result).toBe("openai");
  });

  it("/v1/messages/ (with trailing slash) routes to anthropic", () => {
    const result = routeToProvider("/v1/messages/", makeConfig("openai"));
    expect(result).toBe("anthropic");
  });

  it("/v1/chat/completions/ (with trailing slash) routes to openai", () => {
    const result = routeToProvider("/v1/chat/completions/", makeConfig("anthropic"));
    expect(result).toBe("openai");
  });

  it("/v1/messages_evil does NOT route to anthropic (falls to default)", () => {
    const config = makeConfig("ollama");
    const result = routeToProvider("/v1/messages_evil", config);
    expect(result).toBe("ollama");
  });

  it("unknown path falls back to config.providers.primary", () => {
    const config = makeConfig("ollama");
    const result = routeToProvider("/some/random/path", config);
    expect(result).toBe("ollama");
  });

  it("root path falls back to config.providers.primary", () => {
    const config = makeConfig("anthropic");
    const result = routeToProvider("/", config);
    expect(result).toBe("anthropic");
  });
});
