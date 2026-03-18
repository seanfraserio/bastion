// Unified cost estimation for all LLM providers
// Prices per million tokens (USD)

export const MODEL_COSTS: Record<string, { input: number; output: number }> = {
  // Anthropic
  "claude-opus-4-6": { input: 15.00, output: 75.00 },
  "claude-sonnet-4-6": { input: 3.00, output: 15.00 },
  "claude-haiku-4-5-20251001": { input: 0.80, output: 4.00 },

  // OpenAI
  "gpt-4o": { input: 5.00, output: 15.00 },
  "gpt-4o-mini": { input: 0.15, output: 0.60 },
  "o3-mini": { input: 1.10, output: 4.40 },

  // Google
  "gemini-2.0-flash": { input: 0.10, output: 0.40 },
  "gemini-2.0-pro": { input: 1.25, output: 5.00 },
};

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const costs = MODEL_COSTS[model];
  if (!costs) return 0;
  return (inputTokens * costs.input + outputTokens * costs.output) / 1_000_000;
}

export function getModelCosts(model: string): { input: number; output: number } | undefined {
  return MODEL_COSTS[model];
}
