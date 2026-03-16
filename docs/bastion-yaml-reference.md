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
| `port` | `number` | No | `4000` |
| `host` | `string` | No | `"127.0.0.1"` |
| `log_level` | `"debug" \| "info" \| "warn" \| "error"` | No | `"info"` |
| `request_timeout_ms` | `number` | No | `60000` |
| `max_body_size` | `string` | No | `"10mb"` |

```yaml
proxy:
  port: 4000
  host: "0.0.0.0"
  log_level: debug
  request_timeout_ms: 120000
  max_body_size: "50mb"
```

---

## `providers`

Configure LLM providers and fallback order.

### `providers.primary`

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `primary` | `"anthropic" \| "openai" \| "ollama" \| "bedrock"` | Yes | -- |

The primary provider to route requests to.

### `providers.fallback`

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `fallback` | `string[]` | No | `[]` |

Ordered list of fallback providers. If the primary fails, Bastion tries each fallback in order.

### `providers.definitions`

A map of provider name to provider configuration.

#### Anthropic

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `api_key` | `string` | Yes | -- |
| `timeout_ms` | `number` | No | `30000` |
| `base_url` | `string` | No | `"https://api.anthropic.com"` |
| `default_model` | `string` | No | `"claude-sonnet-4-20250514"` |
| `max_retries` | `number` | No | `2` |

#### OpenAI

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `api_key` | `string` | Yes | -- |
| `timeout_ms` | `number` | No | `30000` |
| `base_url` | `string` | No | `"https://api.openai.com/v1"` |
| `default_model` | `string` | No | `"gpt-4o"` |
| `max_retries` | `number` | No | `2` |
| `organization` | `string` | No | -- |

#### Ollama

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `base_url` | `string` | No | `"http://localhost:11434"` |
| `timeout_ms` | `number` | No | `60000` |
| `default_model` | `string` | No | `"llama3"` |

#### Bedrock

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `region` | `string` | Yes | -- |
| `access_key_id` | `string` | No | -- |
| `secret_access_key` | `string` | No | -- |
| `timeout_ms` | `number` | No | `30000` |
| `default_model` | `string` | No | -- |

```yaml
providers:
  primary: anthropic
  fallback:
    - openai
  definitions:
    anthropic:
      api_key: "${ANTHROPIC_API_KEY}"
      timeout_ms: 30000
    openai:
      api_key: "${OPENAI_API_KEY}"
      timeout_ms: 30000
```

---

## `cache`

Response caching configuration.

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `enabled` | `boolean` | Yes | `false` |
| `strategy` | `"exact" \| "semantic"` | No | `"exact"` |
| `ttl_seconds` | `number` | No | `3600` |
| `max_entries` | `number` | No | `10000` |
| `storage` | `"memory" \| "redis"` | No | `"memory"` |
| `redis_url` | `string` | No | -- |

- **`exact`** -- Cache key is a hash of the full request body. Available in OSS.
- **`semantic`** -- Cache key is based on embedding similarity. Enterprise only.

```yaml
cache:
  enabled: true
  strategy: exact
  ttl_seconds: 3600
  max_entries: 5000
```

---

## `rate_limits`

Rate limiting configuration with global defaults and per-agent overrides.

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `enabled` | `boolean` | Yes | `false` |

### `rate_limits.global`

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `requests_per_minute` | `number` | No | `600` |
| `tokens_per_minute` | `number` | No | -- |

### `rate_limits.agents`

Array of per-agent overrides. Agents identify themselves via the `X-Bastion-Agent` header.

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `name` | `string` | Yes | -- |
| `requests_per_minute` | `number` | No | -- |
| `tokens_per_minute` | `number` | No | -- |

```yaml
rate_limits:
  enabled: true
  global:
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
| `description` | `string` | No | -- |
| `condition` | `object` | Yes | -- |
| `action` | `"block" \| "warn" \| "redact" \| "tag"` | Yes | -- |
| `on` | `"request" \| "response"` | Yes | -- |

### Condition Types

#### `contains`

Matches if the content contains the specified string.

| Field | Type | Required |
|-------|------|----------|
| `type` | `"contains"` | Yes |
| `value` | `string` | Yes |
| `case_sensitive` | `boolean` | No (default: `false`) |

#### `regex`

Matches if the content matches the regular expression.

| Field | Type | Required |
|-------|------|----------|
| `type` | `"regex"` | Yes |
| `pattern` | `string` | Yes |
| `flags` | `string` | No |

#### `length_exceeds`

Matches if the content length exceeds the threshold.

| Field | Type | Required |
|-------|------|----------|
| `type` | `"length_exceeds"` | Yes |
| `max_length` | `number` | Yes |

#### `injection_score`

Matches if the injection detection score exceeds the threshold.

| Field | Type | Required |
|-------|------|----------|
| `type` | `"injection_score"` | Yes |
| `threshold` | `number` (0.0 - 1.0) | Yes |

#### `pii_detected`

Matches if PII of the specified categories is detected.

| Field | Type | Required |
|-------|------|----------|
| `type` | `"pii_detected"` | Yes |
| `categories` | `string[]` | Yes |

Supported categories: `email`, `phone`, `ssn`, `credit_card`, `address`, `name`.

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
      categories:
        - email
    action: redact
    on: response
```

---

## `audit`

Audit logging configuration.

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `enabled` | `boolean` | Yes | `false` |
| `output` | `"stdout" \| "file" \| "siem"` | No | `"stdout"` |
| `path` | `string` | No | `"./logs/audit.jsonl"` |
| `include_request_body` | `boolean` | No | `false` |
| `include_response_body` | `boolean` | No | `false` |
| `retention_days` | `number` | No | `30` |

- **`stdout`** -- Write JSON log lines to standard output.
- **`file`** -- Write JSON log lines to the specified file path.
- **`siem`** -- Export to an external SIEM system. Enterprise only.

```yaml
audit:
  enabled: true
  output: file
  path: ./logs/audit.jsonl
  include_request_body: true
  include_response_body: false
  retention_days: 90
```

---

## `lantern`

Integration with Lantern for observability and tracing.

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `enabled` | `boolean` | No | `false` |
| `endpoint` | `string` | No | `"http://localhost:3100"` |
| `api_key` | `string` | No | -- |

```yaml
lantern:
  enabled: true
  endpoint: "http://localhost:3100"
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
