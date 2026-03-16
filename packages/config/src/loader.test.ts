import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { loadConfig } from "./loader.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let tmpDir: string;

function writeTempYaml(filename: string, content: string): string {
  const filePath = path.join(tmpDir, filename);
  fs.writeFileSync(filePath, content, "utf-8");
  return filePath;
}

// ---------------------------------------------------------------------------
// Minimal valid YAML that satisfies the schema
// ---------------------------------------------------------------------------

const MINIMAL_YAML = `
version: "1"

proxy:
  port: 4000
  host: "127.0.0.1"
  log_level: info

providers:
  primary: anthropic
  definitions:
    anthropic:
      base_url: "https://api.anthropic.com"
      timeout_ms: 30000
`;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("loadConfig", () => {
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bastion-config-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // -----------------------------------------------------------------------
  // 1. Loads a valid minimal bastion.yaml correctly
  // -----------------------------------------------------------------------
  it("loads a valid minimal bastion.yaml correctly", async () => {
    const filePath = writeTempYaml("bastion.yaml", MINIMAL_YAML);

    const config = await loadConfig(filePath);

    expect(config.version).toBe("1");
    expect(config.proxy.port).toBe(4000);
    expect(config.proxy.host).toBe("127.0.0.1");
    expect(config.proxy.log_level).toBe("info");
    expect(config.providers.primary).toBe("anthropic");
    expect(config.providers.definitions.anthropic.base_url).toBe(
      "https://api.anthropic.com",
    );
    expect(config.providers.definitions.anthropic.timeout_ms).toBe(30000);
  });

  // -----------------------------------------------------------------------
  // 2. Throws on missing required field (version)
  // -----------------------------------------------------------------------
  it("throws on missing required field", async () => {
    const yamlWithoutVersion = `
proxy:
  port: 4000

providers:
  primary: anthropic
  definitions:
    anthropic:
      timeout_ms: 30000
`;
    const filePath = writeTempYaml("bad.yaml", yamlWithoutVersion);

    await expect(loadConfig(filePath)).rejects.toThrow(
      /Invalid Bastion configuration/,
    );
  });

  // -----------------------------------------------------------------------
  // 3. Interpolates ${ENV_VAR} from process.env
  // -----------------------------------------------------------------------
  it("interpolates environment variables", async () => {
    process.env.TEST_BASTION_API_KEY = "sk-test-12345";

    const yamlWithEnv = `
version: "1"

proxy:
  port: 4000

providers:
  primary: anthropic
  definitions:
    anthropic:
      api_key: "\${TEST_BASTION_API_KEY}"
      base_url: "https://api.anthropic.com"
      timeout_ms: 30000
`;
    const filePath = writeTempYaml("env.yaml", yamlWithEnv);

    const config = await loadConfig(filePath);

    expect(config.providers.definitions.anthropic.api_key).toBe(
      "sk-test-12345",
    );

    delete process.env.TEST_BASTION_API_KEY;
  });

  // -----------------------------------------------------------------------
  // 4. Throws when a referenced env var is missing
  // -----------------------------------------------------------------------
  it("throws when a referenced env var is missing", async () => {
    // Make sure it's definitely not set
    delete process.env.BASTION_NONEXISTENT_VAR;

    const yamlWithMissingEnv = `
version: "1"

proxy:
  port: 4000

providers:
  primary: anthropic
  definitions:
    anthropic:
      api_key: "\${BASTION_NONEXISTENT_VAR}"
      timeout_ms: 30000
`;
    const filePath = writeTempYaml("missing-env.yaml", yamlWithMissingEnv);

    await expect(loadConfig(filePath)).rejects.toThrow(
      /BASTION_NONEXISTENT_VAR.*is not set/,
    );
  });

  // -----------------------------------------------------------------------
  // 5. Throws when the config file does not exist
  // -----------------------------------------------------------------------
  it("throws when the config file does not exist", async () => {
    await expect(
      loadConfig(path.join(tmpDir, "does-not-exist.yaml")),
    ).rejects.toThrow(/Failed to read config file/);
  });

  // -----------------------------------------------------------------------
  // 6. Loads a full config with policies, cache, rate limits, audit, lantern
  // -----------------------------------------------------------------------
  it("loads a full config with all optional sections", async () => {
    const fullYaml = `
version: "1"

proxy:
  port: 4000
  host: "127.0.0.1"
  log_level: debug

providers:
  primary: anthropic
  fallback: openai
  definitions:
    anthropic:
      base_url: "https://api.anthropic.com"
      timeout_ms: 30000
    openai:
      base_url: "https://api.openai.com"
      timeout_ms: 30000

cache:
  enabled: true
  strategy: semantic
  ttl_seconds: 7200
  max_entries: 5000

rate_limits:
  enabled: true
  requests_per_minute: 1000
  tokens_per_minute: 500000
  agents:
    - name: "support-triage"
      requests_per_minute: 100
      tokens_per_minute: 50000

policies:
  - name: "block-internal-data"
    on: request
    action: block
    condition:
      type: contains
      field: prompt
      value: "INTERNAL-"
      case_sensitive: false

  - name: "block-injection"
    on: request
    action: block
    condition:
      type: injection_score
      threshold: 0.85

  - name: "redact-pii"
    on: response
    action: redact
    condition:
      type: pii_detected
      entities:
        - email
        - phone

  - name: "warn-long-response"
    on: response
    action: warn
    condition:
      type: length_exceeds
      field: response
      value: 10000

audit:
  enabled: true
  output: file
  file_path: "./logs/bastion-audit.jsonl"
  include_request_body: false
  include_response_body: false

lantern:
  enabled: false
  endpoint: "http://localhost:3000/v1/traces"
  agent_name: "bastion-proxy"
`;
    const filePath = writeTempYaml("full.yaml", fullYaml);

    const config = await loadConfig(filePath);

    // Providers
    expect(config.providers.fallback).toBe("openai");

    // Cache
    expect(config.cache?.enabled).toBe(true);
    expect(config.cache?.strategy).toBe("semantic");
    expect(config.cache?.ttl_seconds).toBe(7200);

    // Rate limits
    expect(config.rate_limits?.agents).toHaveLength(1);
    expect(config.rate_limits?.agents?.[0].name).toBe("support-triage");

    // Policies
    expect(config.policies).toHaveLength(4);
    expect(config.policies?.[0].name).toBe("block-internal-data");
    expect(config.policies?.[1].condition.type).toBe("injection_score");
    expect(config.policies?.[2].condition.type).toBe("pii_detected");
    expect(config.policies?.[3].condition.type).toBe("length_exceeds");

    // Audit
    expect(config.audit?.output).toBe("file");
    expect(config.audit?.file_path).toBe("./logs/bastion-audit.jsonl");

    // Lantern
    expect(config.lantern?.enabled).toBe(false);
    expect(config.lantern?.agent_name).toBe("bastion-proxy");
  });
});
