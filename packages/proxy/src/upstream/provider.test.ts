import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { UpstreamProvider, type UpstreamConfig } from "./provider.js";
import type { PipelineContext } from "../pipeline/types.js";

const defaultConfig: UpstreamConfig = {
  url: "https://cloud.bastion.dev",
  proxy_key: "test-proxy-key",
  timeout_ms: 30_000,
  forward_agent_headers: true,
};

function makeCtx(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    id: "test-id",
    requestId: "req-123",
    agentName: "test-agent",
    teamName: "test-team",
    environment: "production",
    provider: "anthropic",
    model: "claude-haiku-4-5-20251001",
    startTime: Date.now(),
    request: {
      model: "claude-haiku-4-5-20251001",
      messages: [{ role: "user", content: "Hello", rawContent: "Hello" }],
      stream: false,
      rawBody: {
        model: "claude-haiku-4-5-20251001",
        messages: [{ role: "user", content: "Hello" }],
      },
    },
    decisions: [],
    cacheHit: false,
    fallbackUsed: false,
    metadata: {},
    ...overrides,
  };
}

describe("UpstreamProvider", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("forward()", () => {
    it("constructs correct upstream URL for anthropic", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [{ type: "text", text: "Hi" }],
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
          { status: 200 },
        ),
      );

      const provider = new UpstreamProvider(defaultConfig);
      await provider.forward(makeCtx());

      expect(fetchSpy).toHaveBeenCalledOnce();
      const [url] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://cloud.bastion.dev/v1/messages");
    });

    it("constructs correct upstream URL for openai", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: "Hi" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 10, completion_tokens: 5 },
          }),
          { status: 200 },
        ),
      );

      const provider = new UpstreamProvider(defaultConfig);
      await provider.forward(makeCtx({ provider: "openai" }));

      const [url] = fetchSpy.mock.calls[0];
      expect(url).toBe("https://cloud.bastion.dev/v1/chat/completions");
    });

    it("sets proxy_key as Authorization Bearer", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [{ type: "text", text: "Hi" }],
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
          { status: 200 },
        ),
      );

      const provider = new UpstreamProvider(defaultConfig);
      await provider.forward(makeCtx());

      const [, opts] = fetchSpy.mock.calls[0];
      expect(opts.headers["Authorization"]).toBe("Bearer test-proxy-key");
    });

    it("forwards agent headers when forward_agent_headers is true", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [{ type: "text", text: "Hi" }],
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
          { status: 200 },
        ),
      );

      const provider = new UpstreamProvider(defaultConfig);
      await provider.forward(makeCtx());

      const [, opts] = fetchSpy.mock.calls[0];
      expect(opts.headers["X-Bastion-Agent"]).toBe("test-agent");
      expect(opts.headers["X-Bastion-Team"]).toBe("test-team");
      expect(opts.headers["X-Bastion-Env"]).toBe("production");
    });

    it("omits agent headers when forward_agent_headers is false", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [{ type: "text", text: "Hi" }],
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
          { status: 200 },
        ),
      );

      const provider = new UpstreamProvider({
        ...defaultConfig,
        forward_agent_headers: false,
      });
      await provider.forward(makeCtx());

      const [, opts] = fetchSpy.mock.calls[0];
      expect(opts.headers["X-Bastion-Agent"]).toBeUndefined();
      expect(opts.headers["X-Bastion-Team"]).toBeUndefined();
      expect(opts.headers["X-Bastion-Env"]).toBeUndefined();
    });

    it("forwards raw body verbatim", async () => {
      const rawBody = {
        model: "claude-haiku-4-5-20251001",
        messages: [{ role: "user", content: "Hello" }],
        max_tokens: 100,
      };

      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [{ type: "text", text: "Hi" }],
            usage: { input_tokens: 10, output_tokens: 5 },
          }),
          { status: 200 },
        ),
      );

      const provider = new UpstreamProvider(defaultConfig);
      await provider.forward(
        makeCtx({ request: { model: "claude-haiku-4-5-20251001", messages: [], stream: false, rawBody } }),
      );

      const [, opts] = fetchSpy.mock.calls[0];
      expect(JSON.parse(opts.body)).toEqual(rawBody);
    });

    it("returns NormalizedResponse with correct shape (Anthropic format)", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            content: [
              { type: "text", text: "Hello " },
              { type: "text", text: "world" },
            ],
            stop_reason: "end_turn",
            usage: { input_tokens: 15, output_tokens: 8 },
          }),
          { status: 200 },
        ),
      );

      const provider = new UpstreamProvider(defaultConfig);
      const ctx = makeCtx();
      const result = await provider.forward(ctx);

      expect(result.content).toBe("Hello world");
      expect(result.stopReason).toBe("end_turn");
      expect(result.inputTokens).toBe(15);
      expect(result.outputTokens).toBe(8);
      expect(result.rawBody).toBeDefined();
      // Also check that ctx tokens were set
      expect(ctx.inputTokens).toBe(15);
      expect(ctx.outputTokens).toBe(8);
    });

    it("parses OpenAI-style response format", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              { message: { content: "OpenAI response" }, finish_reason: "stop" },
            ],
            usage: { prompt_tokens: 20, completion_tokens: 12 },
          }),
          { status: 200 },
        ),
      );

      const provider = new UpstreamProvider(defaultConfig);
      const result = await provider.forward(makeCtx({ provider: "openai" }));

      expect(result.content).toBe("OpenAI response");
      expect(result.stopReason).toBe("stop");
      expect(result.inputTokens).toBe(20);
      expect(result.outputTokens).toBe(12);
    });

    it("propagates upstream HTTP errors (429 → statusCode 429)", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: { message: "rate limited" } }),
          { status: 429 },
        ),
      );

      const provider = new UpstreamProvider(defaultConfig);
      try {
        await provider.forward(makeCtx());
        expect.unreachable("should have thrown");
      } catch (e: any) {
        expect(e.statusCode).toBe(429);
        expect(e.body.error.message).toBe("rate limited");
      }
    });

    it("returns 502 on network error", async () => {
      fetchSpy.mockRejectedValueOnce(new TypeError("fetch failed"));

      const provider = new UpstreamProvider(defaultConfig);
      try {
        await provider.forward(makeCtx());
        expect.unreachable("should have thrown");
      } catch (e: any) {
        expect(e.statusCode).toBe(502);
        expect(e.body.error).toBe("upstream_unavailable");
      }
    });

    it("returns 504 on timeout (AbortError)", async () => {
      const abortError = new DOMException("The operation was aborted", "AbortError");
      fetchSpy.mockRejectedValueOnce(abortError);

      const provider = new UpstreamProvider(defaultConfig);
      try {
        await provider.forward(makeCtx());
        expect.unreachable("should have thrown");
      } catch (e: any) {
        expect(e.statusCode).toBe(504);
        expect(e.body.error).toBe("gateway_timeout");
      }
    });

    it("throws 400 for unsupported provider", async () => {
      const provider = new UpstreamProvider(defaultConfig);
      try {
        await provider.forward(makeCtx({ provider: "ollama" }));
        expect.unreachable("should have thrown");
      } catch (e: any) {
        expect(e.statusCode).toBe(400);
      }
    });
  });

  describe("forwardStream()", () => {
    it("returns StreamingResponse with body from upstream", async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("data: hello\n\n"));
          controller.close();
        },
      });

      fetchSpy.mockResolvedValueOnce(
        new Response(stream, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      );

      const provider = new UpstreamProvider(defaultConfig);
      const ctx = makeCtx();
      const result = await provider.forwardStream(ctx.request, ctx.request.rawBody, ctx);

      expect(result.body).toBeInstanceOf(ReadableStream);
      expect(result.contentType).toBe("text/event-stream");
    });

    it("throws 502 when upstream returns no body", async () => {
      // Construct a Response that has a null body
      const response = new Response(null, { status: 200 });
      // Override body to be null (Response(null) may still have a body in some runtimes)
      Object.defineProperty(response, "body", { value: null });
      fetchSpy.mockResolvedValueOnce(response);

      const provider = new UpstreamProvider(defaultConfig);
      const ctx = makeCtx();
      try {
        await provider.forwardStream(ctx.request, ctx.request.rawBody, ctx);
        expect.unreachable("should have thrown");
      } catch (e: any) {
        expect(e.statusCode).toBe(502);
      }
    });

    it("propagates upstream HTTP errors", async () => {
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({ error: "server_error" }),
          { status: 500 },
        ),
      );

      const provider = new UpstreamProvider(defaultConfig);
      const ctx = makeCtx();
      try {
        await provider.forwardStream(ctx.request, ctx.request.rawBody, ctx);
        expect.unreachable("should have thrown");
      } catch (e: any) {
        expect(e.statusCode).toBe(500);
      }
    });

    it("returns 502 on network error", async () => {
      fetchSpy.mockRejectedValueOnce(new TypeError("fetch failed"));

      const provider = new UpstreamProvider(defaultConfig);
      const ctx = makeCtx();
      try {
        await provider.forwardStream(ctx.request, ctx.request.rawBody, ctx);
        expect.unreachable("should have thrown");
      } catch (e: any) {
        expect(e.statusCode).toBe(502);
        expect(e.body.error).toBe("upstream_unavailable");
      }
    });
  });
});
