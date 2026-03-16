import { describe, it, expect } from "vitest";
import { BedrockProvider } from "./bedrock.js";
import type { NormalizedRequest, ProviderConfig } from "../pipeline/types.js";

function makeRequest(): NormalizedRequest {
  return {
    model: "anthropic.claude-v2",
    messages: [{ role: "user", content: "Hello", rawContent: "Hello" }],
    stream: false,
    rawBody: null,
  };
}

function makeConfig(): ProviderConfig {
  return {
    apiKey: "test-key",
    baseUrl: "https://bedrock-runtime.us-east-1.amazonaws.com",
    timeoutMs: 30000,
  };
}

describe("BedrockProvider", () => {
  let provider: BedrockProvider;

  beforeEach(() => {
    provider = new BedrockProvider();
  });

  describe("forward()", () => {
    it("throws 'not yet implemented' error", async () => {
      await expect(
        provider.forward(makeRequest(), null, makeConfig()),
      ).rejects.toThrow("Bedrock provider not yet implemented");
    });
  });

  describe("supports()", () => {
    it("returns false for any model", () => {
      expect(provider.supports("anthropic.claude-v2")).toBe(false);
      expect(provider.supports("llama3")).toBe(false);
      expect(provider.supports("claude-sonnet-4-6")).toBe(false);
    });
  });

  describe("estimateCost()", () => {
    it("returns 0 for any input", () => {
      expect(provider.estimateCost(1000, 500, "anthropic.claude-v2")).toBe(0);
      expect(provider.estimateCost(0, 0, "any-model")).toBe(0);
    });
  });
});
