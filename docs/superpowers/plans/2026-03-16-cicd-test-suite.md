# CI/CD Test Suite Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete test suite (unit + integration + E2E) with CI pipelines and per-package coverage thresholds.

**Architecture:** Three test layers — unit tests fill all coverage gaps, integration tests verify middleware chain interactions, E2E tests spin up a real Fastify server with mock provider backends. Shared test helpers eliminate duplication. Vitest with v8 coverage provider enforces thresholds per package.

**Tech Stack:** Vitest 2.x, @vitest/coverage-v8, Fastify (for E2E), Node.js test utilities

---

## Chunk 1: Test Infrastructure

### Task 1: Install coverage dependency and create vitest configs

**Files:**
- Modify: `packages/proxy/package.json`
- Modify: `packages/config/package.json`
- Modify: `packages/cli/package.json`
- Modify: `packages/sdk/package.json`
- Create: `packages/proxy/vitest.config.ts`
- Create: `packages/config/vitest.config.ts`
- Create: `packages/cli/vitest.config.ts`
- Create: `packages/sdk/vitest.config.ts`
- Create: `vitest.workspace.ts`

- [ ] **Step 1:** Add `@vitest/coverage-v8` to root devDependencies and run `pnpm install`
- [ ] **Step 2:** Create `vitest.workspace.ts` at root
- [ ] **Step 3:** Create per-package `vitest.config.ts` files with coverage thresholds:
  - proxy: 90/85/90 (lines/branches/functions)
  - config: 90/85/90
  - cli: 80/75/80
  - sdk: 80/75/80
- [ ] **Step 4:** Verify `pnpm test` still passes
- [ ] **Step 5:** Commit

### Task 2: Create shared test helpers

**Files:**
- Create: `packages/proxy/src/__tests__/helpers/mock-context.ts`
- Create: `packages/proxy/src/__tests__/helpers/mock-provider.ts`
- Create: `packages/proxy/src/__tests__/helpers/mock-provider-backend.ts`
- Create: `packages/proxy/src/__tests__/helpers/test-server.ts`

- [ ] **Step 1:** Create `mock-context.ts` — `makeMockContext(overrides?)` returning a valid PipelineContext with sensible defaults
- [ ] **Step 2:** Create `mock-provider.ts` — `createMockProvider(responses?)` returning an IProvider that records calls
- [ ] **Step 3:** Create `mock-provider-backend.ts` — `createMockProviderBackend()` starting an HTTP server that mimics Anthropic `/v1/messages` and OpenAI `/v1/chat/completions`
- [ ] **Step 4:** Create `test-server.ts` — `createTestServer(configOverrides?)` starting a real Bastion Fastify server with mock provider backend
- [ ] **Step 5:** Commit

### Task 3: Update existing tests to use shared helpers

**Files:**
- Modify: `packages/proxy/src/middleware/rate-limit.test.ts`
- Modify: `packages/proxy/src/middleware/cache.test.ts`
- Modify: `packages/proxy/src/middleware/injection.test.ts`
- Modify: `packages/proxy/src/middleware/policy.test.ts`
- Modify: `packages/proxy/src/pipeline/index.test.ts`

- [ ] **Step 1:** Replace all 5 duplicated `makeMockContext` implementations with import from `__tests__/helpers/mock-context.ts`
- [ ] **Step 2:** Run `pnpm test` to verify all 33 existing tests still pass
- [ ] **Step 3:** Commit

---

## Chunk 2: Unit Tests — Proxy Package

### Task 4: Provider unit tests

**Files:**
- Create: `packages/proxy/src/providers/anthropic.test.ts`
- Create: `packages/proxy/src/providers/openai.test.ts`
- Create: `packages/proxy/src/providers/ollama.test.ts`
- Create: `packages/proxy/src/providers/bedrock.test.ts`

Tests for each provider (mock global fetch with vi.fn()):
- **anthropic.test.ts**: supports() returns true for claude-* models, forward() sends correct headers (x-api-key, anthropic-version), normalizes response (content[].text → content string, usage → tokens), estimateCost() uses lookup table, throws when apiKey missing
- **openai.test.ts**: supports() returns true for gpt-*/o3 models, forward() sends Bearer auth, normalizes response (choices[0].message.content, usage.prompt_tokens), estimateCost()
- **ollama.test.ts**: supports() always true, forward() sends to /api/chat, no auth headers, estimateCost() always 0
- **bedrock.test.ts**: forward() throws NotImplementedError, supports() returns false

- [ ] **Step 1:** Write all 4 provider test files with mocked fetch
- [ ] **Step 2:** Run tests, verify all pass
- [ ] **Step 3:** Commit

### Task 5: Router and fallback router tests

**Files:**
- Create: `packages/proxy/src/router.test.ts`
- Create: `packages/proxy/src/fallback/router.test.ts`

- [ ] **Step 1:** Write `router.test.ts`: /v1/messages → anthropic, /v1/chat/completions → openai, unknown → primary, /v1/messages_evil doesn't match
- [ ] **Step 2:** Write `fallback/router.test.ts`: primary success, primary 429 + fallback, primary 500 + fallback, no fallback rethrows, both fail, primary 400 no fallback attempt
- [ ] **Step 3:** Run tests, verify pass
- [ ] **Step 4:** Commit

### Task 6: Audit and PII redact middleware tests

**Files:**
- Create: `packages/proxy/src/middleware/audit.test.ts`
- Create: `packages/proxy/src/middleware/pii-redact.test.ts`

