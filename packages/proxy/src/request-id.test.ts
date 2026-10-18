import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { Pipeline } from "./pipeline/index.js";
import { createTestServer, type TestServer } from "./__tests__/helpers/test-server.js";

vi.mock("node:crypto", async (importOriginal) => {
  const crypto = await importOriginal<typeof import("node:crypto")>();
  return { ...crypto, randomUUID: vi.fn(crypto.randomUUID) };
});

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("native request IDs", () => {
  let server: TestServer | undefined;
  afterEach(async () => {
    await server?.close();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("uses native random UUIDs for generated request and context IDs", async () => {
    server = await createTestServer();
    vi.mocked(randomUUID).mockClear();
    const run = vi.spyOn(Pipeline.prototype, "run");
    const response = await fetch(`${server.url}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", messages: [{ role: "user", content: "Hello" }] }),
    });
    expect(response.status).toBe(200);
    expect(randomUUID).toHaveBeenCalledTimes(2);
    const ids = vi.mocked(randomUUID).mock.results.map((result) => result.value);
    expect(ids[0]).toMatch(UUID_V4);
    expect(ids[1]).toMatch(UUID_V4);
    expect(ids[0]).not.toBe(ids[1]);
    expect(run.mock.calls[0][0]).toMatchObject({ requestId: ids[0], id: ids[1] });
  });

  it("preserves a valid caller request ID while generating a native context ID", async () => {
    server = await createTestServer();
    vi.mocked(randomUUID).mockClear();
    const run = vi.spyOn(Pipeline.prototype, "run");
    const response = await fetch(`${server.url}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-request-id": "caller.request-123" },
      body: JSON.stringify({ model: "claude-sonnet-4-6", messages: [{ role: "user", content: "Hello" }] }),
    });
    expect(response.status).toBe(200);
    expect(randomUUID).toHaveBeenCalledTimes(1);
    expect(vi.mocked(randomUUID).mock.results[0].value).toMatch(UUID_V4);
    expect(run.mock.calls[0][0]).toMatchObject({ requestId: "caller.request-123", id: vi.mocked(randomUUID).mock.results[0].value });
  });
});
