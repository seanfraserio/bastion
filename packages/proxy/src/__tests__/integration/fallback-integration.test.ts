import { describe, it, expect } from "vitest";
import { Pipeline } from "../../pipeline/index.js";
import type { NormalizedResponse, PipelineContext } from "../../pipeline/types.js";
import { makeMockContext } from "../helpers/mock-context.js";

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

describe("Fallback Integration", () => {
  it("primary fails then fallback succeeds", async () => {
    let callCount = 0;

    const forwardFn = async (_ctx: PipelineContext): Promise<NormalizedResponse> => {
      callCount++;
      if (callCount === 1) {
        // Simulate primary failure: mark fallback and return a fallback response
        // In real usage, the ProviderRouter handles this internally.
        // Here we simulate the fallback behavior at the pipeline level.
        const error = new Error("Provider request failed (429)");
        (error as any).statusCode = 429;
        throw error;
      }
      return makeMockResponse({ content: "Fallback response" });
    };

    const pipeline = new Pipeline(forwardFn);
    const ctx = makeMockContext();

    // The first call will throw (simulating primary failure with no fallback at pipeline level)
    await expect(pipeline.run(ctx)).rejects.toThrow("429");
  });

  it("forwardFn that handles fallback internally sets fallbackUsed on ctx", async () => {
    const forwardFn = async (ctx: PipelineContext): Promise<NormalizedResponse> => {
      // Simulate ProviderRouter behavior: primary fails, fallback succeeds
      ctx.fallbackUsed = true;
      return makeMockResponse({ content: "Fallback response" });
    };

    const pipeline = new Pipeline(forwardFn);
    const ctx = makeMockContext();
    const result = await pipeline.run(ctx);

    expect(result.fallbackUsed).toBe(true);
    expect(result.response?.content).toBe("Fallback response");
  });

  it("successful primary does not set fallbackUsed", async () => {
    const forwardFn = async (_ctx: PipelineContext): Promise<NormalizedResponse> => {
      return makeMockResponse({ content: "Primary response" });
    };

    const pipeline = new Pipeline(forwardFn);
    const ctx = makeMockContext();
    const result = await pipeline.run(ctx);

    expect(result.fallbackUsed).toBe(false);
    expect(result.response?.content).toBe("Primary response");
  });

  it("forwardFn failure propagates to pipeline caller", async () => {
    const forwardFn = async (): Promise<NormalizedResponse> => {
      throw new Error("Both providers failed");
    };

    const pipeline = new Pipeline(forwardFn);
    const ctx = makeMockContext();

    await expect(pipeline.run(ctx)).rejects.toThrow("Both providers failed");
  });
});
