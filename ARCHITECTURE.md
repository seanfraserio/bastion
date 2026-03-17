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
├── @openbastion-ai/enterprise ───── Enterprise features (BUSL-1.1, private)
│   └── (standalone -- no internal deps)
│
└── @openbastion-ai/cloud ────────── Managed multi-tenant cloud proxy (private)
    ├── depends on @openbastion-ai/proxy
    └── depends on @openbastion-ai/config
```

| Package | Description |
|---------|-------------|
| `@openbastion-ai/config` | Zod-validated schema for `bastion.yaml`, YAML loader with `${ENV_VAR}` interpolation, and file-system watcher for hot reload. |
| `@openbastion-ai/proxy` | The core proxy server: Fastify HTTP layer, middleware pipeline, provider router with fallback, and all six middleware stages. |
| `@openbastion-ai/cli` | Commander-based CLI exposing `bastion start`, `bastion validate`, `bastion test`, and `bastion status` commands. |
| `@openbastion-ai/sdk` | Zero-dependency TypeScript client for the proxy's admin API (`/health`, `/stats`). |
| `@openbastion-ai/enterprise` | Enterprise-only features under BUSL-1.1: ML PII detection, LLM injection scoring, SIEM export, compliance reports, team RBAC, alerting, cluster sync, and semantic cache. |
| `@openbastion-ai/cloud` | Managed multi-tenant cloud deployment: control plane (tenant CRUD, config management, usage reporting) and data plane (tenant resolution, proxy forwarding, usage logging). |

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

The configuration is validated using a Zod schema (`bastionConfigSchema`) with two refinements:

1. `providers.primary` must reference a key in `providers.definitions`.
2. `providers.fallback` (if set) must also reference a key in `providers.definitions`.

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

In the cloud deployment, API keys are hashed with SHA-256 before storage. The data plane resolves tenants by comparing the hash of the incoming `bst_proxy_*` key against stored hashes -- raw keys are never persisted.

### Audit Logging

Every request produces a structured `AuditEntry` (JSONL format) containing: request ID, agent/team/environment, provider, model, token usage, cost estimate, cache hit status, fallback status, all policy decisions, duration, and overall status. Request/response bodies can be optionally included.

---

## 8. Cloud Architecture (Managed Proxy)

### Deployment Diagram

```
┌──────────────────┐       ┌──────────────────────────────────┐       ┌──────────────────┐
│   Tenant App     │       │         Data Plane               │       │   LLM Provider   │
│                  │       │         (Cloud Run)               │       │                  │
│  Authorization:  │──────▶│                                  │──────▶│  Anthropic /     │
│  Bearer          │       │  1. Extract bst_proxy_* key      │       │  OpenAI          │
│  bst_proxy_*     │       │  2. Hash key, query tenants DB   │       │                  │
│                  │       │  3. Load tenant config (cached)  │       └──────────────────┘
└──────────────────┘       │  4. Resolve provider + API key   │
                           │  5. Forward to LLM provider      │
                           │  6. Log usage (fire-and-forget)  │
                           │                                  │
                           └──────────────┬───────────────────┘
                                          │
                           ┌──────────────▼───────────────────┐
                           │       Cloud SQL (Postgres)        │
                           │                                  │
                           │  tenants           (identity)    │
                           │  tenant_configs    (per-tenant)  │
                           │  usage_logs        (metering)    │
                           └──────────────▲───────────────────┘
                                          │
                           ┌──────────────┴───────────────────┐
                           │       Control Plane               │
                           │       (Cloud Run)                 │
                           │                                  │
                           │  POST   /tenants          signup │
                           │  GET    /tenants/me       info   │
                           │  DELETE /tenants/me       delete │
                           │  POST   /tenants/me/rotate-keys  │
                           │  PUT    /config           update │
                           │  GET    /usage            query  │
                           │                                  │
                           └──────────────────────────────────┘
