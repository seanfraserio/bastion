import { describe, it, expect, vi } from "vitest";
import { Pipeline, PipelineBlockedError } from "../../pipeline/index.js";
import type {
  PipelineMiddleware,
  PipelineMiddlewareResult,
  PipelineContext,
  NormalizedResponse,
} from "../../pipeline/types.js";
import { makeMockContext } from "../helpers/mock-context.js";

function createRecordingMiddleware(
  name: string,
  phase: "request" | "response" | "both",
  log: string[],
): PipelineMiddleware {
  return {
    name,
    phase,
    async process(ctx: PipelineContext): Promise<PipelineMiddlewareResult> {
      log.push(`${name}:${phase === "both" ? "both" : phase}`);
      return { action: "continue", ctx };
    },
  };
}

function makeMockResponse(overrides?: Partial<NormalizedResponse>): NormalizedResponse {
  return {
    content: "Test response",
    stopReason: "end_turn",
    inputTokens: 10,
    outputTokens: 5,
    rawBody: { id: "resp-1" },
    ...overrides,
  };
}

describe("Pipeline Integration", () => {
  it("middleware executes in registration order", async () => {
    const log: string[] = [];
    const forwardFn = vi.fn(async () => makeMockResponse());

    const pipeline = new Pipeline(forwardFn);
    pipeline.use(createRecordingMiddleware("alpha", "request", log));
    pipeline.use(createRecordingMiddleware("beta", "request", log));
    pipeline.use(createRecordingMiddleware("gamma", "request", log));

    const ctx = makeMockContext();
    await pipeline.run(ctx);

    expect(log).toEqual(["alpha:request", "beta:request", "gamma:request"]);
    expect(forwardFn).toHaveBeenCalledOnce();
  });

  it("cache hit short-circuits and skips provider", async () => {
    const cachedResponse = makeMockResponse({ content: "Cached!" });
    const forwardFn = vi.fn(async () => makeMockResponse());

    const cacheMiddleware: PipelineMiddleware = {
      name: "cache",
      phase: "both",
      async process(ctx: PipelineContext): Promise<PipelineMiddlewareResult> {
        if (!ctx.response) {
          return { action: "short-circuit", response: cachedResponse };
        }
        return { action: "continue", ctx };
      },
    };

    const pipeline = new Pipeline(forwardFn);
    pipeline.use(cacheMiddleware);

    const ctx = makeMockContext();
    const result = await pipeline.run(ctx);

    expect(forwardFn).not.toHaveBeenCalled();
    expect(result.response?.content).toBe("Cached!");
  });

  it("policy block stops pipeline and subsequent middlewares are not called", async () => {
    const log: string[] = [];

    const blockMiddleware: PipelineMiddleware = {
      name: "blocker",
      phase: "request",
      async process(): Promise<PipelineMiddlewareResult> {
        log.push("blocker");
        return { action: "block", reason: "Blocked by policy", statusCode: 403 };
      },
    };

    const afterBlockMiddleware = createRecordingMiddleware("after-block", "request", log);
    const forwardFn = vi.fn(async () => makeMockResponse());

    const pipeline = new Pipeline(forwardFn);
    pipeline.use(blockMiddleware);
    pipeline.use(afterBlockMiddleware);

    const ctx = makeMockContext();

    await expect(pipeline.run(ctx)).rejects.toThrow(PipelineBlockedError);
    expect(log).toEqual(["blocker"]);
    expect(log).not.toContain("after-block:request");
    expect(forwardFn).not.toHaveBeenCalled();
  });

  it("response is populated after provider call", async () => {
    const forwardFn = vi.fn(async () =>
      makeMockResponse({ content: "Provider says hello", inputTokens: 42, outputTokens: 17 }),
    );

    const pipeline = new Pipeline(forwardFn);
    const ctx = makeMockContext();
    const result = await pipeline.run(ctx);

    expect(result.response).toBeDefined();
    expect(result.response?.content).toBe("Provider says hello");
    expect(result.response?.inputTokens).toBe(42);
    expect(result.response?.outputTokens).toBe(17);
  });

  it("response-phase middlewares see populated response", async () => {
    const forwardFn = vi.fn(async () => makeMockResponse({ content: "From provider" }));
    let seenContent: string | undefined;

    const responseMiddleware: PipelineMiddleware = {
      name: "inspector",
      phase: "response",
      async process(ctx: PipelineContext): Promise<PipelineMiddlewareResult> {
        seenContent = ctx.response?.content;
        return { action: "continue", ctx };
      },
    };

    const pipeline = new Pipeline(forwardFn);
    pipeline.use(responseMiddleware);

    const ctx = makeMockContext();
    await pipeline.run(ctx);

    expect(seenContent).toBe("From provider");
  });

  it("both-phase middleware runs in request and response phases", async () => {
    const log: string[] = [];
    const forwardFn = vi.fn(async () => {
      log.push("provider");
      return makeMockResponse();
    });

    const bothMiddleware: PipelineMiddleware = {
      name: "both-mw",
      phase: "both",
      async process(ctx: PipelineContext): Promise<PipelineMiddlewareResult> {
        const phase = ctx.response ? "response" : "request";
        log.push(`both-mw:${phase}`);
        return { action: "continue", ctx };
      },
    };

    const pipeline = new Pipeline(forwardFn);
    pipeline.use(bothMiddleware);

    const ctx = makeMockContext();
    await pipeline.run(ctx);

    expect(log).toEqual(["both-mw:request", "provider", "both-mw:response"]);
  });
});
