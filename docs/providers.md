# Providers

Bastion supports multiple LLM providers. Each provider has its own configuration section under `providers.definitions` in `bastion.yaml`.

---

## Anthropic

Bastion supports the Anthropic Messages API. All Claude models are available.

### Configuration

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `api_key` | `string` | Yes | -- |
| `timeout_ms` | `number` | No | `30000` |
| `base_url` | `string` | No | `"https://api.anthropic.com"` |
| `default_model` | `string` | No | `"claude-sonnet-4-20250514"` |
| `max_retries` | `number` | No | `2` |

### Supported Models

- `claude-opus-4-20250514`
- `claude-sonnet-4-20250514`
- `claude-haiku-3-20250414`
- All other models available via the Anthropic API

### Example

```yaml
providers:
  primary: anthropic
  definitions:
    anthropic:
      api_key: "${ANTHROPIC_API_KEY}"
      timeout_ms: 30000
      default_model: "claude-sonnet-4-20250514"
```

---

## OpenAI

Bastion supports the OpenAI Chat Completions API. Compatible with any OpenAI-compatible endpoint.

### Configuration

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `api_key` | `string` | Yes | -- |
| `timeout_ms` | `number` | No | `30000` |
| `base_url` | `string` | No | `"https://api.openai.com/v1"` |
| `default_model` | `string` | No | `"gpt-4o"` |
| `max_retries` | `number` | No | `2` |
| `organization` | `string` | No | -- |

### Supported Models

- `gpt-4o`
- `gpt-4o-mini`
- `gpt-4-turbo`
- `o1`, `o1-mini`, `o1-pro`
- All other models available via the OpenAI API

### Example

```yaml
providers:
  definitions:
    openai:
      api_key: "${OPENAI_API_KEY}"
      timeout_ms: 30000
      organization: "org-..."
```

---

## Ollama

Bastion supports locally-hosted models via Ollama. No API key required.

### Configuration

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `base_url` | `string` | No | `"http://localhost:11434"` |
| `timeout_ms` | `number` | No | `60000` |
| `default_model` | `string` | No | `"llama3"` |

### Supported Models

Any model installed in your Ollama instance, including:

- `llama3`, `llama3:70b`
- `mistral`, `mixtral`
- `codellama`
- `phi3`
- Custom models via `ollama pull`

### Example

```yaml
providers:
  primary: ollama
  definitions:
    ollama:
      base_url: "http://localhost:11434"
      timeout_ms: 120000
      default_model: "llama3"
```

---

## Bedrock

Bastion supports AWS Bedrock for accessing foundation models through AWS infrastructure.

### Configuration

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `region` | `string` | Yes | -- |
| `access_key_id` | `string` | No | -- |
| `secret_access_key` | `string` | No | -- |
| `timeout_ms` | `number` | No | `30000` |
| `default_model` | `string` | No | -- |

If `access_key_id` and `secret_access_key` are not provided, Bastion uses the default AWS credential chain (environment variables, shared credentials file, EC2 instance role, etc.).

### Supported Models

- `anthropic.claude-3-5-sonnet-20241022-v2:0`
- `anthropic.claude-3-haiku-20240307-v1:0`
- `amazon.titan-text-premier-v1:0`
- `meta.llama3-70b-instruct-v1:0`
- All other models available in your Bedrock region

### Example

```yaml
providers:
  primary: bedrock
  definitions:
    bedrock:
      region: "us-east-1"
      access_key_id: "${AWS_ACCESS_KEY_ID}"
      secret_access_key: "${AWS_SECRET_ACCESS_KEY}"
      default_model: "anthropic.claude-3-5-sonnet-20241022-v2:0"
```

---

## Provider Fallback

Configure multiple providers and Bastion will automatically fall back if the primary fails:

```yaml
providers:
  primary: anthropic
  fallback:
    - openai
    - ollama
  definitions:
    anthropic:
      api_key: "${ANTHROPIC_API_KEY}"
    openai:
      api_key: "${OPENAI_API_KEY}"
    ollama:
      base_url: "http://localhost:11434"
```

Fallback triggers on:

- HTTP 5xx errors from the provider
- Connection timeouts
- Rate limit errors (HTTP 429)
- Provider-specific transient errors

Bastion normalizes the request and response formats across providers, so your application receives a consistent response regardless of which provider ultimately served the request.
