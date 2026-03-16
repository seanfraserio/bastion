import { IProvider, NormalizedRequest, NormalizedResponse, ProviderConfig } from "../../pipeline/types.js";

export function createMockProvider(responses?: Partial<NormalizedResponse>[]): IProvider & { calls: NormalizedRequest[] } {
  const calls: NormalizedRequest[] = [];
  let callIndex = 0;

  return {
    name: "anthropic",
    calls,
    async forward(request: NormalizedRequest, _rawBody: unknown, _config: ProviderConfig): Promise<NormalizedResponse> {
      calls.push(request);
      const response = responses?.[callIndex] ?? {};
      callIndex++;
      return {
        content: "Mock response",
        stopReason: "end_turn",
        inputTokens: 10,
        outputTokens: 20,
        rawBody: { id: "mock" },
        ...response,
      };
    },
    supports(model: string): boolean {
      return model.startsWith("claude-");
    },
    estimateCost(inputTokens: number, outputTokens: number): number {
      return (inputTokens * 3 + outputTokens * 15) / 1_000_000;
    },
  };
}
