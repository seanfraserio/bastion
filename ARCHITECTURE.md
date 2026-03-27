# Bastion Architecture

## 1. Overview

Bastion is an open-source security gateway for AI agent traffic. It sits between your application and LLM providers (Anthropic, OpenAI, Ollama, Bedrock), enforcing rate limits, content policies, prompt-injection detection, PII redaction, caching, and audit logging on every request. Bastion is the second pillar of the **Forge-Bastion-Lantern trilogy**: Forge defines agents as code, Bastion protects and governs the traffic those agents produce, and Lantern observes the resulting traces and metrics. Together they share a unified `bastion.yaml` configuration surface.

---

## 2. System Architecture Diagram

```
                                    BASTION PROXY (Fastify)
                                   ┌──────────────────────────────────────────────────────────────┐
                                   │                                                              │
┌─────────────┐    Auth Hook       │  REQUEST PHASE                       RESPONSE PHASE          │    ┌──────────────┐
│             │   ┌──────────┐     │  ┌───────────┐ ┌───────────┐         ┌───────────┐           │    │              │
│  Your App   │──▶│ Bearer / │────▶│  │ Rate      │▶│ Injection │──┐      │ Cache     │           │    │  LLM         │
│  (Agent)    │   │ x-api-key│     │  │ Limit     │ │ Detector  │  │      │ (store)   │           │    │  Provider    │
│             │   └──────────┘     │  └───────────┘ └───────────┘  │      └─────┬─────┘           │    │              │
│ x-bastion-  │        │          │       │ 429          │         │            │                  │    │  Anthropic   │
│  agent:     │        │ 401      │       │ block        │ score   │            ▼                  │    │  OpenAI      │
│  team:      │        ▼          │       ▼              ▼         │      ┌───────────┐           │    │  Ollama      │
│  env:       │   Reject if       │  ┌───────────┐ ┌───────────┐  │      │ PII       │           │    │  Bedrock     │
└─────────────┘   invalid         │  │ Policy    │ │ Cache     │  │      │ Redact    │           │    │  (stub)      │
                                   │  │ (request) │ │ (lookup)  │  │      │ (response)│           │    │              │
                                   │  └─────┬─────┘ └─────┬─────┘  │      └─────┬─────┘           │    └──────┬───────┘
                                   │   403  │        hit ──┘   miss │            │                  │           │
                                   │   block│   short-circuit  │   │      ┌───────────┐           │           │
                                   │        ▼                  │   │      │ Policy    │           │           │
                                   │  ┌─────────────────────┐  │   │      │ (response)│           │           │
                                   │  │  Provider Router    │◀─┘   │      └─────┬─────┘           │           │
                                   │  │  primary ──▶ forward │─────────────────▶│                  │───────────┘
                                   │  │  429/5xx ──▶ fallback│     │      ┌───────────┐           │
                                   │  └─────────────────────┘     │      │ Audit     │           │
                                   │                               │      │ (JSONL /  │──▶ Lantern
                                   │                               │      │  stdout / │   (traces)
                                   │                               │      │  HTTP)    │
                                   │                               │      └───────────┘           │
                                   │                               │            │                  │
                                   └───────────────────────────────┴────────────┼──────────────────┘
                                                                               │
                                                                               ▼
                                                                         Response Out
```

**Key endpoints:**
- `POST /v1/messages` -- Anthropic-format proxy
- `POST /v1/chat/completions` -- OpenAI-format proxy
- `GET  /health` -- Health check (limited info for unauthenticated callers)
- `GET  /stats` -- Request/cache statistics

### Edge Proxy Mode

When `upstream` is configured instead of `providers`, Bastion operates in **edge mode**. The middleware pipeline runs identically, but the terminal action forwards to an upstream Bastion proxy instead of directly to an AI provider:

```
┌─ Customer Site ──────────────────────────┐
│                                          │
│  AI Agents ──▶ Local Bastion (edge mode) │
│                  │ local auth             │
│                  │ local middleware        │
│                  │ local cache             │
│                  │ local audit             │
│                  │                        │
└──────────────────┼────────────────────────┘
                   │ HTTPS
                   ▼
┌─ Cloud ──────────────────────────────────┐
│  Cloud Bastion (data-plane)              │
│    │ tenant auth (proxy_key)             │
│    │ billing / usage tracking            │
│    │ per-agent tracking (forwarded hdrs) │
│    │ cloud middleware pipeline            │
│    │ provider routing                    │
│    ▼                                     │
│  AI Providers (Anthropic, OpenAI, etc.)  │
└──────────────────────────────────────────┘
```

