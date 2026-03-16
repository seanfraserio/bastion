import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AnthropicProvider } from "./anthropic.js";
import type { NormalizedRequest, ProviderConfig } from "../pipeline/types.js";

function makeRequest(overrides?: Partial<NormalizedRequest>): NormalizedRequest {
  return {
    model: "claude-sonnet-4-6",
    messages: [{ role: "user", content: "Hello", rawContent: "Hello" }],
    stream: false,
    rawBody: null,
    ...overrides,
  };
}

function makeConfig(overrides?: Partial<ProviderConfig>): ProviderConfig {
  return {
    apiKey: "test-api-key",
    baseUrl: "https://api.anthropic.com",
    timeoutMs: 30000,
    ...overrides,
  };
}

describe("AnthropicProvider", () => {
  let provider: AnthropicProvider;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    provider = new AnthropicProvider();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("supports()", () => {
    it("returns true for claude models", () => {
      expect(provider.supports("claude-sonnet-4-6")).toBe(true);
      expect(provider.supports("claude-opus-4-6")).toBe(true);
      expect(provider.supports("claude-haiku-4-5-20251001")).toBe(true);
    });

    it("returns false for non-claude models", () => {
      expect(provider.supports("gpt-4o")).toBe(false);
      expect(provider.supports("o3-mini")).toBe(false);
      expect(provider.supports("llama3")).toBe(false);
    });
  });

  describe("forward()", () => {
    it("sends correct headers (x-api-key, anthropic-version)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "msg_123",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "Hi" }],
          model: "claude-sonnet-4-6",
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      await provider.forward(makeRequest(), null, makeConfig());

      expect(globalThis.fetch).toHaveBeenCalledOnce();
      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = callArgs[1].headers;
      expect(headers["x-api-key"]).toBe("test-api-key");
      expect(headers["anthropic-version"]).toBe("2023-06-01");
      expect(headers["content-type"]).toBe("application/json");
    });

    it("normalizes response correctly (content[].text to string)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "msg_123",
          type: "message",
          role: "assistant",
          content: [
            { type: "text", text: "Hello " },
            { type: "text", text: "world" },
          ],
          model: "claude-sonnet-4-6",
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 5 },
        }),
      });

      const response = await provider.forward(makeRequest(), null, makeConfig());

      expect(response.content).toBe("Hello world");
      expect(response.stopReason).toBe("end_turn");
    });

    it("extracts token counts from usage", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "msg_123",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "Hi" }],
          model: "claude-sonnet-4-6",
          stop_reason: "end_turn",
          usage: { input_tokens: 42, output_tokens: 99 },
        }),
      });

      const response = await provider.forward(makeRequest(), null, makeConfig());

      expect(response.inputTokens).toBe(42);
      expect(response.outputTokens).toBe(99);
    });

    it("throws when apiKey is missing", async () => {
      await expect(
        provider.forward(makeRequest(), null, makeConfig({ apiKey: undefined })),
      ).rejects.toThrow("API key not configured for provider 'anthropic'");
    });

    it("throws on non-ok response", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
      });

      await expect(
        provider.forward(makeRequest(), null, makeConfig()),
      ).rejects.toThrow("Anthropic API error (401): Unauthorized");
    });
  });

  describe("estimateCost()", () => {
    it("returns correct cost for known models", () => {
      // claude-sonnet-4-6: input=3.0, output=15.0 per 1M tokens
      const cost = provider.estimateCost(1000, 500, "claude-sonnet-4-6");
      const expected = (1000 * 3.0 + 500 * 15.0) / 1_000_000;
      expect(cost).toBeCloseTo(expected);
    });

    it("returns 0 for unknown models", () => {
      const cost = provider.estimateCost(1000, 500, "claude-unknown-model");
      expect(cost).toBe(0);
    });
  });
});
