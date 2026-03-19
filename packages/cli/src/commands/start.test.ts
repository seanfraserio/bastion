import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

vi.mock("@openbastion-ai/proxy", () => ({
  createServer: vi.fn(),
}));

import { registerStartCommand } from "./start.js";
import { createServer } from "@openbastion-ai/proxy";

const mockedCreateServer = vi.mocked(createServer);

function makeConfig() {
  return {
    version: "1",
    proxy: { port: 4000, host: "127.0.0.1", log_level: "info" },
    providers: {
      primary: "openai",
      fallback: undefined,
      definitions: {
        openai: { api_key: "sk-test-1234" },
      },
    },
    auth: { enabled: false, tokens: [] },
    cache: { enabled: true, strategy: "exact", ttl_seconds: 3600, max_entries: 10000 },
  };
}

describe("start command", () => {
  let program: Command;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    program = new Command();
    program.exitOverride();
    registerStartCommand(program);
  });

  it("calls createServer with the config path", async () => {
    const fakeApp = { listen: vi.fn().mockResolvedValue(undefined) };
    mockedCreateServer.mockResolvedValue({ app: fakeApp, config: makeConfig() } as any);

    await program.parseAsync(["node", "bastion", "start", "-c", "/tmp/my.yaml"]);

    expect(mockedCreateServer).toHaveBeenCalledWith("/tmp/my.yaml");
  });

  it("calls createServer", async () => {
    const fakeApp = { listen: vi.fn().mockResolvedValue(undefined) };
    mockedCreateServer.mockResolvedValue({ app: fakeApp, config: makeConfig() } as any);

    await program.parseAsync(["node", "bastion", "start"]);

    expect(mockedCreateServer).toHaveBeenCalled();
  });

  it("logs startup message containing 'Bastion'", async () => {
    const fakeApp = { listen: vi.fn().mockResolvedValue(undefined) };
    mockedCreateServer.mockResolvedValue({ app: fakeApp, config: makeConfig() } as any);

    await program.parseAsync(["node", "bastion", "start"]);

    const calls = (console.log as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0])
      .filter((s): s is string => typeof s === "string");

    expect(calls.some((s) => s.includes("Bastion"))).toBe(true);
  });
});
