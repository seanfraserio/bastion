import { createServer } from "../../server.js";
import { createMockProviderBackend, MockProviderBackend } from "./mock-provider-backend.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface TestServer {
  url: string;
  close: () => Promise<void>;
  mockBackend: MockProviderBackend;
  configPath: string;
}

export async function createTestServer(configOverrides?: Record<string, unknown>): Promise<TestServer> {
  const mockBackend = await createMockProviderBackend();

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "bastion-test-"));
  const configPath = path.join(tmpDir, "bastion.yaml");

  const config = {
    version: "1",
    proxy: { port: 3999, host: "127.0.0.1", log_level: "error" },
    providers: {
      primary: "anthropic",
      definitions: {
        anthropic: { api_key: "test-key", base_url: mockBackend.url, timeout_ms: 5000 },
        openai: { api_key: "test-key", base_url: mockBackend.url, timeout_ms: 5000 },
      },
    },
    auth: { enabled: false, tokens: [] },
    cache: { enabled: false },
    rate_limits: { enabled: false },
    policies: [],
    audit: { enabled: false, output: "stdout", include_request_body: false, include_response_body: false },
    ...configOverrides,
  };

  // Write as JSON since YAML is a superset of JSON
  fs.writeFileSync(configPath, JSON.stringify(config));

  const { app } = await createServer(configPath);
  await app.listen({ port: 0, host: "127.0.0.1" });
  const addr = app.server.address() as { port: number };

  return {
    url: `http://127.0.0.1:${addr.port}`,
    close: async () => {
      await app.close();
      await mockBackend.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    },
    mockBackend,
    configPath,
  };
}
