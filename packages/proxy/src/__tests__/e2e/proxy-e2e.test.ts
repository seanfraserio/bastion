import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createTestServer, type TestServer } from "../helpers/test-server.js";

async function httpRequest(
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {},
): Promise<{ status: number; body: any }> {
  const { method = "GET", headers = {}, body } = options;

  const res = await fetch(url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  return { status: res.status, body: parsed };
}

describe("Proxy E2E", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await createTestServer();
  });

  afterAll(async () => {
    await server?.close();
  });

  it("proxies Anthropic /v1/messages and returns 200", async () => {
    const { status, body } = await httpRequest(`${server.url}/v1/messages`, {
      method: "POST",
      body: {
        model: "claude-sonnet-4-6",
        max_tokens: 10,
        messages: [{ role: "user", content: "Hi" }],
      },
    });

    expect(status).toBe(200);
    expect(body).toBeDefined();
    expect(body.content).toBeDefined();
  });

  it("health endpoint returns 200 with status ok", async () => {
    const { status, body } = await httpRequest(`${server.url}/health`);

    expect(status).toBe(200);
    expect(body.status).toBe("ok");
  });

  it("stats endpoint returns 200 with totalRequests field", async () => {
    const { status, body } = await httpRequest(`${server.url}/stats`);

    expect(status).toBe(200);
    expect(typeof body.totalRequests).toBe("number");
  });
});

describe("Proxy E2E - Auth", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await createTestServer({
      auth: { enabled: true, tokens: ["valid-test-token"] },
    });
  });

  afterAll(async () => {
    await server?.close();
  });

  it("request without token returns 401", async () => {
    const { status, body } = await httpRequest(`${server.url}/v1/messages`, {
      method: "POST",
      body: {
        model: "claude-sonnet-4-6",
        max_tokens: 10,
        messages: [{ role: "user", content: "Hi" }],
      },
    });

    expect(status).toBe(401);
    expect(body.error).toBe("unauthorized");
  });

  it("request with valid Bearer token returns 200", async () => {
    const { status, body } = await httpRequest(`${server.url}/v1/messages`, {
      method: "POST",
      headers: {
        Authorization: "Bearer valid-test-token",
      },
      body: {
        model: "claude-sonnet-4-6",
        max_tokens: 10,
        messages: [{ role: "user", content: "Hi" }],
      },
    });

    expect(status).toBe(200);
    expect(body.content).toBeDefined();
  });

  it("request with valid x-api-key returns 200", async () => {
    const { status, body } = await httpRequest(`${server.url}/v1/messages`, {
      method: "POST",
      headers: {
        "x-api-key": "valid-test-token",
      },
      body: {
        model: "claude-sonnet-4-6",
        max_tokens: 10,
        messages: [{ role: "user", content: "Hi" }],
      },
    });

    expect(status).toBe(200);
    expect(body.content).toBeDefined();
  });

  it("health endpoint works without auth", async () => {
    const { status, body } = await httpRequest(`${server.url}/health`);

    expect(status).toBe(200);
    expect(body.status).toBe("ok");
  });
});

describe("Proxy E2E - Policy Blocking", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await createTestServer({
      policies: [
        {
          name: "block-forbidden-word",
          on: "request",
          action: "block",
          condition: {
            type: "contains",
            field: "prompt",
            value: "BLOCKED_WORD",
            case_sensitive: false,
          },
        },
      ],
    });
  });

  afterAll(async () => {
    await server?.close();
  });

  it("request containing blocked word returns 403", async () => {
    const { status, body } = await httpRequest(`${server.url}/v1/messages`, {
      method: "POST",
      body: {
        model: "claude-sonnet-4-6",
        max_tokens: 10,
        messages: [{ role: "user", content: "Please process BLOCKED_WORD for me" }],
      },
    });

    expect(status).toBe(403);
    expect(body.error.type).toBe("policy_blocked");
  });

  it("request without blocked word returns 200", async () => {
    const { status, body } = await httpRequest(`${server.url}/v1/messages`, {
      method: "POST",
      body: {
        model: "claude-sonnet-4-6",
        max_tokens: 10,
        messages: [{ role: "user", content: "Hello, how are you?" }],
      },
    });

    expect(status).toBe(200);
  });
});

describe("Proxy E2E - Rate Limiting", () => {
  let server: TestServer;

  beforeAll(async () => {
    server = await createTestServer({
      rate_limits: {
        enabled: true,
        requests_per_minute: 3,
      },
    });
  });

  afterAll(async () => {
    await server?.close();
  });

  it("exceeding rate limit returns 429", async () => {
    const makeRequest = () =>
      httpRequest(`${server.url}/v1/messages`, {
        method: "POST",
        body: {
          model: "claude-sonnet-4-6",
          max_tokens: 10,
          messages: [{ role: "user", content: "Hi" }],
        },
      });

    // Send requests until we get a 429
    // With 3 RPM and token bucket refill, we need to exhaust the bucket.
    // Token bucket starts at 3 and refills fractionally each ms.
    // Send enough requests quickly to exhaust it.
    const results: number[] = [];
    for (let i = 0; i < 10; i++) {
      const res = await makeRequest();
      results.push(res.status);
      if (res.status === 429) break;
    }

    // At least one request should have been rate limited
    expect(results).toContain(429);
    // First request should have succeeded
    expect(results[0]).toBe(200);
  });
});
