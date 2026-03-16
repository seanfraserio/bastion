# CI/CD Test Suite Design Spec

**Date:** 2026-03-16
**Status:** Approved

## Overview

Complete CI/CD test suite for Bastion covering unit tests, integration tests, and E2E tests across both OSS and enterprise repos. Per-package coverage thresholds enforced in CI.

## Current State

- 120 tests across 15 test files (40% file coverage)
- Enterprise well-tested (90%), proxy partially tested (37%), CLI/SDK untested (0%)
- No integration tests, no E2E tests, no coverage reporting
- CI only runs `pnpm test` with no coverage, no audit, no SAST

## Test Layers

### Layer 1 — Unit Tests (fill all gaps)

#### packages/proxy — new tests needed:

**Providers** (`providers/*.test.ts`):
- `anthropic.test.ts`: Mock fetch, test request normalization (Anthropic wire format → NormalizedRequest), response normalization, cost estimation lookup, error handling (timeout, 500, 429), API key validation (throw when missing)
- `openai.test.ts`: Same pattern — request/response normalization for OpenAI format, cost table, errors
- `ollama.test.ts`: Request mapping to `/api/chat`, zero cost, no auth headers
- `bedrock.test.ts`: Verify throws NotImplementedError

**Server** (`server.test.ts`):
- Auth middleware: blocks without token when auth.enabled, allows with valid token, allows /health unauthenticated, blocks /stats without auth
- Route registration: /v1/messages, /v1/chat/completions, /health, /stats all respond
- PipelineBlockedError → 403 response with reason
- Generic errors → 500 with sanitized message (no raw error details)
- Health response shape: `{ status: "ok" }` unauthenticated, `{ status, version, uptime }` authenticated
- Stats response shape matches StatsResponse type

**Router** (`router.test.ts`):
- `/v1/messages` → anthropic
- `/v1/chat/completions` → openai
- Unknown path → config.providers.primary
- Path matching doesn't false-match `/v1/messages_evil`

**Fallback Router** (`fallback/router.test.ts`):
- Primary succeeds → returns response, fallbackUsed=false
- Primary 429 + fallback configured → tries fallback, fallbackUsed=true
- Primary 500 + fallback configured → tries fallback
- Primary fails + no fallback → rethrows
- Both fail → throws with sanitized error message
- Primary 400 (client error) → does NOT try fallback

**Audit Middleware** (`middleware/audit.test.ts`):
- File output: appends JSONL to configured path, creates directories
- Stdout output: writes to console.log as JSON
- AuditEntry has all required fields (id, timestamp, provider, model, policies, durationMs, status)
- include_request_body/include_response_body flags work
- Lantern integration: POSTs span when enabled, includes auth header when api_key set
- Warns on HTTP (non-HTTPS) Lantern endpoint

**PII Redact Middleware** (`middleware/pii-redact.test.ts`):
- OSS mode: always returns `{ action: "continue", ctx }` (pass-through)

#### packages/config — new tests:

**Schema** (`schema.test.ts`):
- All defaults applied correctly (port 4000, host 127.0.0.1, log_level info)
- Invalid log_level rejected
- Provider definitions accept arbitrary keys
- Policy condition types validated (contains, regex, injection_score, pii_detected, length_exceeds)
- Provider reference validation: primary must exist in definitions
- Fallback reference validation: if set, must exist in definitions
- Auth schema: defaults to disabled with empty tokens array

**Watcher** (`watcher.test.ts`):
- Callback fires on file change
- Debounce prevents rapid-fire callbacks
- Returns cleanup function that stops watching

#### packages/cli — new tests:

**Validate** (`commands/validate.test.ts`):
- Valid config prints resolved sections
- API keys are masked (shows only last 4 chars)
- Invalid config prints Zod errors and exits with code 1

**Start** (`commands/start.test.ts`):
- Loads config and calls createServer
- Logs startup message with provider/cache/audit info
- Port override from CLI flag works

**Test** (`commands/test.test.ts`):
- Sends POST to /v1/messages with expected body
- Prints response and latency
- Connection refused prints friendly error message

**Status** (`commands/status.test.ts`):
- Fetches /health and /stats
- Prints formatted output
- Connection refused handled gracefully

#### packages/sdk — new tests:

**Client** (`client.test.ts`):
- health() returns HealthResponse on 200
- health() throws on non-200
- stats() returns StatsResponse on 200
- stats() throws on non-200
- Timeout via AbortSignal works
- Base URL trailing slash stripped

### Layer 2 — Integration Tests

Location: `packages/proxy/src/__tests__/integration/`

**pipeline-integration.test.ts**:
- Full middleware chain executes in correct order: rate-limit → injection → policy → cache → provider → cache → policy → audit
- Verify by using middleware that records execution order
- Cache hit skips provider call
- Policy block stops pipeline early

**auth-integration.test.ts**:
- Auth blocks before pipeline runs (no middleware side effects)
- Valid auth token allows full pipeline execution

**cache-integration.test.ts**:
- First request misses cache, hits provider
- Second identical request hits cache, skips provider
- Different agent names produce different cache keys (no cross-tenant leakage)
- Different temperature produces different cache key
- Cache entries expire after TTL

**policy-injection-integration.test.ts**:
- Injection middleware sets score in ctx.metadata
- Policy middleware with injection_score condition reads that score
- High injection score + block policy → pipeline blocked
- Low injection score → pipeline continues

**fallback-integration.test.ts**:
- Primary fails with 429 → fallback succeeds → ctx.fallbackUsed=true
- Audit entry records fallbackUsed=true

