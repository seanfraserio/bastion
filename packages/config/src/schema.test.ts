import { describe, it, expect } from "vitest";
import { bastionConfigSchema } from "./schema.js";

/** Helper: returns a minimal valid config object */
function minimalConfig(overrides: Record<string, unknown> = {}) {
  return {
    version: "1",
    proxy: { port: 4000 },
    providers: {
      primary: "openai",
      definitions: {
        openai: { api_key: "sk-test-1234" },
      },
    },
    ...overrides,
  };
}

describe("bastionConfigSchema", () => {
  // -----------------------------------------------------------------------
  // Minimal valid config
  // -----------------------------------------------------------------------
  it("parses a minimal valid config", () => {
    const result = bastionConfigSchema.safeParse(minimalConfig());
    expect(result.success).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Default values
  // -----------------------------------------------------------------------
  it("applies default host=127.0.0.1 and log_level=info", () => {
    const result = bastionConfigSchema.parse(minimalConfig());
    expect(result.proxy.host).toBe("127.0.0.1");
    expect(result.proxy.log_level).toBe("info");
  });

  it("rejects invalid log_level", () => {
    const result = bastionConfigSchema.safeParse(
      minimalConfig({
        proxy: { port: 4000, log_level: "verbose" },
      }),
    );
    expect(result.success).toBe(false);
  });

  // -----------------------------------------------------------------------
  // Cache defaults
  // -----------------------------------------------------------------------
  it("applies cache defaults: enabled=true, strategy=exact, ttl_seconds=3600, max_entries=10000", () => {
    const result = bastionConfigSchema.parse(
      minimalConfig({ cache: {} }),
    );
    expect(result.cache).toBeDefined();
    expect(result.cache!.enabled).toBe(true);
    expect(result.cache!.strategy).toBe("exact");
    expect(result.cache!.ttl_seconds).toBe(3600);
    expect(result.cache!.max_entries).toBe(10000);
  });

  // -----------------------------------------------------------------------
  // Policy condition types
  // -----------------------------------------------------------------------
  it.each([
    { type: "contains", field: "prompt", value: "secret", case_sensitive: false },
    { type: "regex", field: "response", value: "\\d{3}-\\d{2}-\\d{4}", case_sensitive: true },
    { type: "injection_score", threshold: 0.9 },
    { type: "pii_detected", entities: ["email"] },
    { type: "length_exceeds", field: "all", value: 5000 },
  ] as const)("accepts policy condition type=$type", (condition) => {
    const cfg = minimalConfig({
      policies: [
        { name: "test-policy", on: "request", action: "block", condition },
      ],
    });
    const result = bastionConfigSchema.safeParse(cfg);
    expect(result.success).toBe(true);
  });

  // -----------------------------------------------------------------------
  // Provider refinements
  // -----------------------------------------------------------------------
  it("rejects config when providers.primary is not in definitions", () => {
    const cfg = {
      version: "1",
      proxy: { port: 4000 },
      providers: {
        primary: "missing",
        definitions: {
          openai: { api_key: "sk-test-1234" },
        },
      },
    };
    const result = bastionConfigSchema.safeParse(cfg);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain(
        "providers.primary must reference a provider defined in providers.definitions",
      );
    }
  });

  it("rejects config when providers.fallback is not in definitions", () => {
    const cfg = {
      version: "1",
      proxy: { port: 4000 },
      providers: {
        primary: "openai",
        fallback: "missing",
        definitions: {
          openai: { api_key: "sk-test-1234" },
        },
      },
    };
    const result = bastionConfigSchema.safeParse(cfg);
    expect(result.success).toBe(false);
    if (!result.success) {
      const messages = result.error.issues.map((i) => i.message);
      expect(messages).toContain(
        "providers.fallback must reference a provider defined in providers.definitions",
      );
    }
  });

  // -----------------------------------------------------------------------
  // Auth defaults
  // -----------------------------------------------------------------------
  it("defaults auth to { enabled: false, tokens: [] }", () => {
    const result = bastionConfigSchema.parse(minimalConfig());
    expect(result.auth).toEqual({ enabled: false, tokens: [] });
  });

  // -----------------------------------------------------------------------
  // Empty policies array
  // -----------------------------------------------------------------------
  it("accepts an empty policies array", () => {
    const result = bastionConfigSchema.safeParse(
      minimalConfig({ policies: [] }),
    );
    expect(result.success).toBe(true);
  });
});
