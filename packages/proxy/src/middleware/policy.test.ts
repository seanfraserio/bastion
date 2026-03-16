import { describe, it, expect } from "vitest";
import { PolicyMiddleware } from "./policy.js";
import type { PipelineContext } from "../pipeline/types.js";
import type { BastionConfig, Policy } from "@bastion-ai/config";

function makeMockContext(
  overrides: Partial<PipelineContext> = {},
): PipelineContext {
  return {
    id: "test-id",
    requestId: "req-1",
    environment: "test",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    startTime: Date.now(),
    request: {
      model: "claude-sonnet-4-6",
      messages: [
        { role: "user", content: "Hello world", rawContent: "Hello world" },
      ],
      stream: false,
      rawBody: {},
    },
    decisions: [],
    cacheHit: false,
    fallbackUsed: false,
    metadata: {},
    ...overrides,
  };
}

function makeMockConfig(policies: Policy[]): BastionConfig {
  return {
    version: "1",
    proxy: { port: 3000, host: "127.0.0.1", log_level: "info" },
    providers: {
      primary: "anthropic",
      definitions: {
        anthropic: { base_url: "https://api.anthropic.com" },
      },
    },
    policies,
  } as BastionConfig;
}

describe("PolicyMiddleware", () => {
  it("contains condition matches (case-insensitive)", async () => {
    const config = makeMockConfig([
      {
        name: "no-hello",
        on: "request",
        action: "warn",
        condition: {
          type: "contains",
          field: "prompt",
          value: "hello",
          case_sensitive: false,
        },
      },
    ]);

    const mw = new PolicyMiddleware(config);
    const ctx = makeMockContext({
      request: {
        model: "claude-sonnet-4-6",
        messages: [
          { role: "user", content: "Hello World", rawContent: "Hello World" },
        ],
        stream: false,
        rawBody: {},
      },
    });

    const result = await mw.process(ctx);
    expect(result.action).toBe("continue");
    expect(ctx.decisions).toHaveLength(1);
    expect(ctx.decisions[0].matched).toBe(true);
    expect(ctx.decisions[0].action).toBe("warn");
  });

  it("regex condition matches", async () => {
    const config = makeMockConfig([
      {
        name: "no-email",
        on: "request",
        action: "warn",
        condition: {
          type: "regex",
          field: "prompt",
          value: "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
          case_sensitive: true,
        },
      },
    ]);

    const mw = new PolicyMiddleware(config);
    const ctx = makeMockContext({
      request: {
        model: "claude-sonnet-4-6",
        messages: [
          {
            role: "user",
            content: "Contact me at user@example.com",
            rawContent: "Contact me at user@example.com",
          },
        ],
        stream: false,
        rawBody: {},
      },
    });

    const result = await mw.process(ctx);
    expect(result.action).toBe("continue");
    expect(ctx.decisions[0].matched).toBe(true);
  });

  it("length_exceeds triggers on long response", async () => {
    const config = makeMockConfig([
      {
        name: "max-response-length",
        on: "response",
        action: "warn",
        condition: {
          type: "length_exceeds",
          field: "response",
          value: 10,
        },
      },
    ]);

    const mw = new PolicyMiddleware(config);
    const ctx = makeMockContext({
      response: {
        content: "This is a very long response that exceeds 10 characters",
        stopReason: "end_turn",
        inputTokens: 5,
        outputTokens: 15,
        rawBody: {},
      },
    });

    const result = await mw.process(ctx);
    expect(result.action).toBe("continue");
    expect(ctx.decisions[0].matched).toBe(true);
    expect(ctx.decisions[0].action).toBe("warn");
  });

  it("non-matching condition returns matched: false", async () => {
    const config = makeMockConfig([
      {
        name: "no-password",
        on: "request",
        action: "block",
        condition: {
          type: "contains",
          field: "prompt",
          value: "password123",
          case_sensitive: true,
        },
      },
    ]);

    const mw = new PolicyMiddleware(config);
    const ctx = makeMockContext();

    const result = await mw.process(ctx);
    expect(result.action).toBe("continue");
    expect(ctx.decisions).toHaveLength(1);
    expect(ctx.decisions[0].matched).toBe(false);
    expect(ctx.decisions[0].action).toBeUndefined();
  });

  it("block action propagates as block result", async () => {
    const config = makeMockConfig([
      {
        name: "block-secret",
        on: "request",
        action: "block",
        condition: {
          type: "contains",
          field: "prompt",
          value: "SECRET_KEY",
          case_sensitive: true,
        },
      },
    ]);

    const mw = new PolicyMiddleware(config);
    const ctx = makeMockContext({
      request: {
        model: "claude-sonnet-4-6",
        messages: [
          {
            role: "user",
            content: "My SECRET_KEY is abc123",
            rawContent: "My SECRET_KEY is abc123",
          },
        ],
        stream: false,
        rawBody: {},
      },
    });

    const result = await mw.process(ctx);
    expect(result.action).toBe("block");
    if (result.action === "block") {
      expect(result.statusCode).toBe(403);
      expect(result.reason).toContain("block-secret");
    }
  });

  it("injection_score condition evaluates ctx.metadata", async () => {
    const config = makeMockConfig([
      {
        name: "injection-block",
        on: "request",
        action: "block",
        condition: {
          type: "injection_score",
          threshold: 0.5,
        },
      },
    ]);

    const mw = new PolicyMiddleware(config);
    const ctx = makeMockContext({
      metadata: { injectionScore: 0.8 },
    });

    const result = await mw.process(ctx);
    expect(result.action).toBe("block");
    if (result.action === "block") {
      expect(result.statusCode).toBe(403);
    }
  });
});
