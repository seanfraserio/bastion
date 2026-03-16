import { PipelineContext } from "../../pipeline/types.js";

export function makeMockContext(overrides?: Partial<PipelineContext>): PipelineContext {
  return {
    id: "test-id",
    requestId: "test-request-id",
    agentName: "test-agent",
    teamName: "test-team",
    environment: "test",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    startTime: Date.now(),
    request: {
      model: "claude-sonnet-4-6",
      messages: [{ role: "user", content: "Hello", rawContent: "Hello" }],
      temperature: 0.7,
      maxTokens: 1024,
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
