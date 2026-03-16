import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { Command } from "commander";

vi.mock("@openbastion-ai/config", () => ({
  loadConfig: vi.fn(),
}));

import { registerTestCommand } from "./test.js";
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

describe("test command", () => {
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
    registerTestCommand(program);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends POST to the correct URL with expected body", async () => {
    mockedLoadConfig.mockResolvedValue(makeConfig() as any);
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify({ content: "BASTION_OK" })),
    });

    await program.parseAsync(["node", "bastion", "test"]);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe("http://127.0.0.1:4000/v1/messages");
    expect(opts.method).toBe("POST");
    const body = JSON.parse(opts.body);
    expect(body.model).toBe("claude-haiku-4-5-20251001");
    expect(body.messages[0].content).toBe("Say: BASTION_OK");
  });

  it("on success, logs response", async () => {
    mockedLoadConfig.mockResolvedValue(makeConfig() as any);
    const responseBody = { content: "BASTION_OK" };
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(responseBody)),
    });

    await program.parseAsync(["node", "bastion", "test"]);

    const calls = (console.log as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0])
      .filter((s): s is string => typeof s === "string");
    // Should log the pretty-printed JSON response
    expect(calls.some((s) => s.includes("BASTION_OK"))).toBe(true);
  });

  it("on fetch ECONNREFUSED error, logs friendly 'not running' message", async () => {
    mockedLoadConfig.mockResolvedValue(makeConfig() as any);
    const err = new TypeError("fetch failed: ECONNREFUSED");
    mockFetch.mockRejectedValue(err);

    await program.parseAsync(["node", "bastion", "test"]);

    expect(console.error).toHaveBeenCalledWith(
      "Bastion is not running. Start it with: bastion start",
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
