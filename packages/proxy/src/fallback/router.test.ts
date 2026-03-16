import { describe, it, expect, vi, beforeEach } from "vitest";
import { createProviderRouter, ProviderError } from "./router.js";
import type { BastionConfig } from "@openbastion-ai/config";
import { makeMockContext } from "../__tests__/helpers/mock-context.js";

function makeConfig(overrides?: Partial<BastionConfig["providers"]>): BastionConfig {
  return {
    version: "1",
    proxy: { port: 3000, host: "127.0.0.1", log_level: "info" },
    providers: {
      primary: "anthropic",
      definitions: {
        anthropic: { api_key: "test-key", base_url: "https://api.anthropic.com", timeout_ms: 5000 },
        openai: { api_key: "test-key", base_url: "https://api.openai.com", timeout_ms: 5000 },
      },
      ...overrides,
    },
  } as BastionConfig;
}

describe("ProviderRouter (fallback/router)", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns response from primary on success, no fallback", async () => {
    const config = makeConfig({ fallback: "openai" });
    const router = createProviderRouter(config);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: "msg_123",
        type: "message",
        role: "assistant",
        content: [{ type: "text", text: "Primary response" }],
        model: "claude-sonnet-4-6",
        stop_reason: "end_turn",
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    });

    const ctx = makeMockContext({ provider: "anthropic" });
    const response = await router.forward(ctx);

    expect(response.content).toBe("Primary response");
    expect(ctx.fallbackUsed).toBe(false);
    // Only one fetch call (primary)
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it("tries fallback on 429 status from primary", async () => {
    const config = makeConfig({ fallback: "openai" });
    const router = createProviderRouter(config);

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
      callCount++;
      if (callCount === 1) {
        // Primary fails with 429
        return {
          ok: false,
          status: 429,
          text: async () => "Rate limited",
        };
      }
      // Fallback succeeds (OpenAI format)
      return {
        ok: true,
        json: async () => ({
          id: "chatcmpl-123",
          object: "chat.completion",
          created: 1234567890,
          model: "gpt-4o",
          choices: [{ index: 0, message: { role: "assistant", content: "Fallback response" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      };
    });

    const ctx = makeMockContext({ provider: "anthropic" });
    // Suppress expected console.warn
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const response = await router.forward(ctx);

    expect(response.content).toBe("Fallback response");
    expect(ctx.fallbackUsed).toBe(true);
  });

  it("tries fallback on 500 status from primary", async () => {
    const config = makeConfig({ fallback: "openai" });
    const router = createProviderRouter(config);

    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      if (callCount === 1) {
        return {
          ok: false,
          status: 500,
          text: async () => "Internal Server Error",
        };
      }
      return {
        ok: true,
        json: async () => ({
          id: "chatcmpl-123",
          object: "chat.completion",
          created: 1234567890,
          model: "gpt-4o",
          choices: [{ index: 0, message: { role: "assistant", content: "Fallback response" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      };
    });

    vi.spyOn(console, "warn").mockImplementation(() => {});

    const ctx = makeMockContext({ provider: "anthropic" });
    const response = await router.forward(ctx);

    expect(response.content).toBe("Fallback response");
    expect(ctx.fallbackUsed).toBe(true);
  });

  it("does not fallback on 400 client error", async () => {
    const config = makeConfig({ fallback: "openai" });
    const router = createProviderRouter(config);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => "Bad Request",
    });

    vi.spyOn(console, "error").mockImplementation(() => {});

    const ctx = makeMockContext({ provider: "anthropic" });

    await expect(router.forward(ctx)).rejects.toThrow(ProviderError);
    // Only primary called, no fallback
    expect(globalThis.fetch).toHaveBeenCalledOnce();
  });

  it("rethrows when no fallback configured", async () => {
    const config = makeConfig(); // no fallback
    const router = createProviderRouter(config);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Server Error",
    });

    vi.spyOn(console, "error").mockImplementation(() => {});

    const ctx = makeMockContext({ provider: "anthropic" });

    await expect(router.forward(ctx)).rejects.toThrow(ProviderError);
  });

  it("throws ProviderError when both primary and fallback fail", async () => {
    const config = makeConfig({ fallback: "openai" });
    const router = createProviderRouter(config);

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Server Error",
    });

    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});

    const ctx = makeMockContext({ provider: "anthropic" });

    await expect(router.forward(ctx)).rejects.toThrow(ProviderError);
    await expect(router.forward(makeMockContext({ provider: "anthropic" }))).rejects.toThrow(
      "Provider request failed",
    );
  });
});
