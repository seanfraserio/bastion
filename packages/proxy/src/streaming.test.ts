/* eslint-disable no-constant-condition */
import { describe, it, expect } from "vitest";
import { createUsageTrackingStream } from "./streaming.js";

function makeSSEStream(events: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(event));
      }
      controller.close();
    },
  });
}

describe("createUsageTrackingStream", () => {
  it("passes through all chunks unchanged", async () => {
    const events = [
      "data: {\"type\":\"content\"}\n\n",
      "data: {\"type\":\"done\"}\n\n",
    ];
    const source = makeSSEStream(events);
    const { stream } = createUsageTrackingStream(source, "anthropic");

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    const chunks: string[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(decoder.decode(value));
    }

    expect(chunks.join("")).toBe(events.join(""));
  });

  it("extracts Anthropic usage from message_start and message_delta", async () => {
    const events = [
      `event: message_start\ndata: ${JSON.stringify({ type: "message_start", message: { id: "msg_1", usage: { input_tokens: 42, output_tokens: 0 } } })}\n\n`,
      `event: content_block_delta\ndata: ${JSON.stringify({ type: "content_block_delta", delta: { text: "Hello" } })}\n\n`,
      `event: message_delta\ndata: ${JSON.stringify({ type: "message_delta", delta: { stop_reason: "end_turn" }, usage: { output_tokens: 15 } })}\n\n`,
      `event: message_stop\ndata: ${JSON.stringify({ type: "message_stop" })}\n\n`,
    ];
    const source = makeSSEStream(events);
    const { stream, usage } = createUsageTrackingStream(source, "anthropic");

    // Consume the stream
    const reader = stream.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    const result = await usage;
    expect(result.inputTokens).toBe(42);
    expect(result.outputTokens).toBe(15);
  });

  it("extracts OpenAI usage from final chunk", async () => {
    const events = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: "Hi" } }], usage: null })}\n\n`,
      `data: ${JSON.stringify({ choices: [], usage: { prompt_tokens: 30, completion_tokens: 25, total_tokens: 55 } })}\n\n`,
      "data: [DONE]\n\n",
    ];
    const source = makeSSEStream(events);
    const { stream, usage } = createUsageTrackingStream(source, "openai");

    const reader = stream.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    const result = await usage;
    expect(result.inputTokens).toBe(30);
    expect(result.outputTokens).toBe(25);
  });

  it("returns zero usage when no usage events are present", async () => {
    const events = [
      "data: {\"text\":\"hello\"}\n\n",
      "data: [DONE]\n\n",
    ];
    const source = makeSSEStream(events);
    const { stream, usage } = createUsageTrackingStream(source, "openai");

    const reader = stream.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    const result = await usage;
    expect(result.inputTokens).toBe(0);
    expect(result.outputTokens).toBe(0);
  });

  it("handles chunks split across SSE event boundaries", async () => {
    // Simulate a chunk that splits an SSE event across two Uint8Array chunks
    const encoder = new TextEncoder();
    const fullEvent = `data: ${JSON.stringify({ type: "message_start", message: { usage: { input_tokens: 99, output_tokens: 0 } } })}\n\n`;
    const midpoint = Math.floor(fullEvent.length / 2);

    const source = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode(fullEvent.slice(0, midpoint)));
        controller.enqueue(encoder.encode(fullEvent.slice(midpoint)));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "message_delta", usage: { output_tokens: 7 } })}\n\n`));
        controller.close();
      },
    });

    const { stream, usage } = createUsageTrackingStream(source, "anthropic");

    const reader = stream.getReader();
    while (true) {
      const { done } = await reader.read();
      if (done) break;
    }

    const result = await usage;
    expect(result.inputTokens).toBe(99);
    expect(result.outputTokens).toBe(7);
  });
});
