# bastion.yaml Reference

Complete reference for every field in the Bastion configuration file.

---

## `version`

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `version` | `string` | Yes | -- |

The configuration schema version. Currently only `"1"` is supported.

```yaml
version: "1"
```

---

## `proxy`

Top-level proxy server settings.

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `port` | `number` | Yes | -- |
| `host` | `string` | No | `"127.0.0.1"` |
| `log_level` | `"debug" \| "info" \| "warn" \| "error"` | No | `"info"` |

```yaml
proxy:
  port: 4000
  host: "0.0.0.0"
  log_level: debug
```

---

## `upstream`

Configure edge proxy mode -- forward requests to an upstream Bastion proxy instead of directly to AI providers. **Mutually exclusive with `providers`** -- use one or the other.

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `url` | `string` (URL) | Yes | -- |
| `proxy_key` | `string` | Yes | -- |
| `timeout_ms` | `number` | No | `30000` |
| `forward_agent_headers` | `boolean` | No | `true` |

- **`url`** -- The URL of the upstream Bastion cloud proxy (e.g., `https://api.bastion.cloud`). Requests are forwarded to `{url}/v1/messages` or `{url}/v1/chat/completions` based on the incoming request path.
- **`proxy_key`** -- Site-level authentication token sent to the upstream proxy as `Authorization: Bearer {proxy_key}`.
- **`timeout_ms`** -- Maximum time to wait for the upstream proxy to respond before returning a 504 Gateway Timeout.
- **`forward_agent_headers`** -- When `true`, forwards `X-Bastion-Agent`, `X-Bastion-Team`, `X-Bastion-Env`, and `X-Request-Id` headers to the upstream proxy for per-agent tracking.

When `upstream` is configured, the local proxy runs all enabled middleware (cache, rate limiting, policies, injection detection, audit) before forwarding to the upstream proxy. Cache hits are served locally without contacting the upstream.

```yaml
upstream:
  url: "https://api.bastion.cloud"
  proxy_key: "${BASTION_PROXY_KEY}"
  timeout_ms: 30000
  forward_agent_headers: true
```

See the [Edge Proxy example](../examples/edge-proxy/) for a complete configuration.

---

## `providers`

Configure LLM providers and fallback. **Mutually exclusive with `upstream`** -- use one or the other.

### `providers.primary`

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `primary` | `string` | Yes | -- |

The primary provider to route requests to. Must reference a key defined in `providers.definitions`.

### `providers.fallback`

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `fallback` | `string` | No | -- |

A single fallback provider. If the primary fails, Bastion routes the request to this provider instead. Must reference a key defined in `providers.definitions`.

### `providers.definitions`

A map of provider name to provider configuration. Each entry is a key-value pair where the key is a provider name (used in `primary` and `fallback`) and the value contains provider-specific settings.

All provider definitions share a common set of optional fields:

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `api_key` | `string` | No | -- |
| `base_url` | `string` (URL) | No | -- |
| `timeout_ms` | `number` | No | -- |

The schema accepts any string key for provider names. Bastion's runtime interprets the provider name to determine which upstream API to call. See [Providers](./providers.md) for provider-specific configuration guidance and supported models.

```yaml
providers:
  primary: anthropic
  fallback: openai
  definitions:
    anthropic:
      api_key: "${ANTHROPIC_API_KEY}"
      timeout_ms: 30000
    openai:
      api_key: "${OPENAI_API_KEY}"
      timeout_ms: 30000
```

---

## `auth`

Authentication configuration for controlling access to the Bastion proxy. When enabled, clients must provide a valid bearer token in the `Authorization` header.

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `enabled` | `boolean` | No | `false` |
| `tokens` | `string[]` | No | `[]` |

- **`enabled`** -- When `true`, Bastion requires a valid bearer token on every request. Requests without a valid token receive a `401 Unauthorized` response.
- **`tokens`** -- The list of accepted bearer tokens. Supports environment variable substitution for keeping tokens out of version control.

```yaml
auth:
  enabled: true
  tokens:
    - "${BASTION_TOKEN_ADMIN}"
    - "${BASTION_TOKEN_CI}"
```

When `enabled` is `false` (the default), Bastion accepts all incoming requests without authentication. This is appropriate for local development but not recommended for production deployments.

---

## `cache`

Response caching configuration.

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `enabled` | `boolean` | No | `true` |
| `strategy` | `"exact" \| "semantic"` | No | `"exact"` |
| `ttl_seconds` | `number` | No | `3600` |
| `max_entries` | `number` | No | `10000` |

### Cache Strategy

- **`exact`** -- The cache key is a hash of the full request body. Two requests must be byte-identical to produce a cache hit. Use `exact` for deterministic workloads where identical requests should return cached responses, such as repeated tool calls with fixed parameters or batch processing with known inputs.
- **`semantic`** -- The cache key is based on embedding similarity. Requests that are semantically similar (but not identical) can produce a cache hit. Use `semantic` when similar but not identical requests should match, such as user-facing chat applications where minor rephrasing should return a cached response. Enterprise only.

```yaml
cache:
  enabled: true
  strategy: exact
  ttl_seconds: 3600
  max_entries: 5000
```

---

## `rate_limits`

Rate limiting configuration with global defaults and optional per-agent overrides.

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `enabled` | `boolean` | No | `true` |
| `requests_per_minute` | `number` | No | -- |
| `tokens_per_minute` | `number` | No | -- |

