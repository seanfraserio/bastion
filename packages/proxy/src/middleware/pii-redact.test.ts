import { describe, it, expect } from "vitest";
import { PiiRedactMiddleware } from "./pii-redact.js";
import { makeMockContext } from "../__tests__/helpers/mock-context.js";

describe("PiiRedactMiddleware", () => {
  it("returns { action: 'continue', ctx } unchanged", async () => {
    const mw = new PiiRedactMiddleware();
    const ctx = makeMockContext();

    const result = await mw.process(ctx);

    expect(result.action).toBe("continue");
    if (result.action === "continue") {
      expect(result.ctx).toBe(ctx);
    }
  });

  it("has name 'pii-redact'", () => {
    const mw = new PiiRedactMiddleware();
    expect(mw.name).toBe("pii-redact");
  });

  it("has phase 'both'", () => {
    const mw = new PiiRedactMiddleware();
    expect(mw.phase).toBe("both");
  });

  it("passes through context with response unchanged", async () => {
    const mw = new PiiRedactMiddleware();
    const ctx = makeMockContext({
      response: {
        content: "SSN: 123-45-6789, email: user@example.com",
        stopReason: "end_turn",
        inputTokens: 10,
        outputTokens: 20,
        rawBody: {},
      },
    });

    const result = await mw.process(ctx);

    expect(result.action).toBe("continue");
    if (result.action === "continue") {
      // OSS stub does not redact anything
      expect(result.ctx.response?.content).toBe("SSN: 123-45-6789, email: user@example.com");
    }
  });
});
