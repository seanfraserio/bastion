# Edge Proxy Mode — Design Spec

**Date:** 2026-03-26
**Status:** Approved (rev 2 — post spec review)
**Scope:** `@openbastion-ai/proxy` v0.3.0

## Summary

Add an "edge mode" to the Bastion proxy that allows a local instance to forward requests to an upstream cloud Bastion proxy instead of directly to AI providers. This enables customers to run a local proxy on their infrastructure for caching, policy enforcement, and audit while the cloud proxy handles tenant auth, billing, and provider routing.

## Motivation

Current architecture requires all client traffic to route directly to the cloud proxy over the internet. This adds latency, provides no local caching, and gives customers no on-prem control over policies or audit. A local edge proxy solves all three while keeping the cloud proxy as the central control point.

## Architecture

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
│  Cloud Bastion (data-plane, unchanged)   │
│    │ tenant auth (proxy_key)             │
│    │ billing / usage tracking            │
│    │ per-agent tracking (forwarded hdrs) │
│    │ cloud middleware pipeline            │
│    │ provider routing                    │
│    ▼                                     │
│  AI Providers (Anthropic, OpenAI, etc.)  │
└──────────────────────────────────────────┘
```

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth model | Hybrid — site-level proxy_key to cloud, agent headers forwarded for per-agent tracking | Simplicity of single credential + observability of per-agent usage |
| Middleware split | Configurable — customer enables what they want locally | Maximum flexibility; existing per-middleware enable/disable config supports this |
| Config model | Fully local bastion.yaml | Simplest for v1; cloud-managed config deferred |
| Package | Same `@openbastion-ai/proxy`, no new package | Edge mode is just "a proxy whose upstream is another proxy" |
| Approach | Dedicated `upstream` config section | Clean separation from provider concept; explicit edge mode signal |

## Config Schema

New optional `upstream` section. Mutually exclusive with `providers`.

```yaml
upstream:
  url: "https://api.bastion.cloud"        # required — upstream Bastion URL
  proxy_key: "${BASTION_PROXY_KEY}"        # required — site-level auth
  timeout_ms: 30000                        # optional, default 30000
  forward_agent_headers: true              # optional, default true
```

### Zod Schema

```typescript
const upstreamSchema = z.object({
  url: z.string().url(),
  proxy_key: z.string().min(1),
  timeout_ms: z.number().int().positive().optional().default(30000),
  forward_agent_headers: z.boolean().optional().default(true),
});
```

Top-level refinements (3 total — mutual exclusion, at-least-one, guarded provider checks):

```typescript
// Mutual exclusion: can't have both
.refine(
  (data) => !(data.upstream && data.providers),
  { message: "upstream and providers are mutually exclusive — use one or the other" }
)
// At-least-one: must have one
.refine(
  (data) => !!(data.upstream || data.providers),
  { message: "either upstream or providers must be configured" }
)
// Existing provider refinements — guarded for edge mode
.refine(
  (data) => !data.providers || data.providers.primary in data.providers.definitions,
  { message: "providers.primary must reference a defined provider" }
)
.refine(
  (data) => !data.providers || !data.providers.fallback || data.providers.fallback in data.providers.definitions,
  { message: "providers.fallback must reference a defined provider" }
)
```

The `providers` field becomes optional (currently required). Existing refinements are guarded with `!data.providers ||` to prevent crashes in edge mode.

### Full Edge Mode Config Example

```yaml
version: "1"

proxy:
  port: 3000
  host: "127.0.0.1"
  log_level: info

upstream:
  url: "https://api.bastion.cloud"
  proxy_key: "${BASTION_PROXY_KEY}"
  forward_agent_headers: true

auth:
  enabled: true
  tokens:
    - "${LOCAL_AGENT_TOKEN}"

cache:
  enabled: true
  max_entries: 5000

rate_limits:
  enabled: true
  requests_per_minute: 100

policies:
  - name: block-injections
    on: request
    condition:
      type: injection_score
      threshold: 0.9
    action: block

audit:
  enabled: true
  output: file
  file_path: ./logs/local-audit.jsonl