The top-level `requests_per_minute` and `tokens_per_minute` apply globally to all traffic through the proxy. When a limit is not set, that dimension is not enforced.

### `rate_limits.agents`

Array of per-agent overrides. Agents identify themselves via the `X-Bastion-Agent` header. Per-agent limits take precedence over global limits for matching requests.

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `name` | `string` | Yes | -- |
| `requests_per_minute` | `number` | No | -- |
| `tokens_per_minute` | `number` | No | -- |

```yaml
rate_limits:
  enabled: true
  requests_per_minute: 1000
  agents:
    - name: support-triage
      requests_per_minute: 100
    - name: batch-processor
      requests_per_minute: 20
      tokens_per_minute: 10000
```

---

## `policies`

An array of policy rules evaluated against request or response content.

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `name` | `string` | Yes | -- |
| `on` | `"request" \| "response" \| "both"` | Yes | -- |
| `action` | `"block" \| "warn" \| "redact" \| "tag"` | Yes | -- |
| `condition` | `object` | Yes | -- |

The `on` field determines when the policy is evaluated. Use `"request"` to evaluate before forwarding to the provider, `"response"` to evaluate the provider's reply, or `"both"` to evaluate at both stages.

### Condition Types

All conditions are distinguished by their `type` field.

#### `contains`

Matches if the content contains the specified string.

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `type` | `"contains"` | Yes | -- |
| `field` | `"prompt" \| "response" \| "all"` | Yes | -- |
| `value` | `string` | Yes | -- |
| `case_sensitive` | `boolean` | No | `false` |

The `field` parameter specifies which part of the message to search. Use `"prompt"` for the user's input, `"response"` for the model's output, or `"all"` for both.

#### `regex`

Matches if the content matches the regular expression.

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `type` | `"regex"` | Yes | -- |
| `field` | `"prompt" \| "response" \| "all"` | Yes | -- |
| `value` | `string` | Yes | -- |
| `case_sensitive` | `boolean` | No | `true` |

The `value` is a JavaScript-compatible regular expression pattern.

#### `length_exceeds`

Matches if the content length exceeds the threshold.

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `type` | `"length_exceeds"` | Yes | -- |
| `field` | `"prompt" \| "response" \| "all"` | Yes | -- |
| `value` | `number` | Yes | -- |

The `value` is the maximum allowed character count. Use this to enforce prompt or response size limits.

#### `injection_score`

Matches if the injection detection score exceeds the threshold.

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `type` | `"injection_score"` | Yes | -- |
| `threshold` | `number` (0.0 - 1.0) | Yes | -- |

The threshold determines sensitivity. Lower values catch more potential injections but increase false positives. A value of `0.7` is a reasonable starting point for most workloads.

#### `pii_detected`

Matches if PII of the specified entity types is detected.

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `type` | `"pii_detected"` | Yes | -- |
| `entities` | `string[]` (min 1) | Yes | -- |

Supported entity types: `email`, `phone`, `ssn`, `credit_card`, `address`, `name`.

### Actions

| Action | Behavior |
|--------|----------|
| `block` | Reject the request/response with an error |
| `warn` | Allow through but log a warning in the audit log |
| `redact` | Replace matched content with `[REDACTED]` |
| `tag` | Allow through and add a metadata tag to the audit entry |

```yaml
policies:
  - name: block-injections
    condition:
      type: injection_score
      threshold: 0.7
    action: block
    on: request

  - name: redact-emails
    condition:
      type: pii_detected
      entities:
        - email
    action: redact
    on: response

  - name: limit-prompt-length
    condition:
      type: length_exceeds
      field: prompt
      value: 50000
    action: block
    on: request
```

---

## `audit`

Audit logging configuration.

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `enabled` | `boolean` | No | `true` |
| `output` | `"stdout" \| "file" \| "http"` | No | `"file"` |
| `file_path` | `string` | No | -- |
| `include_request_body` | `boolean` | No | `false` |
| `include_response_body` | `boolean` | No | `false` |

### Output Modes

- **`stdout`** -- Write JSON log lines to standard output. Useful during development and for container environments where logs are collected from stdout.
- **`file`** -- Write JSON log lines to the file specified by `file_path`. When `output` is `"file"`, the `file_path` field specifies the destination.
- **`http`** -- Export audit events to an external HTTP endpoint. Use this for integration with SIEM systems, log aggregators, or custom audit pipelines. Enterprise only.

```yaml
audit:
  enabled: true
  output: file
  file_path: ./logs/audit.jsonl
  include_request_body: true
  include_response_body: false
```

---

## `lantern`

Integration with Lantern for observability and tracing.

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `enabled` | `boolean` | No | `false` |
| `endpoint` | `string` (URL) | No | -- |
| `agent_name` | `string` | No | -- |
| `api_key` | `string` | No | -- |

The `agent_name` field tags all traces with a logical name, making it easier to filter and group traces in the Lantern dashboard when running multiple Bastion instances.

```yaml
lantern:
  enabled: true
  endpoint: "http://localhost:3100"
  agent_name: "prod-gateway"
  api_key: "${LANTERN_API_KEY}"
```

---

## Environment Variable Substitution

Any string value in `bastion.yaml` can reference environment variables using `${VAR_NAME}` syntax. Bastion resolves these at startup.

```yaml
providers:
  definitions:
    anthropic:
      api_key: "${ANTHROPIC_API_KEY}"    # resolved from environment
```

If a referenced variable is not set, Bastion reports an error at startup.