**rate-limit-integration.test.ts**:
- Requests under limit succeed through full pipeline
- Request over limit returns 429 before reaching provider
- Different source IPs get independent buckets

### Layer 3 — E2E Tests

Location: `packages/proxy/src/__tests__/e2e/`

Test infrastructure:
- `createTestServer(config)` — starts real Fastify server on random port with mock provider
- `createMockProviderBackend()` — HTTP server that mimics Anthropic/OpenAI API responses
- Tests use real HTTP requests via `fetch()`

**proxy-e2e.test.ts**:
- POST /v1/messages with valid Anthropic-format body → 200 with mock response
- POST /v1/chat/completions with valid OpenAI-format body → 200 with mock response
- Request without auth when auth enabled → 401
- Request with invalid token → 401
- Request with valid token → 200
- Request matching block policy → 403 `{ error: "blocked", reason: "..." }`
- Burst requests exceeding rate limit → 429
- Identical request twice → second served from cache (verify via stats endpoint)
- GET /health → 200 `{ status: "ok" }`
- GET /stats → 200 with totalRequests counter incremented

**config-reload-e2e.test.ts**:
- Start server with initial config
- Modify config file
- Send SIGHUP
- Verify new config takes effect (e.g., changed rate limit)

### Test Utilities

`packages/proxy/src/__tests__/helpers/`:

**mock-context.ts**:
```typescript
export function makeMockContext(overrides?: Partial<PipelineContext>): PipelineContext
```
Single source of truth — replace all 5 duplicated copies across existing test files.

**mock-provider.ts**:
```typescript
export function createMockProvider(responses?: Partial<NormalizedResponse>[]): IProvider & { calls: NormalizedRequest[] }
```
Records all calls, returns configurable responses in sequence.

**test-server.ts**:
```typescript
export async function createTestServer(configOverrides?: Partial<BastionConfig>): Promise<{ url: string; close: () => Promise<void> }>
```
Spins up real Bastion server with sensible defaults and a mock provider backend.

**mock-provider-backend.ts**:
```typescript
export async function createMockProviderBackend(): Promise<{ url: string; close: () => Promise<void>; requests: unknown[] }>
```
Simple HTTP server that mimics Anthropic `/v1/messages` and OpenAI `/v1/chat/completions` responses.

### Vitest Configuration

**Root** `vitest.workspace.ts`:
```typescript
export default defineWorkspace([
  'packages/config',
  'packages/proxy',
  'packages/cli',
  'packages/sdk',
])
```

Each package gets a `vitest.config.ts` with coverage config using `@vitest/coverage-v8`:

**packages/proxy/vitest.config.ts** (example):
```typescript
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/__tests__/**'],
      thresholds: {
        lines: 90,
        branches: 85,
        functions: 90,
      }
    }
  }
})
```

### Coverage Thresholds

| Package | Lines | Branches | Functions |
|---------|-------|----------|-----------|
| proxy | 90% | 85% | 90% |
| config | 90% | 85% | 90% |
| cli | 80% | 75% | 80% |
| sdk | 80% | 75% | 80% |
| enterprise | 70% | 65% | 70% |

### CI Pipelines

#### OSS CI (`.github/workflows/ci.yml` — enhanced)

```yaml
Trigger: push to main, all PRs
Matrix: Node 20
Steps:
  1. Checkout
  2. Setup pnpm (v9, cached store)
  3. pnpm install --frozen-lockfile
  4. pnpm typecheck
  5. pnpm lint
  6. pnpm build
  7. pnpm test -- --coverage
  8. Upload coverage artifacts
  9. pnpm audit --audit-level=high
```

Coverage thresholds enforced via vitest config (fails the test step if below threshold).

#### Enterprise CI (`bastion-enterprise/.github/workflows/ci.yml` — new)

```yaml
Trigger: push to main, all PRs
Steps:
  1. Checkout bastion (OSS) from seanfraserio/bastion
  2. Checkout bastion-enterprise into packages/enterprise/
  3. Setup pnpm, install
  4. pnpm build
  5. Run enterprise tests: cd packages/enterprise && pnpm test -- --coverage
  6. Run cross-integration tests (enterprise features integrated with OSS pipeline)
  7. Coverage check (70% threshold)
```

### File Structure (new files)

```
packages/proxy/
  vitest.config.ts
  src/__tests__/
    helpers/
      mock-context.ts
      mock-provider.ts
      test-server.ts
      mock-provider-backend.ts
    integration/
      pipeline-integration.test.ts
      auth-integration.test.ts
      cache-integration.test.ts
      policy-injection-integration.test.ts
      fallback-integration.test.ts
      rate-limit-integration.test.ts
    e2e/
      proxy-e2e.test.ts
      config-reload-e2e.test.ts
  src/providers/
    anthropic.test.ts
    openai.test.ts
    ollama.test.ts
    bedrock.test.ts
  src/middleware/
    audit.test.ts        (new)
    pii-redact.test.ts   (new)
  src/
    server.test.ts       (new)
    router.test.ts       (new)
  src/fallback/
    router.test.ts       (new)

packages/config/
  vitest.config.ts
  src/
    schema.test.ts       (new)
    watcher.test.ts      (new)

packages/cli/
  vitest.config.ts
  src/commands/
    validate.test.ts     (new)
    start.test.ts        (new)
    test.test.ts         (new)
    status.test.ts       (new)

packages/sdk/
  vitest.config.ts
  src/
    client.test.ts       (new)

packages/enterprise/
  .github/workflows/ci.yml  (new)
```