The `upstream` and `providers` sections are mutually exclusive. See `packages/proxy/src/upstream/provider.ts` for the `UpstreamProvider` implementation.

---

## 3. Package Architecture

```
bastion (monorepo root, pnpm workspaces)
│
├── @openbastion-ai/cli ──────────── CLI binary (`bastion start`, `validate`, `test`, `status`)
│   ├── depends on @openbastion-ai/proxy
│   └── depends on @openbastion-ai/config
│
├── @openbastion-ai/proxy ────────── Core proxy server (Fastify, pipeline, middleware, providers)
│   └── depends on @openbastion-ai/config
│
├── @openbastion-ai/config ───────── Configuration schema, YAML loader, env-var interpolation, watcher
│   └── (leaf package -- no internal deps)
│
├── @openbastion-ai/sdk ──────────── Typed admin API client (health, stats)
│   └── (standalone -- no internal deps)
│
└── @openbastion-ai/enterprise ───── Enterprise features (BUSL-1.1, private)
    └── (standalone -- no internal deps)
```

| Package | Description |
|---------|-------------|
| `@openbastion-ai/config` | Zod-validated schema for `bastion.yaml`, YAML loader with `${ENV_VAR}` interpolation, and file-system watcher for hot reload. |
| `@openbastion-ai/proxy` | The core proxy server: Fastify HTTP layer, middleware pipeline, provider router with fallback, and all six middleware stages. |
| `@openbastion-ai/cli` | Commander-based CLI exposing `bastion start`, `bastion validate`, `bastion test`, and `bastion status` commands. |
| `@openbastion-ai/sdk` | Zero-dependency TypeScript client for the proxy's admin API (`/health`, `/stats`). |
| `@openbastion-ai/enterprise` | Enterprise-only features under BUSL-1.1 (private repo). |

---

## 4. Pipeline Architecture

### The PipelineContext Object

Every request creates a `PipelineContext` that flows through the entire pipeline:

```typescript
interface PipelineContext {
  id: string;                           // Unique pipeline execution ID (UUIDv4)
  requestId: string;                    // From x-request-id header or generated
  agentName?: string;                   // From x-bastion-agent header
  teamName?: string;                    // From x-bastion-team header
  environment: string;                  // From x-bastion-env header (default: "production")
  sourceIp?: string;                    // Client IP address
  provider: ProviderName;               // "anthropic" | "openai" | "ollama" | "bedrock"
  model: string;                        // Model name from request body
  startTime: number;                    // Unix timestamp for duration calculation
  request: NormalizedRequest;           // Provider-agnostic request representation
  response?: NormalizedResponse;        // Populated after provider forward
  decisions: PolicyDecision[];          // Accumulated policy evaluation results
  cacheHit: boolean;                    // Whether response came from cache
  fallbackUsed: boolean;               // Whether fallback provider was used
  inputTokens?: number;                // Token usage from provider response
  outputTokens?: number;               // Token usage from provider response
  estimatedCostUsd?: number;           // Cost estimate based on model pricing
  metadata: Record<string, unknown>;   // Extensible metadata (injectionScore, cacheKey, etc.)
}
```

### Middleware Interface

Each middleware implements a three-field interface:

```typescript
interface PipelineMiddleware {
  name: string;                                        // Human-readable name
  phase: "request" | "response" | "both";              // When to run
  process(ctx: PipelineContext): Promise<PipelineMiddlewareResult>;
}
```

### The Three Possible Results

Every middleware returns one of:

| Result | Effect |
|--------|--------|
| `{ action: "continue", ctx }` | Pass the (possibly modified) context to the next middleware. |
| `{ action: "block", reason, statusCode }` | Immediately terminate the pipeline, throw `PipelineBlockedError`. |
| `{ action: "short-circuit", response }` | Skip the provider call and remaining request-phase middleware; jump to response phase. |

### Middleware Registration and Execution Order

Middleware is registered via `pipeline.use(middleware)` in a fixed order determined at startup in `buildPipeline()`. The pipeline runs in two phases:

**Phase 1 -- Request:** Iterates all middleware where `phase === "request"` or `phase === "both"`, in registration order.

**Provider Forward:** If no middleware short-circuited, the `forwardFn` calls the provider router.

**Provider Forward:** In direct mode, the `forwardFn` calls the provider router. In edge mode, it calls `UpstreamProvider.forward()` which forwards to the upstream Bastion proxy. The pipeline is agnostic to the target.

**Phase 2 -- Response:** Iterates all middleware where `phase === "response"` or `phase === "both"`, in registration order.

