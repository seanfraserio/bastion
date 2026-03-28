import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AuditEntry } from "../pipeline/types.js";

// ---------------------------------------------------------------------------
// Mock @google-cloud/pubsub before importing the module under test
// ---------------------------------------------------------------------------

const mockPublish = vi.fn().mockResolvedValue("msg-id-1");
const mockTopicFlush = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);

const mockTopic = vi.fn().mockReturnValue({
  publishMessage: mockPublish,
  flush: mockTopicFlush,
});

vi.mock("@google-cloud/pubsub", () => ({
  PubSub: vi.fn().mockImplementation(() => ({
    topic: mockTopic,
    close: mockClose,
  })),
}));

// Must import AFTER vi.mock
import { PubSubExporter } from "./pubsub.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeAuditEntry(overrides: Partial<AuditEntry> = {}): AuditEntry {
  return {
    id: "entry-1",
    timestamp: new Date().toISOString(),
    agentName: "test-agent",
    teamName: "test-team",
    environment: "test",
    provider: "anthropic",
    model: "claude-sonnet-4-6",
    cacheHit: false,
    fallbackUsed: false,
    inputTokens: 100,
    outputTokens: 50,
    policies: [],
    durationMs: 250,
    status: "success",
    requestId: "req-1",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PubSubExporter", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("has name 'pubsub'", () => {
    const exporter = new PubSubExporter({ topicName: "audit-topic" });
    expect(exporter.name).toBe("pubsub");
  });

  it("buffers entries and flushes on interval", async () => {
    const exporter = new PubSubExporter({
      topicName: "audit-topic",
      flushIntervalMs: 5000,
      batchSize: 100, // high batch size so interval triggers first
    });

    exporter.export(makeAuditEntry());
    exporter.export(makeAuditEntry({ id: "entry-2" }));

    // No publish yet
    expect(mockPublish).not.toHaveBeenCalled();

    // Advance past flush interval
    await vi.advanceTimersByTimeAsync(5000);

    // Should have published a batch of 2 entries
    expect(mockPublish).toHaveBeenCalledTimes(1);
    const call = mockPublish.mock.calls[0][0];
    const parsed = JSON.parse(call.data.toString());
    expect(parsed).toHaveLength(2);
    expect(parsed[0].id).toBe("entry-1");
    expect(parsed[1].id).toBe("entry-2");

    await exporter.shutdown();
  });

  it("flushes immediately when batch size is reached", async () => {
    const exporter = new PubSubExporter({
      topicName: "audit-topic",
      batchSize: 2,
      flushIntervalMs: 60_000, // long interval so batch size triggers first
    });

    exporter.export(makeAuditEntry({ id: "entry-1" }));
    expect(mockPublish).not.toHaveBeenCalled();

    exporter.export(makeAuditEntry({ id: "entry-2" }));

    // flush() is async but fire-and-forget from export(), give microtasks a chance
    await vi.advanceTimersByTimeAsync(0);

    expect(mockPublish).toHaveBeenCalledTimes(1);
    const call = mockPublish.mock.calls[0][0];
    const parsed = JSON.parse(call.data.toString());
    expect(parsed).toHaveLength(2);

    await exporter.shutdown();
  });

  it("resolves ordering key from agent name in entry", async () => {
    const exporter = new PubSubExporter({
      topicName: "audit-topic",
      orderingKey: "agent",
      batchSize: 1,
    });

    exporter.export(makeAuditEntry({ agentName: "my-agent" }));
    await vi.advanceTimersByTimeAsync(0);

    expect(mockPublish).toHaveBeenCalledTimes(1);
    const call = mockPublish.mock.calls[0][0];
    expect(call.orderingKey).toBe("my-agent");

    await exporter.shutdown();
  });

  it("uses static ordering key when not 'agent'", async () => {
    const exporter = new PubSubExporter({
      topicName: "audit-topic",
      orderingKey: "my-static-key",
      batchSize: 1,
    });

    exporter.export(makeAuditEntry());
    await vi.advanceTimersByTimeAsync(0);

    expect(mockPublish).toHaveBeenCalledTimes(1);
    const call = mockPublish.mock.calls[0][0];
    expect(call.orderingKey).toBe("my-static-key");

    await exporter.shutdown();
  });

  it("omits ordering key when not configured", async () => {
    const exporter = new PubSubExporter({
      topicName: "audit-topic",
      batchSize: 1,
    });

    exporter.export(makeAuditEntry());
    await vi.advanceTimersByTimeAsync(0);

    expect(mockPublish).toHaveBeenCalledTimes(1);
    const call = mockPublish.mock.calls[0][0];
    expect(call.orderingKey).toBeUndefined();

    await exporter.shutdown();
  });

  it("graceful shutdown: flushes buffer, flushes topic, closes client", async () => {
    const exporter = new PubSubExporter({
      topicName: "audit-topic",
      batchSize: 100,
      flushIntervalMs: 60_000,
    });

    exporter.export(makeAuditEntry());

    await exporter.shutdown();

    // Should have published the buffered entry
    expect(mockPublish).toHaveBeenCalledTimes(1);
    // Should have flushed the topic
    expect(mockTopicFlush).toHaveBeenCalledTimes(1);
    // Should have closed the PubSub client
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("logs error on publish failure and does not throw", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    mockPublish.mockRejectedValueOnce(new Error("Pub/Sub unavailable"));

    const exporter = new PubSubExporter({
      topicName: "audit-topic",
      batchSize: 1,
    });

    // export() should not throw
    exporter.export(makeAuditEntry());
    await vi.advanceTimersByTimeAsync(0);

    // The error should be logged via console.error
    expect(consoleSpy).toHaveBeenCalledTimes(1);
    expect(consoleSpy).toHaveBeenCalledWith(
      "Pub/Sub audit export failed",
      expect.any(Error),
    );

    // Subsequent exports should still work
    mockPublish.mockResolvedValueOnce("msg-id-2");
    exporter.export(makeAuditEntry({ id: "entry-2" }));
    await vi.advanceTimersByTimeAsync(0);

    expect(mockPublish).toHaveBeenCalledTimes(2);

    consoleSpy.mockRestore();
    await exporter.shutdown();
  });

  it("does not publish when buffer is empty on flush", async () => {
    const exporter = new PubSubExporter({
      topicName: "audit-topic",
      flushIntervalMs: 5000,
    });

    await vi.advanceTimersByTimeAsync(5000);

    expect(mockPublish).not.toHaveBeenCalled();

    await exporter.shutdown();
  });

  it("passes projectId to PubSub constructor", async () => {
    const { PubSub } = await import("@google-cloud/pubsub");
    vi.mocked(PubSub).mockClear();

    const _exporter = new PubSubExporter({
      topicName: "audit-topic",
      projectId: "my-project",
    });

    expect(PubSub).toHaveBeenCalledWith({ projectId: "my-project" });

    await _exporter.shutdown();
  });
});