```

### Tenant Lifecycle

1. **Signup**: `POST /tenants` creates a new tenant with a generated `bst_ctrl_*` (control key) and `bst_proxy_*` (proxy key). Both keys are hashed before storage; plaintext keys are returned once.
2. **Configure**: Authenticated calls to `PUT /config` update the tenant's `bastion.yaml`-equivalent configuration stored as JSONB in `tenant_configs`.
3. **Proxy**: The tenant's application sends LLM requests to the data plane with `Authorization: Bearer bst_proxy_*`. The data plane resolves the tenant (with a 60-second in-memory cache), loads their config, and forwards to the appropriate provider using the tenant's own provider API keys.
4. **Usage Tracking**: Every request is logged to `usage_logs` with provider, model, token counts, cost estimate, status, and duration.
5. **Key Rotation**: `POST /tenants/me/rotate-keys` generates new control and proxy keys, invalidating the old ones immediately.

### Tenant Resolution

The `resolveTenant()` function performs a JOIN query across `tenants` and `tenant_configs`, filtered by `proxy_key_hash` and `status = 'active'`. Results are cached in-memory for 60 seconds to minimize database load on the hot path.

---

## 9. Enterprise Features Architecture

The `@openbastion-ai/enterprise` package provides capabilities beyond the open-source proxy, licensed under BUSL-1.1:

### ML PII Detection

- **Regex-based entity recognition** detecting: email, phone, SSN, credit card (with Luhn validation), and contextual names.
- Returns `PiiEntity[]` with type, value, position, and confidence score.
- Four redaction strategies: `mask` (`[EMAIL_REDACTED]`), `hash` (SHA-256 prefix), `tokenize` (reversible UUID tokens), and `remove`.

### LLM Injection Scoring

- Calls an external LLM classifier (Anthropic Claude Haiku or OpenAI GPT-4o-mini) to score injection likelihood (0.0-1.0) with confidence and reasoning.
- Uses Anthropic prompt caching (`cache_control: { type: "ephemeral" }`) to reduce cost for repeated scoring.
- Results are cached in-memory for 60 seconds keyed on SHA-256 of input text.
- Fails safe: returns `{ score: 0, confidence: 0 }` on any error.

### SIEM Export

- **Splunk HEC** adapter: batches events as newline-delimited JSON with `Authorization: Splunk <token>`.
- **Elastic Bulk** adapter: formats events as bulk index operations with `Authorization: ApiKey <token>`.
- Configurable batch size and flush interval with exponential backoff retry (3 attempts).

### Compliance Reports

- **SOC 2** report generation mapping to controls: CC6.1 (access control), CC7.1 (system monitoring), CC7.2 (anomaly detection), CC8.1 (change management).
- **HIPAA** report generation mapping to sections: 164.312(b) (audit controls), 164.312(a)(1) (access control), 164.312(e)(1) (transmission security), 164.530(j) (record retention).
- Both aggregate audit log entries into compliance summaries with severity classifications.

### Team RBAC

- **Policy namespace inheritance**: teams define their own policies and optionally inherit from a base namespace.
- Team policies override base policies with the same name; unoverridden base policies are inherited.
- `TeamPolicyManager` supports CRUD operations on team configurations.

### Alerting

- **Slack**: sends Block Kit-formatted messages to a webhook URL.
- **PagerDuty**: triggers events via the Events API v2 (`https://events.pagerduty.com/v2/enqueue`).
- **Webhook**: sends structured JSON to any URL with optional Bearer auth.
- All channels use exponential backoff retry and fail silently (alerting never blocks the pipeline).

### Cluster Sync

- **HTTP peer mesh**: nodes register with each other and broadcast config updates via `POST /cluster/sync`.
- Periodic health checks (default: 30 seconds) maintain cluster awareness.
- Nodes track `configVersion` (SHA-256 hash) to detect stale configs.
- Stale threshold: 3x health interval. Unreachable nodes remain in the list but are marked unhealthy.

### Semantic Cache

- **Embedding-based similarity**: computes vector embeddings via OpenAI's embeddings API (`text-embedding-3-small`).
- **Cosine similarity** comparison against all cached entries.
- Returns a cache hit when similarity exceeds the threshold (default: 0.95).
- TTL-based expiration with oldest-entry eviction at capacity.

---

## 10. Trilogy Integration

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

## 11. Database Schema

The cloud deployment uses PostgreSQL (Cloud SQL) with three tables:

### tenants

```sql
CREATE TABLE tenants (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  api_key_hash    TEXT NOT NULL,           -- SHA-256 hash of bst_ctrl_* key
  proxy_key_hash  TEXT NOT NULL,           -- SHA-256 hash of bst_proxy_* key
  provider_keys   JSONB DEFAULT '{}',     -- { "anthropic": "sk-...", "openai": "sk-..." }
  plan            TEXT DEFAULT 'team'      -- CHECK: free | team | enterprise
                  CHECK (plan IN ('free', 'team', 'enterprise')),
  status          TEXT DEFAULT 'active'    -- CHECK: active | suspended | deleted
                  CHECK (status IN ('active', 'suspended', 'deleted')),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### tenant_configs

```sql
CREATE TABLE tenant_configs (
  tenant_id   UUID REFERENCES tenants(id) ON DELETE CASCADE,
  config      JSONB NOT NULL,             -- bastion.yaml-equivalent JSON
  version     INTEGER DEFAULT 1,          -- Config version counter
  updated_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (tenant_id)
);
```

### usage_logs

```sql
CREATE TABLE usage_logs (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID REFERENCES tenants(id),
  timestamp         TIMESTAMPTZ DEFAULT NOW(),
  provider          TEXT NOT NULL,
  model             TEXT NOT NULL,
  input_tokens      INTEGER DEFAULT 0,
  output_tokens     INTEGER DEFAULT 0,
  estimated_cost_usd NUMERIC(10,6) DEFAULT 0,
  status            TEXT NOT NULL          -- CHECK: success | blocked | error
                    CHECK (status IN ('success', 'blocked', 'error')),
  duration_ms       INTEGER DEFAULT 0,
  cache_hit         BOOLEAN DEFAULT FALSE
);
```

### Indexes

```sql
CREATE INDEX idx_usage_tenant_time ON usage_logs(tenant_id, timestamp);
CREATE INDEX idx_tenants_proxy_key ON tenants(proxy_key_hash);
CREATE INDEX idx_tenants_api_key   ON tenants(api_key_hash);
CREATE INDEX idx_tenants_email     ON tenants(email);
```

### Relationships

```
tenants (1) ──── (1) tenant_configs    (1:1, CASCADE delete)
tenants (1) ──── (N) usage_logs        (1:N, tenant_id FK)
```

---

## 12. Testing Architecture

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
| `@openbastion-ai/cloud` | 1 | API key hashing |

### Testing Tools

- **Vitest** as the test runner across all packages.
- **`@vitest/coverage-v8`** for code coverage with per-package thresholds.
- **`fetch` mocking** via `vi.fn()` for provider and external API tests.
- **In-process Fastify** injection for E2E tests (no external processes needed).
