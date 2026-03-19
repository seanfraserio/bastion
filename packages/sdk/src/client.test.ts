import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BastionClient } from "./client.js";

describe("BastionClient", () => {
  const originalFetch = globalThis.fetch;
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = mockFetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // -----------------------------------------------------------------------
  // Constructor
  // -----------------------------------------------------------------------
  it("strips trailing slash from baseUrl", () => {
    const client = new BastionClient({ baseUrl: "http://localhost:4000/" });
    // Verify by calling health() and checking the URL passed to fetch
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "ok" }),
    });
    client.health();
    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:4000/health",
      expect.any(Object),
    );
  });

  // -----------------------------------------------------------------------
  // health()
  // -----------------------------------------------------------------------
  it("health() makes GET to /health", async () => {
    const client = new BastionClient({ baseUrl: "http://localhost:4000" });
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: "ok", version: "0.1.0", uptime: 10 }),
    });

    await client.health();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:4000/health",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("health() returns parsed JSON on 200", async () => {
    const client = new BastionClient({ baseUrl: "http://localhost:4000" });
    const payload = { status: "ok" as const, version: "0.1.0", uptime: 42 };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    });

    const result = await client.health();
    expect(result).toEqual(payload);
  });

  it("health() throws when fetch rejects (e.g., network error)", async () => {
    const client = new BastionClient({ baseUrl: "http://localhost:4000" });
    mockFetch.mockRejectedValue(new TypeError("fetch failed"));

    await expect(client.health()).rejects.toThrow("fetch failed");
  });

  // -----------------------------------------------------------------------
  // stats()
  // -----------------------------------------------------------------------
  it("stats() makes GET to /stats", async () => {
    const client = new BastionClient({ baseUrl: "http://localhost:4000" });
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          totalRequests: 0,
          blockedRequests: 0,
          errors: 0,
          cache: { size: 0, totalHits: 0 },
        }),
    });

    await client.stats();

    expect(mockFetch).toHaveBeenCalledWith(
      "http://localhost:4000/stats",
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it("stats() returns parsed JSON on 200", async () => {
    const client = new BastionClient({ baseUrl: "http://localhost:4000" });
    const payload = {
      totalRequests: 100,
      blockedRequests: 5,
      errors: 2,
      cache: { size: 50, totalHits: 30 },
    };
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    });

    const result = await client.stats();
    expect(result).toEqual(payload);
  });

  it("stats() throws when fetch rejects (e.g., network error)", async () => {
    const client = new BastionClient({ baseUrl: "http://localhost:4000" });
    mockFetch.mockRejectedValue(new TypeError("fetch failed"));

    await expect(client.stats()).rejects.toThrow("fetch failed");
  });
});