### Full Pipeline Flow

```
Request In
    │
    ▼
┌──────────────────┐
│   Rate Limit     │──── 429 Block (if bucket exhausted)
│   (request)      │     Key: agent name or source IP
│                  │     Token bucket with MAX_BUCKETS=10,000 eviction
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   Injection      │──── Computes weighted injection score (0.0-1.0)
│   Detector       │     Stores score in ctx.metadata.injectionScore
│   (request)      │     Does NOT block -- policy middleware handles thresholds
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   Policy         │──── Evaluates all policies with on:"request" or on:"both"
│   (request)      │     Condition types: contains, regex, injection_score,
│                  │       length_exceeds, pii_detected (enterprise stub)
│                  │     Actions: block (403), warn, redact, tag
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   Cache          │──── SHA-256 keyed by model+messages+temp+maxTokens
│   (request)      │       +agentName+teamName+environment
│                  │     HIT:  short-circuit with deep-cloned cached response
│                  │     MISS: store cacheKey in ctx.metadata, continue
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   PII Redact     │──── OSS: pass-through stub
│   (request)      │     Enterprise: ML-based PII detection + redaction
└────────┬─────────┘
         │
         ▼
  ┌──────────────────────────────────────────────┐
  │              Provider Router                  │
  │                                              │
  │  1. Forward to primary provider              │
  │  2. On 429 or 5xx AND fallback configured:   │
  │     → Forward to fallback provider           │
  │  3. Set ctx.inputTokens, outputTokens,       │
  │     estimatedCostUsd                         │
  │  4. Set ctx.fallbackUsed = true if needed    │
  └──────────────────────┬───────────────────────┘
                         │
                         ▼
┌──────────────────┐
│   Cache          │──── Store response if not a cache hit
│   (response)     │     Evicts expired entries, then oldest if at capacity
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   PII Redact     │──── OSS: pass-through stub
│   (response)     │     Enterprise: scan + redact PII in response content
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   Policy         │──── Evaluates all policies with on:"response" or on:"both"
│   (response)     │     Can block outbound responses (e.g., response content filtering)
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│   Audit          │──── Builds AuditEntry with duration, tokens, cost, decisions
│   (response)     │     Output modes: JSONL file, stdout, HTTP
│                  │     Optionally includes request/response bodies
│                  │     Fire-and-forget span POST to Lantern if enabled
└────────┬─────────┘
         │
         ▼
Response Out
```

---

## 5. Provider Architecture

### The IProvider Interface

All providers implement a uniform interface:

```typescript
interface IProvider {
  name: ProviderName;
  forward(request: NormalizedRequest, rawBody: unknown, config: ProviderConfig): Promise<NormalizedResponse>;
  supports(model: string): boolean;
  estimateCost(inputTokens: number, outputTokens: number, model: string): number;
}
```

### Request Normalization

The server normalizes all incoming requests into a `NormalizedRequest` before entering the pipeline:

- **Anthropic format** (`/v1/messages`): Messages are extracted directly; `system` field becomes `systemPrompt`.
- **OpenAI format** (`/v1/chat/completions`): System-role messages are separated into `systemPrompt`; remaining messages become the normalized array.

Both formats produce the same internal structure:

```typescript
interface NormalizedRequest {
  model: string;
  messages: NormalizedMessage[];   // role + content + rawContent
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: NormalizedTool[];
  stream: boolean;
  rawBody: unknown;                // Original body preserved for pass-through
}
```

### Response Normalization

Each provider extracts a `NormalizedResponse` from its native response format:

```typescript
interface NormalizedResponse {
  content: string;                 // Concatenated text content
  stopReason?: string;             // "stop", "max_tokens", etc.
  inputTokens: number;             // From provider usage data
  outputTokens: number;            // From provider usage data
  rawBody: unknown;                // Original response preserved for client
}
```

### Cost Estimation

Each provider implements per-model cost tables (cost per million tokens):

| Provider | Models | Input | Output |
|----------|--------|-------|--------|
| Anthropic | claude-opus-4-6 | $15.00 | $75.00 |
| Anthropic | claude-sonnet-4-6 | $3.00 | $15.00 |
| Anthropic | claude-haiku-4-5-20251001 | $0.80 | $4.00 |
| OpenAI | gpt-4o | $5.00 | $15.00 |
| OpenAI | gpt-4o-mini | $0.15 | $0.60 |
| OpenAI | o3-mini | $1.10 | $4.40 |
| Ollama | (any) | $0.00 | $0.00 |

### The Fallback Router

The `ProviderRouter` implements automatic failover:

