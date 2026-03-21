import { describe, it, expect, afterEach } from "vitest";
import { createTestServer, TestServer } from "../helpers/test-server.js";

describe("Streaming Integration", () => {
  let server: TestServer | undefined;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
  });

  it("Anthropic streaming returns SSE content-type and event chunks", async () => {
    server = await createTestServer();

    const res = await fetch(`${server.url}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");

    const body = await res.text();
    expect(body).toContain("message_start");
    expect(body).toContain("content_block_delta");
    expect(body).toContain("message_delta");
    expect(body).toContain("message_stop");
  });

  it("OpenAI streaming returns SSE content-type and event chunks", async () => {
    server = await createTestServer();

    const res = await fetch(`${server.url}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
      }),
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");

    const body = await res.text();
    expect(body).toContain("chat.completion.chunk");
    expect(body).toContain("data: [DONE]");
  });

  it("non-streaming Anthropic still returns JSON", async () => {
    server = await createTestServer();

    const res = await fetch(`${server.url}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "Hello" }],
        stream: false,
      }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("msg_mock");
    expect(body.content).toBeDefined();
  });

  it("streaming requests skip cache", async () => {
    server = await createTestServer({
      cache: { enabled: true, ttl_seconds: 3600 },
    });

    // First request: streaming
    const res1 = await fetch(`${server.url}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
      }),
    });
    expect(res1.status).toBe(200);
    await res1.text();

    // Second request: also streaming, should NOT be cached (both hit the mock backend)
    const res2 = await fetch(`${server.url}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
      }),
    });
    expect(res2.status).toBe(200);
    const body2 = await res2.text();
    expect(body2).toContain("message_start");

    // Both requests should have hit the mock backend
    const streamRequests = server.mockBackend.requests.filter(
      (r) => r.path === "/v1/messages" && (r.body as any).stream === true,
    );
    expect(streamRequests.length).toBe(2);
  });

  it("auth is enforced for streaming requests", async () => {
    server = await createTestServer({
      auth: { enabled: true, tokens: ["secret-token"] },
    });

    // No auth — should be blocked
    const res = await fetch(`${server.url}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
      }),
    });
    expect(res.status).toBe(401);

    // With auth — should stream
    const res2 = await fetch(`${server.url}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer secret-token",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "Hello" }],
        stream: true,
      }),
    });
    expect(res2.status).toBe(200);
    expect(res2.headers.get("content-type")).toBe("text/event-stream");
  });
});