```

## Request Flow

### Edge Mode (upstream configured)

1. **Agent → Local proxy:** Agent sends `POST /v1/messages` with `Authorization: Bearer <local_token>`
2. **Local auth:** Constant-time token match against `auth.tokens`. Capture `x-bastion-agent`, `x-bastion-team`, `x-bastion-env` headers.
3. **Local middleware pipeline:** Runs configured subset (rate-limit → injection → policy → cache → PII redact). Any middleware can short-circuit:
   - Cache hit → return immediately, skip upstream
   - Policy block → return 403, skip upstream
   - Rate limit → return 429, skip upstream
4. **Upstream forward:** Build request to `${upstream.url}${original_path}` (e.g., `https://api.bastion.cloud/v1/messages`)
   - Set `Authorization: Bearer ${upstream.proxy_key}` (replaces agent's local token)
   - Copy `x-bastion-agent`, `x-bastion-team`, `x-bastion-env`, `x-request-id` if `forward_agent_headers: true`
   - Forward original request body verbatim (no parsing or modification)
5. **Streaming:** Upstream response streams through `createUsageTrackingStream` → agent. No buffering.
6. **Local audit:** Fire-and-forget audit entry with: agent identity, cache hit, policy decisions, duration, upstream status code, token counts (extracted from stream).
7. **Error propagation:** Upstream 401/429/5xx passed through to agent with original status code.

### Direct Mode (providers configured — unchanged)

Existing behavior. No changes.

## Code Changes

### Architecture: UpstreamProvider (implements IProvider)

The spec review identified that `server.ts` has **two separate forwarding paths**: a non-streaming path via `Pipeline.run()` → `forwardFn` and a streaming path that calls `providerRouter.getProvider()` → `provider.forwardStream()` directly. The `forwardFn` injection point only covers non-streaming.

**Solution:** Create an `UpstreamProvider` class that implements the same `IProvider` interface as `AnthropicProvider`, `OpenAIProvider`, etc. This integrates cleanly into both code paths:

- **Non-streaming:** `pipeline.run()` → `forwardFn` calls `upstreamProvider.forward(ctx)`
- **Streaming:** `providerRouter.getProvider()` returns `upstreamProvider`, existing streaming path calls `upstreamProvider.forwardStream(ctx)` unchanged

### Provider detection in edge mode

`routeToProvider(path, config)` in `router.ts` accesses `config.providers.primary` which is undefined in edge mode. In edge mode, the "provider" is inferred from the request path for middleware context only:

- `/v1/messages` → `"anthropic"` (logical provider for context/audit)
- `/v1/chat/completions` → `"openai"` (logical provider for context/audit)
- Other paths → 400 (same whitelist behavior)

This is implemented as a standalone `inferProviderFromPath(path)` utility, called by `server.ts` when `config.upstream` is set, bypassing `routeToProvider()` entirely.

### Return type: NormalizedResponse (not custom ForwardResult)

The pipeline's `ForwardFn` type requires `Promise<NormalizedResponse>` (with fields `content`, `stopReason`, `inputTokens`, `outputTokens`, `rawBody`). The `UpstreamProvider.forward()` method parses the upstream JSON response into this shape. Token counts are extracted from the upstream response body (same fields the cloud proxy returns from the real provider).

### New file: `packages/proxy/src/upstream/provider.ts`

~180 lines. `UpstreamProvider` is its **own class** — it does NOT implement `IProvider`. The upstream proxy is fundamentally different from a provider: it doesn't know which models are available, can't estimate costs, and doesn't need per-provider config. The call sites in `server.ts` branch on `config.upstream` explicitly.

```typescript
export interface UpstreamConfig {
  url: string;
  proxy_key: string;
  timeout_ms: number;
  forward_agent_headers: boolean;
}

export interface StreamingResponse {
  body: ReadableStream<Uint8Array>;
  contentType: string;
}

export class UpstreamProvider {
  constructor(private config: UpstreamConfig) {}

  // Non-streaming: fetch upstream, parse response into NormalizedResponse
  // Matches ForwardFn signature: (ctx: PipelineContext) => Promise<NormalizedResponse>
  async forward(ctx: PipelineContext): Promise<NormalizedResponse> {
    // 1. Construct URL: config.url + request path from ctx
    // 2. Set Authorization: Bearer <proxy_key>
    // 3. Optionally forward x-bastion-* headers from ctx
    // 4. Forward raw body verbatim
    // 5. Parse upstream JSON response into NormalizedResponse
    //    (content, stopReason, inputTokens, outputTokens, rawBody)
    // 6. Enrich ctx with token counts + cost
  }

  // Streaming: fetch upstream, return StreamingResponse
  // (same shape as IProvider.forwardStream return type for createUsageTrackingStream compat)
  async forwardStream(
    request: NormalizedRequest,
    rawBody: unknown,
    ctx: PipelineContext,
  ): Promise<StreamingResponse> {
    // 1. Same URL/header construction as forward()
    // 2. Return { body: response.body, contentType: "text/event-stream" }
    // 3. Token extraction handled by existing createUsageTrackingStream
  }
}
```

**Call site branching in `server.ts`:**

```typescript
// Streaming path
if (normalized.stream) {
  if (config.upstream) {
    const streamRes = await upstreamProvider.forwardStream(normalized, body, ctx);
    const { stream, usage } = createUsageTrackingStream(streamRes.body, provider);
    // ... pipe to client (existing code)
  } else {
    const streamProvider = providerRouter.getProvider(provider);
    const streamRes = await streamProvider.forwardStream(normalized, body, providerConfig);
    const { stream, usage } = createUsageTrackingStream(streamRes.body, provider);
    // ... pipe to client (existing code)
  }
}
```

The two branches share the same post-forward code (stream piping, audit). Only the source of `streamRes` differs.
```

### New file: `packages/proxy/src/upstream/infer-provider.ts`

~20 lines. Path-based provider inference for edge mode:

```typescript
export function inferProviderFromPath(path: string): ProviderName {
  if (path.startsWith("/v1/messages")) return "anthropic";
  if (path.startsWith("/v1/chat/completions")) return "openai";
  throw Object.assign(new Error("Unsupported path"), { statusCode: 400 });
}
```

### Modified: `packages/config/src/schema.ts` (~25 lines)

- Add `upstreamSchema`
- Make `providers` optional
- Add mutual exclusion + at-least-one refinements
- Guard existing provider refinements with `!data.providers ||`

### Modified: `packages/proxy/src/server.ts` (~50 lines)

In `buildPipeline()` and the main request handler:

```typescript
// Pipeline forward function
const forwardFn = config.upstream
  ? (ctx) => upstreamProvider.forward(ctx)
  : (ctx) => providerRouter.forward(ctx);

const pipeline = new Pipeline(forwardFn);

// Provider detection (in request handler)
const provider = config.upstream
  ? inferProviderFromPath(request.url)
  : routeToProvider(request.url, config);

// Streaming path (in request handler)
if (normalized.stream) {
  const streamProvider = config.upstream
    ? upstreamProvider
    : providerRouter.getProvider(provider);
  // ... existing streaming code uses streamProvider.forwardStream()
}
```

Health check in edge mode returns static info (upstream probe deferred to v2):

```json
{
  "status": "ok",
  "mode": "edge",
  "upstream_url": "https://api.bastion.cloud"
}
```

### Modified: `packages/proxy/src/server.ts` — SIGHUP reload path (~10 lines)

Guard the `handleSighup` reload to branch on `config.upstream` the same way `buildPipeline` does, avoiding `createProviderRouter()` when providers is absent.

### Modified: `packages/cli/src/commands/start.ts` (~10 lines)

Startup log for edge mode:

```
Bastion v0.3.0 running on http://127.0.0.1:3000
Mode: edge → https://api.bastion.cloud
Cache: enabled (exact) | Rate limiting: enabled | Audit: file
```

### Network error handling

Connection refused, DNS failure, and TLS errors from the upstream are mapped to **502 Bad Gateway** with a descriptive body:

```json
{ "error": "upstream_unavailable", "message": "Failed to reach upstream proxy", "upstream_url": "..." }
```

Timeout (AbortController at `timeout_ms`) returns **504 Gateway Timeout**.

### File Summary

| File | Change | Est. lines |
|------|--------|-----------|
| `packages/config/src/schema.ts` | Add upstreamSchema, optional providers, guarded refinements | ~25 |
| `packages/proxy/src/upstream/provider.ts` | **New** — UpstreamProvider (IProvider impl) | ~180 |
| `packages/proxy/src/upstream/infer-provider.ts` | **New** — path-based provider inference | ~20 |
| `packages/proxy/src/server.ts` | Branch on config.upstream in handler, streaming, buildPipeline, SIGHUP | ~50 |
| `packages/cli/src/commands/start.ts` | Edge mode startup message | ~10 |
| `packages/config/src/__tests__/schema.test.ts` | Config validation tests | ~50 |
| `packages/proxy/src/upstream/provider.test.ts` | **New** — provider unit tests | ~180 |

**Total: ~515 lines across 7 files, 3 new.**

## Testing Strategy

### Unit: `provider.test.ts` (~180 lines)

**UpstreamProvider.forward() (non-streaming):**
- URL construction preserves path (`/v1/messages`, `/v1/chat/completions`)
- Auth: proxy_key set as `Authorization: Bearer`; agent's original auth NOT forwarded
- Agent headers forwarded when `forward_agent_headers: true`, omitted when `false`
- Body passthrough: raw body forwarded without modification
- Return type: `NormalizedResponse` with correct `content`, `inputTokens`, `outputTokens`, `rawBody`
- Error propagation: upstream 401/429/500 returned with original status code
- Network errors (connection refused, DNS) → 502 Bad Gateway
- Timeout: AbortController at `timeout_ms` → 504 Gateway Timeout

**UpstreamProvider.forwardStream() (streaming):**
- Returns `ReadableStream` from upstream response body
- SSE events pass through without modification
- Token counts extracted by existing `createUsageTrackingStream` (tested indirectly via integration)

**inferProviderFromPath():**
- `/v1/messages` → `"anthropic"`
- `/v1/chat/completions` → `"openai"`
- `/v2/anything` → 400 error
- `/health` → 400 error (not a proxy path)

### Unit: `schema.test.ts` additions (~50 lines)

- `upstream` + `providers` both set → validation error
- `upstream` alone → valid
- `providers` alone → valid (unchanged behavior)
- Neither `upstream` nor `providers` → validation error
- `upstream.url` not valid URL → error
- `upstream.proxy_key` empty → error
- Defaults applied: `timeout_ms` = 30000, `forward_agent_headers` = true
- Existing provider refinements still work with `providers` present
- Existing provider refinements don't crash with `providers` absent

### Integration: pipeline + forwarder

- Mock provider as "mock cloud proxy"
- Local Bastion in edge mode pointed at mock
- Request reaches mock with correct headers
- Cache hit skips upstream entirely
- Policy block returns 403 without hitting upstream
- Streaming passthrough: SSE events arrive at agent

### Benchmark: `benchmarks/configs/edge-mode.yaml`

Run existing `proxy-overhead.js` against edge mode config. Measures forwarder overhead vs direct provider routing.

## Cloud Data-Plane Changes

**None.** The cloud data-plane already:
- Accepts requests on `/v1/messages` and `/v1/chat/completions`
- Authenticates via `Authorization: Bearer <proxy_key>`
- Reads `x-bastion-agent`, `x-bastion-team`, `x-bastion-env` headers (they're captured in `buildPipelineContext`)

The local proxy appears to the cloud as any other client using a proxy_key.

## Out of Scope (v1)

| Feature | Deferred to | Trigger |
|---------|------------|---------|
| Cloud-managed config push (policies, injection rules) | v2 | Customer request for centralized policy management |
| Upstream failover (backup URL, fallback to direct) | v2 | HA requirements |
| Upstream mTLS | v2 | Enterprise security hardening request |
| Config sync / edge proxy registration | v2 | Cloud-managed config |
| Upstream websocket (persistent connection) | v2 | Real-time config push requirement |

## Migration / Backward Compatibility

- **Fully backward compatible.** Existing configs without `upstream` work identically.
- `providers` becomes optional in the Zod schema but is still required when `upstream` is absent (enforced via refinement).
- No changes to the wire protocol between client and proxy.
- No changes to the enterprise cloud data-plane.