1. Forward the request to the **primary** provider.
2. If the primary returns **HTTP 429** (rate limited) or **5xx** (server error), and a `fallback` provider is configured, retry with the fallback.
3. Set `ctx.fallbackUsed = true` so audit logs record the failover.
4. If both primary and fallback fail, throw `ProviderError` with HTTP 502.

### Supported Providers

| Provider | Status | API Endpoint | Auth |
|----------|--------|-------------|------|
| Anthropic | Complete | `POST /v1/messages` | `x-api-key` header |
| OpenAI | Complete | `POST /v1/chat/completions` | `Bearer` token |
| Ollama | Complete | `POST /api/chat` | None (local) |
| Bedrock | Stub | -- | -- |

---

## 6. Configuration Architecture

### bastion.yaml Schema Overview

```yaml
version: "1"

proxy:
  port: 4000
  host: "127.0.0.1"
  log_level: "info"             # debug | info | warn | error

auth:
  enabled: true
  tokens:
    - "${BASTION_API_TOKEN}"    # Environment variable interpolation

providers:
  primary: "anthropic"
  fallback: "openai"            # Optional -- used on 429/5xx
  definitions:
    anthropic:
      api_key: "${ANTHROPIC_API_KEY}"
      base_url: "https://api.anthropic.com"   # Optional
      timeout_ms: 30000                       # Optional
    openai:
      api_key: "${OPENAI_API_KEY}"

cache:
  enabled: true
  strategy: "exact"             # exact | semantic (enterprise)
  ttl_seconds: 3600
  max_entries: 10000

rate_limits:
  enabled: true
  requests_per_minute: 60
  tokens_per_minute: 100000     # Configured but not yet enforced
  agents:
    - name: "my-agent"
      requests_per_minute: 120

policies:
  - name: "block-injections"
    on: "request"
    action: "block"
    condition:
      type: "injection_score"
      threshold: 0.5
  - name: "no-secrets"
    on: "request"
    action: "block"
    condition:
      type: "regex"
      field: "prompt"
      value: "sk-[a-zA-Z0-9]{40,}"

audit:
  enabled: true
  output: "file"                # file | stdout | http
  file_path: "./audit.jsonl"
  include_request_body: false
  include_response_body: false

lantern:
  enabled: false
  endpoint: "https://lantern.example.com/v1/spans"
  agent_name: "my-agent"
  api_key: "${LANTERN_API_KEY}"
```

### Environment Variable Interpolation

All `${ENV_VAR}` tokens in the YAML are replaced with `process.env` values before parsing. If a referenced variable is missing, the loader throws an error with a sanitized message (the variable name is logged at debug level only, not exposed to end users).

### Zod Validation

The configuration is validated using a Zod schema (`bastionConfigSchema`) with four refinements:

1. `upstream` and `providers` are mutually exclusive.
2. At least one of `upstream` or `providers` must be configured.
3. `providers.primary` (if providers set) must reference a key in `providers.definitions`.
4. `providers.fallback` (if set) must also reference a key in `providers.definitions`.

Policy conditions use a Zod discriminated union on the `type` field, supporting five condition types: `contains`, `regex`, `injection_score`, `pii_detected`, and `length_exceeds`.

### Hot Reload

Sending `SIGHUP` to the proxy process triggers a full config reload:

1. Re-read and re-validate `bastion.yaml`.
2. Rebuild the entire pipeline (new middleware instances, new provider router).
3. Swap the pipeline atomically (in-flight requests complete on the old pipeline).

### Auth Section

When `auth.enabled` is true, every request (except `GET /health`) must include a valid token via either `Authorization: Bearer <token>` or `x-api-key: <token>`. Tokens are matched against the `auth.tokens` array. Unauthenticated callers receive HTTP 401.

---

## 7. Security Architecture

### Authentication

- **Bearer token or x-api-key header** validated against a configured allow-list.
- `GET /health` always returns `{ status: "ok" }` for unauthenticated callers, but includes `version` and `uptime` only for authenticated callers.
- Tokens support environment variable interpolation so secrets are never stored in YAML files.

### ReDoS Protection

Policy regex patterns are validated at startup with `validateRegexSafety()`:

- Detects nested quantifiers (e.g., `(a+)+`, `(a*)*`) that cause catastrophic backtracking.
- Unsafe patterns are logged as warnings and treated as non-matching -- they never execute.
- All safe patterns are pre-compiled into `RegExp` objects at construction time, not per-request.

### Rate Limiting

