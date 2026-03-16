import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AuditMiddleware } from "./audit.js";
import { makeMockContext } from "../__tests__/helpers/mock-context.js";
import type { BastionConfig } from "@openbastion-ai/config";
import * as fs from "node:fs";

function makeConfig(overrides?: Partial<BastionConfig>): BastionConfig {
  return {
    version: "1",
    proxy: { port: 3000, host: "127.0.0.1", log_level: "info" },
    providers: {
      primary: "anthropic",
      definitions: {
        anthropic: { base_url: "https://api.anthropic.com" },
      },
    },
    audit: {
      enabled: true,
      output: "stdout",
      include_request_body: false,
      include_response_body: false,
    },
    ...overrides,
  } as BastionConfig;
}

describe("AuditMiddleware", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("stdout output", () => {
    it("calls console.log with JSON", async () => {
      const config = makeConfig({ audit: { enabled: true, output: "stdout", include_request_body: false, include_response_body: false } });
      const mw = new AuditMiddleware(config);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const ctx = makeMockContext({
        response: {
          content: "Hi",
          stopReason: "end_turn",
          inputTokens: 10,
          outputTokens: 5,
          rawBody: {},
        },
      });

      const result = await mw.process(ctx);

      expect(result.action).toBe("continue");
      expect(logSpy).toHaveBeenCalledOnce();

      const loggedJson = JSON.parse(logSpy.mock.calls[0][0]);
      expect(loggedJson.id).toBe("test-id");
      expect(loggedJson.provider).toBe("anthropic");
      expect(loggedJson.model).toBe("claude-sonnet-4-6");
      expect(loggedJson.status).toBe("success");
    });
  });

  describe("file output", () => {
    it("calls fs.promises.appendFile with JSONL", async () => {
      const config = makeConfig({
        audit: {
          enabled: true,
          output: "file",
          file_path: "/tmp/bastion-test-audit.jsonl",
          include_request_body: false,
          include_response_body: false,
        },
      });
      const mw = new AuditMiddleware(config);

      const mkdirSpy = vi.spyOn(fs.promises, "mkdir").mockResolvedValue(undefined);
      const appendSpy = vi.spyOn(fs.promises, "appendFile").mockResolvedValue();

      const ctx = makeMockContext({
        response: {
          content: "Hi",
          stopReason: "end_turn",
          inputTokens: 10,
          outputTokens: 5,
          rawBody: {},
        },
      });

      const result = await mw.process(ctx);

      expect(result.action).toBe("continue");
      expect(appendSpy).toHaveBeenCalledOnce();

      const writtenPath = appendSpy.mock.calls[0][0];
      expect(String(writtenPath)).toContain("bastion-test-audit.jsonl");

      const writtenData = appendSpy.mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenData.trim());
      expect(parsed.id).toBe("test-id");
    });
  });

  describe("AuditEntry fields", () => {
    it("contains all required fields", async () => {
      const config = makeConfig({ audit: { enabled: true, output: "stdout", include_request_body: false, include_response_body: false } });
      const mw = new AuditMiddleware(config);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const ctx = makeMockContext({
        inputTokens: 42,
        outputTokens: 99,
        estimatedCostUsd: 0.001,
        response: {
          content: "Hi",
          stopReason: "end_turn",
          inputTokens: 42,
          outputTokens: 99,
          rawBody: {},
        },
      });

      await mw.process(ctx);

      const entry = JSON.parse(logSpy.mock.calls[0][0]);
      expect(entry).toHaveProperty("id");
      expect(entry).toHaveProperty("timestamp");
      expect(entry).toHaveProperty("environment");
      expect(entry).toHaveProperty("provider");
      expect(entry).toHaveProperty("model");
      expect(entry).toHaveProperty("cacheHit");
      expect(entry).toHaveProperty("fallbackUsed");
      expect(entry).toHaveProperty("inputTokens", 42);
      expect(entry).toHaveProperty("outputTokens", 99);
      expect(entry).toHaveProperty("estimatedCostUsd", 0.001);
      expect(entry).toHaveProperty("policies");
      expect(entry).toHaveProperty("durationMs");
      expect(entry).toHaveProperty("status");
      expect(entry).toHaveProperty("requestId");
    });
  });

  describe("include_request_body flag", () => {
    it("includes rawBody when enabled", async () => {
      const config = makeConfig({ audit: { enabled: true, output: "stdout", include_request_body: true, include_response_body: false } });
      const mw = new AuditMiddleware(config);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const ctx = makeMockContext({
        request: {
          model: "claude-sonnet-4-6",
          messages: [{ role: "user", content: "Hello", rawContent: "Hello" }],
          stream: false,
          rawBody: { model: "claude-sonnet-4-6", messages: [{ role: "user", content: "Hello" }] },
        },
        response: {
          content: "Hi",
          stopReason: "end_turn",
          inputTokens: 10,
          outputTokens: 5,
          rawBody: {},
        },
      });

      await mw.process(ctx);

      const entry = JSON.parse(logSpy.mock.calls[0][0]);
      expect(entry.requestBody).toBeDefined();
      expect(entry.requestBody.model).toBe("claude-sonnet-4-6");
    });

    it("omits requestBody when disabled", async () => {
      const config = makeConfig({ audit: { enabled: true, output: "stdout", include_request_body: false, include_response_body: false } });
      const mw = new AuditMiddleware(config);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const ctx = makeMockContext({
        response: {
          content: "Hi",
          stopReason: "end_turn",
          inputTokens: 10,
          outputTokens: 5,
          rawBody: {},
        },
      });

      await mw.process(ctx);

      const entry = JSON.parse(logSpy.mock.calls[0][0]);
      expect(entry.requestBody).toBeUndefined();
    });
  });

  describe("include_response_body flag", () => {
    it("includes rawBody when enabled", async () => {
      const config = makeConfig({ audit: { enabled: true, output: "stdout", include_request_body: false, include_response_body: true } });
      const mw = new AuditMiddleware(config);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const ctx = makeMockContext({
        response: {
          content: "Hi",
          stopReason: "end_turn",
          inputTokens: 10,
          outputTokens: 5,
          rawBody: { id: "resp-1", content: "Hi" },
        },
      });

      await mw.process(ctx);

      const entry = JSON.parse(logSpy.mock.calls[0][0]);
      expect(entry.responseBody).toBeDefined();
      expect(entry.responseBody.id).toBe("resp-1");
    });

    it("omits responseBody when disabled", async () => {
      const config = makeConfig({ audit: { enabled: true, output: "stdout", include_request_body: false, include_response_body: false } });
      const mw = new AuditMiddleware(config);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const ctx = makeMockContext({
        response: {
          content: "Hi",
          stopReason: "end_turn",
          inputTokens: 10,
          outputTokens: 5,
          rawBody: { id: "resp-1" },
        },
      });

      await mw.process(ctx);

      const entry = JSON.parse(logSpy.mock.calls[0][0]);
      expect(entry.responseBody).toBeUndefined();
    });
  });

  describe("Lantern integration", () => {
    it("POSTs to lantern endpoint when enabled", async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = fetchSpy;

      const config = makeConfig({
        audit: { enabled: true, output: "stdout", include_request_body: false, include_response_body: false },
        lantern: { enabled: true, endpoint: "https://lantern.example.com/spans" },
      });
      const mw = new AuditMiddleware(config);
      vi.spyOn(console, "log").mockImplementation(() => {});

      const ctx = makeMockContext({
        response: {
          content: "Hi",
          stopReason: "end_turn",
          inputTokens: 10,
          outputTokens: 5,
          rawBody: {},
        },
      });

      await mw.process(ctx);

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url, options] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://lantern.example.com/spans");
      expect(options.method).toBe("POST");
      expect(options.headers["Content-Type"]).toBe("application/json");
    });

    it("includes Authorization header when api_key is set", async () => {
      const fetchSpy = vi.fn().mockResolvedValue({ ok: true });
      globalThis.fetch = fetchSpy;

      const config = makeConfig({
        audit: { enabled: true, output: "stdout", include_request_body: false, include_response_body: false },
        lantern: { enabled: true, endpoint: "https://lantern.example.com/spans", api_key: "lantern-secret" },
      });
      const mw = new AuditMiddleware(config);
      vi.spyOn(console, "log").mockImplementation(() => {});

      const ctx = makeMockContext({
        response: {
          content: "Hi",
          stopReason: "end_turn",
          inputTokens: 10,
          outputTokens: 5,
          rawBody: {},
        },
      });

      await mw.process(ctx);

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [, options] = fetchSpy.mock.calls[0];
      expect(options.headers["Authorization"]).toBe("Bearer lantern-secret");
    });
  });

  describe("status determination", () => {
    it("sets status to 'blocked' when a block decision exists", async () => {
      const config = makeConfig({ audit: { enabled: true, output: "stdout", include_request_body: false, include_response_body: false } });
      const mw = new AuditMiddleware(config);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      const ctx = makeMockContext({
        decisions: [
          { policyName: "test-policy", matched: true, action: "block", reason: "blocked", timestamp: Date.now() },
        ],
        response: {
          content: "Hi",
          stopReason: "end_turn",
          inputTokens: 10,
          outputTokens: 5,
          rawBody: {},
        },
      });

      await mw.process(ctx);

      const entry = JSON.parse(logSpy.mock.calls[0][0]);
      expect(entry.status).toBe("blocked");
    });
  });
});
