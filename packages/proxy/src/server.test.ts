import { describe, it, expect, afterEach } from "vitest";
import { createTestServer, TestServer } from "./__tests__/helpers/test-server.js";

describe("Server", () => {
  let server: TestServer | undefined;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
  });

  it("createServer returns a working server", async () => {
    server = await createTestServer();
    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  });

  it("/health returns { status: 'ok' } without auth", async () => {
    server = await createTestServer();

    const res = await fetch(`${server.url}/health`);
    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  it("/health returns version and uptime when not auth-protected", async () => {
    server = await createTestServer();

    const res = await fetch(`${server.url}/health`);
    const body = await res.json();

    expect(body.status).toBe("ok");
    expect(body.version).toBeDefined();
    expect(body.uptime).toBeDefined();
  });

  it("auth middleware blocks when enabled and no token provided", async () => {
    server = await createTestServer({
      auth: { enabled: true, tokens: ["secret-token"] },
    });

    // POST to /v1/messages without auth should be blocked
    const res = await fetch(`${server.url}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "Hello" }],
      }),
    });

    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe("unauthorized");
  });

  it("auth middleware allows requests with valid token", async () => {
    server = await createTestServer({
      auth: { enabled: true, tokens: ["secret-token"] },
    });

    const res = await fetch(`${server.url}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer secret-token",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        messages: [{ role: "user", content: "Hello" }],
      }),
    });

    // Should succeed (get a response from the mock backend)
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe("msg_mock");
  });

  it("/health is accessible even with auth enabled", async () => {
    server = await createTestServer({
      auth: { enabled: true, tokens: ["secret-token"] },
    });

    const res = await fetch(`${server.url}/health`);
    expect(res.ok).toBe(true);

    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});