- [ ] **Step 1:** Write `audit.test.ts`: file output appends JSONL, stdout output uses console.log, AuditEntry has all fields, include_request_body/response_body flags, Lantern POST with auth, HTTP endpoint warning
- [ ] **Step 2:** Write `pii-redact.test.ts`: always returns continue with unmodified ctx
- [ ] **Step 3:** Run tests, verify pass
- [ ] **Step 4:** Commit

### Task 7: Server unit tests

**Files:**
- Create: `packages/proxy/src/server.test.ts`

- [ ] **Step 1:** Write `server.test.ts`: auth blocks without token, allows with valid token, /health allowed unauthenticated (returns only status), /stats requires auth, PipelineBlockedError → 403, generic error → sanitized 500, health/stats response shapes
- [ ] **Step 2:** Run tests, verify pass
- [ ] **Step 3:** Commit

---

## Chunk 3: Unit Tests — Config, CLI, SDK

### Task 8: Config schema and watcher tests

**Files:**
- Create: `packages/config/src/schema.test.ts`
- Create: `packages/config/src/watcher.test.ts`

- [ ] **Step 1:** Write `schema.test.ts`: defaults applied (port 4000, host 127.0.0.1), invalid log_level rejected, policy condition types, provider reference validation, auth defaults
- [ ] **Step 2:** Write `watcher.test.ts`: callback fires on change, debounce, cleanup function
- [ ] **Step 3:** Run tests, verify pass
- [ ] **Step 4:** Commit

### Task 9: CLI command tests

**Files:**
- Create: `packages/cli/src/commands/validate.test.ts`
- Create: `packages/cli/src/commands/start.test.ts`
- Create: `packages/cli/src/commands/test.test.ts`
- Create: `packages/cli/src/commands/status.test.ts`

Mock dependencies (loadConfig, createServer, fetch) with vi.mock():
- **validate.test.ts**: valid config prints sections, API keys masked (last 4 chars), invalid config exits 1
- **start.test.ts**: loads config, calls createServer, logs startup message
- **test.test.ts**: sends POST with expected body, prints response + latency, connection refused handled
- **status.test.ts**: fetches /health and /stats, prints output, connection refused handled

- [ ] **Step 1:** Write all 4 CLI test files
- [ ] **Step 2:** Run tests, verify pass
- [ ] **Step 3:** Commit

### Task 10: SDK client tests

**Files:**
- Create: `packages/sdk/src/client.test.ts`

- [ ] **Step 1:** Write `client.test.ts`: health() returns data on 200, throws on non-200, stats() same pattern, timeout works, trailing slash stripped
- [ ] **Step 2:** Run tests, verify pass
- [ ] **Step 3:** Commit

---

## Chunk 4: Integration Tests

### Task 11: Pipeline and middleware chain integration tests

**Files:**
- Create: `packages/proxy/src/__tests__/integration/pipeline-integration.test.ts`
- Create: `packages/proxy/src/__tests__/integration/cache-integration.test.ts`
- Create: `packages/proxy/src/__tests__/integration/policy-injection-integration.test.ts`
- Create: `packages/proxy/src/__tests__/integration/fallback-integration.test.ts`
- Create: `packages/proxy/src/__tests__/integration/rate-limit-integration.test.ts`

Uses real middleware classes with mock provider (no HTTP, no server — pure pipeline tests):
- **pipeline-integration.test.ts**: middleware chain order verified via recording middleware, cache hit skips provider, policy block stops early
- **cache-integration.test.ts**: miss→hit cycle, cross-tenant isolation (different agentName), temperature produces different key, TTL expiry
- **policy-injection-integration.test.ts**: injection score flows to policy condition, high score + block → PipelineBlockedError, low score → continues
- **fallback-integration.test.ts**: primary 429 → fallback succeeds → ctx.fallbackUsed=true recorded in audit
- **rate-limit-integration.test.ts**: under limit succeeds, over limit blocked before provider, different IPs independent

- [ ] **Step 1:** Write all 5 integration test files using shared helpers
- [ ] **Step 2:** Run tests, verify pass
- [ ] **Step 3:** Commit

---

## Chunk 5: E2E Tests and CI Pipelines

### Task 12: E2E tests

**Files:**
- Create: `packages/proxy/src/__tests__/e2e/proxy-e2e.test.ts`
- Create: `packages/proxy/src/__tests__/e2e/config-reload-e2e.test.ts`

Uses createTestServer() + createMockProviderBackend() — real HTTP requests:
- **proxy-e2e.test.ts**: Anthropic proxy pass-through 200, OpenAI proxy 200, auth 401 without token, auth 401 invalid token, auth 200 valid token, policy block 403, rate limit 429, cache hit (verify via stats), health 200, stats 200 with counter
- **config-reload-e2e.test.ts**: start server, modify config file, send SIGHUP, verify new config

- [ ] **Step 1:** Write both E2E test files
- [ ] **Step 2:** Run tests, verify pass
- [ ] **Step 3:** Commit

### Task 13: Update CI pipelines

**Files:**
- Modify: `.github/workflows/ci.yml`
- Create: `packages/enterprise/.github/workflows/ci.yml`

- [ ] **Step 1:** Update OSS CI to add coverage, audit, upload artifacts
- [ ] **Step 2:** Create enterprise CI that clones OSS, installs enterprise, runs tests with coverage
- [ ] **Step 3:** Commit and push both repos

### Task 14: Final verification

- [ ] **Step 1:** Run full suite: `pnpm build && pnpm typecheck && pnpm test -- --coverage`
- [ ] **Step 2:** Verify coverage meets thresholds for all packages
- [ ] **Step 3:** Commit any remaining fixes, push to both repos, publish npm 0.1.2