- **Token bucket algorithm** keyed by agent name (if configured) or source IP.
- Buckets auto-refill based on elapsed time since last refill.
- `MAX_BUCKETS = 10,000` with LRU-style eviction (oldest `lastRefill` is removed) to prevent memory exhaustion from IP-based attacks.
- Returns HTTP 429 with a descriptive error when the bucket is exhausted.

### Cache Isolation

Cache keys are scoped by `agentName + teamName + environment` in addition to the request content. This prevents one agent's cached responses from being served to another agent or team with different access controls.

### Error Sanitization

- Provider errors are caught and re-thrown as generic `ProviderError` with a sanitized message (`"Provider request failed"`).
- The `requestId` is included in error responses so operators can correlate with audit logs, but raw provider error details are never leaked to clients.

### API Key Validation

API keys are validated at startup to ensure they are configured before making upstream calls.

### Audit Logging

Every request produces a structured `AuditEntry` (JSONL format) containing: request ID, agent/team/environment, provider, model, token usage, cost estimate, cache hit status, fallback status, all policy decisions, duration, and overall status. Request/response bodies can be optionally included.

---

## 8. Trilogy Integration

```
┌────────────────┐         ┌────────────────┐         ┌────────────────┐
│     FORGE      │         │    BASTION     │         │    LANTERN     │
│                │         │                │         │                │
│  Define agents │────────▶│  Protect &     │────────▶│  Observe &     │
│  as code       │         │  govern LLM    │         │  analyze       │
│                │         │  traffic       │         │  traces        │
│  forge.yaml    │         │                │         │                │
│  base_url:     │         │  bastion.yaml  │         │  Trace spans   │
│   localhost:   │         │  Rate limits   │         │  Metrics       │
│   4000         │         │  Policies      │         │  Dashboards    │
│                │         │  Cache         │         │                │
└────────────────┘         └────────────────┘         └────────────────┘
        │                         │                          ▲
        │                         │                          │
        │    ┌────────────────────┘                          │
        │    │                                               │
        ▼    ▼                                               │
   bastion.yaml                                    Audit spans via
   (shared config)                                 HTTP POST to
                                                   Lantern endpoint
```

### Data Flow

1. **Forge** defines an AI agent with `base_url: http://localhost:4000`, routing all LLM calls through the local Bastion proxy.
2. **Bastion** intercepts every request, applies the full middleware pipeline (rate limiting, injection detection, policy enforcement, caching, PII redaction), forwards to the LLM provider, and constructs a structured audit entry.
3. **Lantern** receives audit spans from Bastion via fire-and-forget HTTP POST to the configured `lantern.endpoint`. Each span contains the full `AuditEntry` -- request metadata, token usage, cost, policy decisions, cache hit status, and duration.

The three tools converge on shared identifiers: the `agentName` (set by Forge via `x-bastion-agent` header) flows through Bastion's pipeline context and appears in Lantern traces, enabling end-to-end observability from agent definition to execution metrics.

---

## 9. Testing Architecture

### Test Pyramid

The test suite spans 38 test files across all six packages:

| Layer | Count | What It Covers |
|-------|-------|----------------|
| **Unit tests** | ~28 files | Individual middleware, providers, pipeline engine, config schema/loader/watcher, CLI commands, SDK client, enterprise features |
| **Integration tests** | ~6 files | Pipeline chain (multiple middleware interacting), cache isolation across agents/teams, policy + injection detector flow, fallback provider routing, rate limit integration |
| **E2E tests** | 1 file | Real HTTP requests against a Fastify server with mock provider backends |

### Package-Level Breakdown

| Package | Test Files | Focus |
|---------|-----------|-------|
| `@openbastion-ai/proxy` | 17 | Middleware (rate-limit, cache, injection, policy, audit, pii-redact), providers (anthropic, openai, ollama, bedrock), pipeline engine, fallback router, request router, server, integration tests, E2E |
| `@openbastion-ai/config` | 3 | Schema validation, YAML loader with env-var interpolation, file watcher |
| `@openbastion-ai/cli` | 4 | start, validate, test, status commands |
| `@openbastion-ai/sdk` | 1 | BastionClient health/stats API |
| `@openbastion-ai/enterprise` | 10 | PII detector, PII redactor, injection scorer, SIEM exporter, compliance reports, RBAC policies, alerting webhooks, cluster sync, semantic cache |

### Testing Tools

- **Vitest** as the test runner across all packages.
- **`@vitest/coverage-v8`** for code coverage with per-package thresholds.
- **`fetch` mocking** via `vi.fn()` for provider and external API tests.
- **In-process Fastify** injection for E2E tests (no external processes needed).
