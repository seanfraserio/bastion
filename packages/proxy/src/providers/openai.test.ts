import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OpenAIProvider } from "./openai.js";
import type { NormalizedRequest, ProviderConfig } from "../pipeline/types.js";

function makeRequest(overrides?: Partial<NormalizedRequest>): NormalizedRequest {
  return {
    model: "gpt-4o",
    messages: [{ role: "user", content: "Hello", rawContent: "Hello" }],
    stream: false,
    rawBody: null,
    ...overrides,
  };
}

function makeConfig(overrides?: Partial<ProviderConfig>): ProviderConfig {
  return {
    apiKey: "test-api-key",
    baseUrl: "https://api.openai.com",
    timeoutMs: 30000,
    ...overrides,
  };
}

describe("OpenAIProvider", () => {
  let provider: OpenAIProvider;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    provider = new OpenAIProvider();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("supports()", () => {
    it("returns true for gpt models", () => {
      expect(provider.supports("gpt-4o")).toBe(true);
      expect(provider.supports("gpt-4o-mini")).toBe(true);
    });

    it("returns true for o3 models", () => {
      expect(provider.supports("o3-mini")).toBe(true);
    });

    it("returns false for non-openai models", () => {
      expect(provider.supports("claude-sonnet-4-6")).toBe(false);
      expect(provider.supports("llama3")).toBe(false);
    });
  });

  describe("forward()", () => {
    it("sends Bearer auth header", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "chatcmpl-123",
          object: "chat.completion",
          created: 1234567890,
          model: "gpt-4o",
          choices: [{ index: 0, message: { role: "assistant", content: "Hi" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      });

      await provider.forward(makeRequest(), null, makeConfig());

      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = callArgs[1].headers;
      expect(headers["Authorization"]).toBe("Bearer test-api-key");
      expect(headers["Content-Type"]).toBe("application/json");
    });

    it("normalizes choices[0].message.content", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "chatcmpl-123",
          object: "chat.completion",
          created: 1234567890,
          model: "gpt-4o",
          choices: [{ index: 0, message: { role: "assistant", content: "Hello world" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      });

      const response = await provider.forward(makeRequest(), null, makeConfig());

      expect(response.content).toBe("Hello world");
      expect(response.stopReason).toBe("stop");
    });

    it("extracts token counts from usage", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "chatcmpl-123",
          object: "chat.completion",
          created: 1234567890,
          model: "gpt-4o",
          choices: [{ index: 0, message: { role: "assistant", content: "Hi" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 42, completion_tokens: 99, total_tokens: 141 },
        }),
      });

      const response = await provider.forward(makeRequest(), null, makeConfig());

      expect(response.inputTokens).toBe(42);
      expect(response.outputTokens).toBe(99);
    });

    it("throws when apiKey is missing", async () => {
      await expect(
        provider.forward(makeRequest(), null, makeConfig({ apiKey: undefined })),
      ).rejects.toThrow("API key not configured for provider 'openai'");
    });

    it("throws on non-ok response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => "Rate limited",
      });

      await expect(
        provider.forward(makeRequest(), null, makeConfig()),
      ).rejects.toThrow("Provider request failed with status 429");
    });
  });

  describe("estimateCost()", () => {
    it("returns correct cost for known models", () => {
      // gpt-4o: input=5.0, output=15.0 per 1M tokens
      const cost = provider.estimateCost(1000, 500, "gpt-4o");
      const expected = (1000 * 5.0 + 500 * 15.0) / 1_000_000;
      expect(cost).toBeCloseTo(expected);
    });

    it("returns 0 for unknown models", () => {
      const cost = provider.estimateCost(1000, 500, "gpt-unknown");
      expect(cost).toBe(0);
    });
  });
});
