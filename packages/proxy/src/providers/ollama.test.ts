import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { OllamaProvider } from "./ollama.js";
import type { NormalizedRequest, ProviderConfig } from "../pipeline/types.js";

function makeRequest(overrides?: Partial<NormalizedRequest>): NormalizedRequest {
  return {
    model: "llama3",
    messages: [{ role: "user", content: "Hello", rawContent: "Hello" }],
    stream: false,
    rawBody: null,
    ...overrides,
  };
}

function makeConfig(overrides?: Partial<ProviderConfig>): ProviderConfig {
  return {
    baseUrl: "http://localhost:11434",
    timeoutMs: 30000,
    ...overrides,
  };
}

describe("OllamaProvider", () => {
  let provider: OllamaProvider;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    provider = new OllamaProvider();
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("supports()", () => {
    it("returns true for any model", () => {
      expect(provider.supports("llama3")).toBe(true);
      expect(provider.supports("mistral")).toBe(true);
      expect(provider.supports("claude-sonnet-4-6")).toBe(true);
      expect(provider.supports("anything")).toBe(true);
    });
  });

  describe("forward()", () => {
    it("sends to /api/chat", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          model: "llama3",
          created_at: "2024-01-01T00:00:00Z",
          message: { role: "assistant", content: "Hi there" },
          done: true,
          prompt_eval_count: 10,
          eval_count: 20,
        }),
      });

      await provider.forward(makeRequest(), null, makeConfig());

      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(callArgs[0]).toBe("http://localhost:11434/api/chat");
    });

    it("does not send auth headers", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          model: "llama3",
          created_at: "2024-01-01T00:00:00Z",
          message: { role: "assistant", content: "Hi" },
          done: true,
          prompt_eval_count: 10,
          eval_count: 5,
        }),
      });

      await provider.forward(makeRequest(), null, makeConfig());

      const callArgs = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
      const headers = callArgs[1].headers;
      expect(headers["Authorization"]).toBeUndefined();
      expect(headers["x-api-key"]).toBeUndefined();
    });

    it("normalizes response content", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          model: "llama3",
          created_at: "2024-01-01T00:00:00Z",
          message: { role: "assistant", content: "Hello world" },
          done: true,
          prompt_eval_count: 10,
          eval_count: 20,
        }),
      });

      const response = await provider.forward(makeRequest(), null, makeConfig());

      expect(response.content).toBe("Hello world");
      expect(response.inputTokens).toBe(10);
      expect(response.outputTokens).toBe(20);
    });

    it("handles missing eval counts gracefully", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          model: "llama3",
          created_at: "2024-01-01T00:00:00Z",
          message: { role: "assistant", content: "Hi" },
          done: true,
        }),
      });

      const response = await provider.forward(makeRequest(), null, makeConfig());

      expect(response.inputTokens).toBe(0);
      expect(response.outputTokens).toBe(0);
    });
  });

  describe("estimateCost()", () => {
    it("always returns 0", () => {
      expect(provider.estimateCost(1000, 500, "llama3")).toBe(0);
      expect(provider.estimateCost(999999, 999999, "mistral")).toBe(0);
    });
  });
});
