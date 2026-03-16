import { describe, it, expect, vi, beforeEach } from "vitest";
import { Command } from "commander";

// Mock loadConfig before importing the module under test
vi.mock("@openbastion-ai/config", () => ({
  loadConfig: vi.fn(),
}));

import { registerValidateCommand } from "./validate.js";
import { loadConfig } from "@openbastion-ai/config";

const mockedLoadConfig = vi.mocked(loadConfig);

function makeConfig(overrides: Record<string, unknown> = {}) {
  return {
    version: "1",
    proxy: { port: 4000, host: "127.0.0.1", log_level: "info" },
    providers: {
      primary: "openai",
      fallback: undefined,
      definitions: {
        openai: { api_key: "sk-test-ABCD1234" },
      },
    },
    auth: { enabled: false, tokens: [] },
    cache: { enabled: true, strategy: "exact", ttl_seconds: 3600, max_entries: 10000 },
    ...overrides,
  };
}

describe("validate command", () => {
  let program: Command;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "exit").mockImplementation((() => {}) as never);

    program = new Command();
    program.exitOverride(); // prevent commander from calling process.exit
    registerValidateCommand(program);
  });

  it("calls loadConfig with the config path", async () => {
    mockedLoadConfig.mockResolvedValue(makeConfig() as any);

    await program.parseAsync(["node", "bastion", "validate", "-c", "/tmp/my.yaml"]);

    expect(mockedLoadConfig).toHaveBeenCalledWith("/tmp/my.yaml");
  });

  it("on success, outputs resolved config", async () => {
    mockedLoadConfig.mockResolvedValue(makeConfig() as any);

    await program.parseAsync(["node", "bastion", "validate"]);

    expect(console.log).toHaveBeenCalledWith("Configuration is valid!\n");
    expect(console.log).toHaveBeenCalledWith("[proxy]");
  });

  it("masks API keys with **** + last 4 chars", async () => {
    mockedLoadConfig.mockResolvedValue(makeConfig() as any);

    await program.parseAsync(["node", "bastion", "validate"]);

    const calls = (console.log as ReturnType<typeof vi.fn>).mock.calls
      .map((c) => c[0])
      .filter((s): s is string => typeof s === "string");

    const apiKeyLine = calls.find((s) => s.includes("api_key"));
    expect(apiKeyLine).toBeDefined();
    expect(apiKeyLine).toContain("****");
    expect(apiKeyLine).toContain("1234");
    // Must NOT contain the full key
    expect(apiKeyLine).not.toContain("sk-test-ABCD1234");
  });

  it("on loadConfig error, outputs error and exits with 1", async () => {
    mockedLoadConfig.mockRejectedValue(new Error("bad yaml"));

    await program.parseAsync(["node", "bastion", "validate"]);

    expect(console.error).toHaveBeenCalledWith(
      "Validation failed:\n",
      "bad yaml",
    );
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
