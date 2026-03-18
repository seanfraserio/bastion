import { describe, it, expect } from "vitest";
import { estimateCost, getModelCosts } from "./costs.js";

describe("estimateCost", () => {
  it("returns correct value for known model", () => {
    // claude-opus-4-6: input 15.00, output 75.00 per million tokens
    // 1000 input tokens = 1000 * 15.00 / 1_000_000 = 0.015
    // 500 output tokens = 500 * 75.00 / 1_000_000 = 0.0375
    // total = 0.0525
    const cost = estimateCost("claude-opus-4-6", 1000, 500);
    expect(cost).toBeCloseTo(0.0525, 6);
  });

  it("returns 0 for unknown model", () => {
    const cost = estimateCost("unknown-model-xyz", 1000, 500);
    expect(cost).toBe(0);
  });
});

describe("getModelCosts", () => {
  it("returns costs for known model", () => {
    const costs = getModelCosts("gpt-4o");
    expect(costs).toEqual({ input: 5.00, output: 15.00 });
  });

  it("returns undefined for unknown model", () => {
    const costs = getModelCosts("unknown-model-xyz");
    expect(costs).toBeUndefined();
  });
});
