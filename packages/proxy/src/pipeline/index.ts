import type {
  PipelineContext,
  PipelineMiddleware,
  PipelineMiddlewareResult,
  NormalizedResponse,
} from "./types.js";

export class PipelineBlockedError extends Error {
  constructor(
    public reason: string,
    public statusCode: number,
  ) {
    super(`Pipeline blocked: ${reason}`);
    this.name = "PipelineBlockedError";
  }
}

export type ForwardFn = (ctx: PipelineContext) => Promise<NormalizedResponse>;

/**
 * Applies a middleware result to the pipeline context.
 * Returns { ctx, shortCircuited } — the caller decides how to handle short-circuits.
 */
function applyResult(
  result: PipelineMiddlewareResult,
  ctx: PipelineContext,
): { ctx: PipelineContext; shortCircuited: boolean } {
  switch (result.action) {
    case "continue":
      return { ctx: result.ctx, shortCircuited: false };

    case "block":
      throw new PipelineBlockedError(result.reason, result.statusCode);

    case "short-circuit":
      ctx.response = result.response;
      return { ctx, shortCircuited: true };
  }
}

export class Pipeline {
  private middlewares: PipelineMiddleware[] = [];
  private forwardFn?: ForwardFn;

  constructor(forwardFn?: ForwardFn) {
    this.forwardFn = forwardFn;
  }

  use(middleware: PipelineMiddleware): void {
    this.middlewares.push(middleware);
  }

  setForwardFn(fn: ForwardFn): void {
    this.forwardFn = fn;
  }

  /**
   * Run only request-phase middleware (for streaming requests).
   * Returns the context — if ctx.response is set, a short-circuit (cache hit) occurred.
   */
  async runRequestPhase(ctx: PipelineContext): Promise<PipelineContext> {
    for (const mw of this.middlewares) {
      if (mw.phase !== "request" && mw.phase !== "both") {
        continue;
      }

      const applied = applyResult(await mw.process(ctx), ctx);
      ctx = applied.ctx;
      if (applied.shortCircuited) return ctx;
    }

    return ctx;
  }

  /**
   * Run only response-phase middleware (for streaming requests, after stream completes).
   */
  async runResponsePhase(ctx: PipelineContext): Promise<PipelineContext> {
    for (const mw of this.middlewares) {
      if (mw.phase !== "response" && mw.phase !== "both") {
        continue;
      }

      const applied = applyResult(await mw.process(ctx), ctx);
      ctx = applied.ctx;
    }

    return ctx;
  }

  async run(ctx: PipelineContext): Promise<PipelineContext> {
    // 1. Run request-phase middlewares (phase === "request" or "both")
    let shortCircuited = false;
    for (const mw of this.middlewares) {
      if (mw.phase !== "request" && mw.phase !== "both") {
        continue;
      }

      const applied = applyResult(await mw.process(ctx), ctx);
      ctx = applied.ctx;
      if (applied.shortCircuited) {
        shortCircuited = true;
        break;
      }
    }

    // 2. Call provider if not short-circuited
    if (!shortCircuited) {
      if (!this.forwardFn) {
        throw new Error("No forward function set on Pipeline");
      }
      const response = await this.forwardFn(ctx);
      ctx.response = response;
    }

    // 3. Run response-phase middlewares (phase === "response" or "both")
    for (const mw of this.middlewares) {
      if (mw.phase !== "response" && mw.phase !== "both") {
        continue;
      }

      const applied = applyResult(await mw.process(ctx), ctx);
      ctx = applied.ctx;
    }

    return ctx;
  }
}
