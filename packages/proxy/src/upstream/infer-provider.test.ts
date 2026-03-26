import { describe, it, expect } from "vitest";
import { inferProviderFromPath } from "./infer-provider.js";

describe("inferProviderFromPath", () => {
  it("returns anthropic for /v1/messages", () => {
    expect(inferProviderFromPath("/v1/messages")).toBe("anthropic");
  });

  it("returns anthropic for /v1/messages/ with trailing slash", () => {
    expect(inferProviderFromPath("/v1/messages/")).toBe("anthropic");
  });

  it("returns openai for /v1/chat/completions", () => {
    expect(inferProviderFromPath("/v1/chat/completions")).toBe("openai");
  });

  it("returns openai for /v1/chat/completions/", () => {
    expect(inferProviderFromPath("/v1/chat/completions/")).toBe("openai");
  });

  it("throws 400 for /v2/messages", () => {
    expect(() => inferProviderFromPath("/v2/messages")).toThrow();
    try {
      inferProviderFromPath("/v2/messages");
    } catch (e: any) {
      expect(e.statusCode).toBe(400);
    }
  });

  it("throws 400 for /health", () => {
    expect(() => inferProviderFromPath("/health")).toThrow();
  });

  it("throws 400 for empty path", () => {
    expect(() => inferProviderFromPath("")).toThrow();
  });
});
