import type {
  PipelineContext,
  PipelineMiddleware,
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

  async run(ctx: PipelineContext): Promise<PipelineContext> {
    let shortCircuited = false;

    // 1. Run request-phase middlewares (phase === "request" or "both")
    for (const mw of this.middlewares) {
      if (mw.phase !== "request" && mw.phase !== "both") {
        continue;
      }

      const result = await mw.process(ctx);

      switch (result.action) {
        case "continue":
          ctx = result.ctx;
          break;

        case "block":
          throw new PipelineBlockedError(result.reason, result.statusCode);

        case "short-circuit":
          ctx.response = result.response;
          shortCircuited = true;
          break;
      }

      if (shortCircuited) break;
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

      const result = await mw.process(ctx);

      switch (result.action) {
        case "continue":
          ctx = result.ctx;
          break;

        case "block":
          throw new PipelineBlockedError(result.reason, result.statusCode);

        case "short-circuit":
          // In response phase, short-circuit replaces the response
          ctx.response = result.response;
          break;
      }
    }

    return ctx;
  }
}
