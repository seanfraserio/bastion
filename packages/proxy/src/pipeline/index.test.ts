import { describe, it, expect, vi } from "vitest";
import { Pipeline, PipelineBlockedError } from "./index.js";
import type {
  PipelineContext,
  PipelineMiddleware,
  PipelineMiddlewareResult,
  NormalizedResponse,
} from "./types.js";

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
        { role: "user", content: "Hello", rawContent: "Hello" },
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

function makeMockResponse(): NormalizedResponse {
  return {
    content: "Test response",
    stopReason: "end_turn",
    inputTokens: 10,
    outputTokens: 5,
    rawBody: { id: "resp-1" },
  };
}

function createPassthroughMiddleware(
  name: string,
  phase: PipelineMiddleware["phase"],
  callback?: (ctx: PipelineContext) => void,
): PipelineMiddleware {
  return {
    name,
    phase,
    async process(ctx: PipelineContext): Promise<PipelineMiddlewareResult> {
      callback?.(ctx);
      return { action: "continue", ctx };
    },
  };
}

describe("Pipeline", () => {
  it("runs all request middlewares in order", async () => {
    const order: string[] = [];
    const forwardFn = vi.fn(async () => makeMockResponse());

    const pipeline = new Pipeline(forwardFn);

    pipeline.use(
      createPassthroughMiddleware("first", "request", () => order.push("first")),
    );
    pipeline.use(
      createPassthroughMiddleware("second", "request", () => order.push("second")),
    );
    pipeline.use(
      createPassthroughMiddleware("third", "request", () => order.push("third")),
    );

    const ctx = makeMockContext();
    await pipeline.run(ctx);

    expect(order).toEqual(["first", "second", "third"]);
    expect(forwardFn).toHaveBeenCalledOnce();
  });

  it("short-circuits on cache hit", async () => {
    const cachedResponse = makeMockResponse();
    cachedResponse.content = "Cached response";

    const forwardFn = vi.fn(async () => makeMockResponse());

    const cacheMiddleware: PipelineMiddleware = {
      name: "cache",
      phase: "both",
      async process(ctx: PipelineContext): Promise<PipelineMiddlewareResult> {
        if (!ctx.response) {
          // Request phase: return cached response
          return { action: "short-circuit", response: cachedResponse };
        }
        return { action: "continue", ctx };
      },
    };

    const pipeline = new Pipeline(forwardFn);
    pipeline.use(cacheMiddleware);

    const ctx = makeMockContext();
    const result = await pipeline.run(ctx);

    // Provider should NOT have been called
    expect(forwardFn).not.toHaveBeenCalled();
    // Response should be the cached one
    expect(result.response?.content).toBe("Cached response");
  });

  it("throws PipelineBlockedError on block", async () => {
    const blockMiddleware: PipelineMiddleware = {
      name: "blocker",
      phase: "request",
      async process(): Promise<PipelineMiddlewareResult> {
        return {
          action: "block",
          reason: "Content policy violation",
          statusCode: 403,
        };
      },
    };

    const forwardFn = vi.fn(async () => makeMockResponse());
    const pipeline = new Pipeline(forwardFn);
    pipeline.use(blockMiddleware);

    const ctx = makeMockContext();

    await expect(pipeline.run(ctx)).rejects.toThrow(PipelineBlockedError);
    await expect(pipeline.run(makeMockContext())).rejects.toThrow(
      "Pipeline blocked: Content policy violation",
    );
    expect(forwardFn).not.toHaveBeenCalled();
  });

  it("populates ctx.response after provider call", async () => {
    const mockResponse = makeMockResponse();
    const forwardFn = vi.fn(async () => mockResponse);

    const pipeline = new Pipeline(forwardFn);

    const ctx = makeMockContext();
    const result = await pipeline.run(ctx);

    expect(result.response).toBeDefined();
    expect(result.response?.content).toBe("Test response");
    expect(result.response?.inputTokens).toBe(10);
    expect(result.response?.outputTokens).toBe(5);
  });

  it("runs response-phase middlewares after provider call", async () => {
    const order: string[] = [];
    const forwardFn = vi.fn(async () => {
      order.push("provider");
      return makeMockResponse();
    });

    const pipeline = new Pipeline(forwardFn);

    pipeline.use(
      createPassthroughMiddleware("req-mw", "request", () => order.push("req-mw")),
    );
    pipeline.use(
      createPassthroughMiddleware("res-mw", "response", () => order.push("res-mw")),
    );

    const ctx = makeMockContext();
    await pipeline.run(ctx);

    expect(order).toEqual(["req-mw", "provider", "res-mw"]);
  });

  it("throws if no forward function is set and not short-circuited", async () => {
    const pipeline = new Pipeline();
    const ctx = makeMockContext();

    await expect(pipeline.run(ctx)).rejects.toThrow(
      "No forward function set on Pipeline",
    );
  });
});
