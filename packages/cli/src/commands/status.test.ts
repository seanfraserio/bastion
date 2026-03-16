import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";

vi.mock("@openbastion-ai/config", () => ({
  loadConfig: vi.fn(),
}));

import { registerStatusCommand } from "./status.js";
import { loadConfig } from "@openbastion-ai/config";

const mockedLoadConfig = vi.mocked(loadConfig);

function makeConfig() {
  return {
    version: "1",
    proxy: { port: 4000, host: "127.0.0.1", log_level: "info" },
    providers: {
      primary: "openai",
      definitions: { openai: { api_key: "sk-test-1234" } },
    },
    auth: { enabled: false, tokens: [] },
  };
}

describe("status command", () => {
  let program: Command;
  const originalFetch = globalThis.fetch;
  const mockFetch = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    globalThis.fetch = mockFetch;
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    program = new Command();
    program.exitOverride();
    registerStatusCommand(program);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("fetches /health and /stats endpoints", async () => {
    mockedLoadConfig.mockResolvedValue(makeConfig() as any);
    mockFetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ status: "ok", version: "0.1.0", uptime: 120 }),
      })
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            totalRequests: 42,
            blockedRequests: 3,
            errors: 1,
            cache: { size: 100, totalHits: 25 },
          }),
      });

    await program.parseAsync(["node", "bastion", "status"]);

    // Two fetch calls: /health and /stats
    expect(mockFetch).toHaveBeenCalledTimes(2);
    const urls = mockFetch.mock.calls.map((c) => c[0]);
    expect(urls[0]).toBe("http://127.0.0.1:4000/health");
    expect(urls[1]).toBe("http://127.0.0.1:4000/stats");
  });

  it("on success, logs formatted output", async () => {
    mockedLoadConfig.mockResolvedValue(makeConfig() as any);
    mockFetch
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ status: "ok", version: "0.1.0", uptime: 3661 }),
      })
      .mockResolvedValueOnce({
        json: () =>
          Promise.resolve({
            totalRequests: 42,
            blockedRequests: 3,
            errors: 1,
            cache: { size: 100, totalHits: 25 },
          }),
      });

    await program.parseAsync(["node", "bastion", "status"]);

    const calls = (console.log as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0])
      .filter((s): s is string => typeof s === "string");

    expect(calls).toContain("=== Bastion Status ===");
    // Uptime should be formatted as "1h 1m 1s"
    expect(calls.some((s) => s.includes("1h 1m 1s"))).toBe(true);
    expect(calls.some((s) => s.includes("=== Request Stats ==="))).toBe(true);
    expect(calls.some((s) => s.includes("=== Cache Stats ==="))).toBe(true);
  });

  it("on connection error, logs friendly error message", async () => {
    mockedLoadConfig.mockResolvedValue(makeConfig() as any);
    const err = new TypeError("fetch failed: ECONNREFUSED");
    mockFetch.mockRejectedValue(err);

    await program.parseAsync(["node", "bastion", "status"]);

    expect(console.error).toHaveBeenCalledWith(
      "Bastion is not running. Start it with: bastion start",
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
