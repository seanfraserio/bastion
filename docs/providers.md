# Providers

Bastion supports multiple LLM providers. Each provider is configured under `providers.definitions` in `bastion.yaml`. The `providers.primary` field determines which provider receives requests by default, and the optional `providers.fallback` field designates a backup provider.

---

## Anthropic

Bastion supports the Anthropic Messages API. All Claude models available through the Anthropic API are accessible through Bastion.

### Configuration

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `api_key` | `string` | Yes | -- |
| `timeout_ms` | `number` | No | `30000` |
| `base_url` | `string` | No | `"https://api.anthropic.com"` |

### Supported Models

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| `claude-opus-4-6` | $15.00 | $75.00 |
| `claude-sonnet-4-6` | $3.00 | $15.00 |
| `claude-haiku-4-5-20251001` | $0.80 | $4.00 |

These are the model IDs with built-in cost estimates (`packages/proxy/src/costs.ts`). Other Anthropic model IDs are forwarded, but unlisted models estimate as $0. Provider pricing can change; consult the [Anthropic pricing page](https://www.anthropic.com/pricing) before relying on these figures.

### Example

```yaml
providers:
  primary: anthropic
  definitions:
    anthropic:
      api_key: "${ANTHROPIC_API_KEY}"
      timeout_ms: 30000
```

---

## OpenAI

Bastion supports the OpenAI Chat Completions API. Any OpenAI-compatible endpoint (including Azure OpenAI and third-party providers that implement the same API) can be used by overriding `base_url`.

### Configuration

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `api_key` | `string` | Yes | -- |
| `timeout_ms` | `number` | No | `30000` |
| `base_url` | `string` | No | `"https://api.openai.com"` |

### Supported Models

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| `gpt-4o` | $5.00 | $15.00 |
| `gpt-4o-mini` | $0.15 | $0.60 |
| `o3-mini` | $1.10 | $4.40 |

These are the OpenAI model IDs with built-in cost estimates. Other model IDs are forwarded to the Chat Completions endpoint, but unlisted models estimate as $0. The default `base_url` is `https://api.openai.com`; the adapter appends `/v1/chat/completions`, so do not include `/v1` in `base_url`. Consult the [OpenAI pricing page](https://openai.com/pricing) before relying on these figures.

### Example

```yaml
providers:
  definitions:
    openai:
      api_key: "${OPENAI_API_KEY}"
      timeout_ms: 30000
```

---

## Ollama

Bastion supports locally-hosted models via Ollama. No API key is required. Ollama must be installed and running on the target host.

### Configuration

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `base_url` | `string` | No | `"http://localhost:11434"` |
| `timeout_ms` | `number` | No | `30000` |

### Supported Models

Ollama serves any model that has been pulled to the local instance. There is no per-token cost -- models run on local hardware.

| Model | Parameters | Notes |
|-------|-----------|-------|
| `llama3` | 8B | General-purpose, fast inference |
| `llama3:70b` | 70B | Higher quality, requires significant GPU memory |
| `mistral` | 7B | Strong reasoning for its size |
| `mixtral` | 8x7B (MoE) | Mixture-of-experts architecture |
| `codellama` | 7B/13B/34B | Optimized for code generation |
| `phi3` | 3.8B | Compact model suitable for resource-constrained environments |
| `gemma2` | 9B/27B | Google's open-weight model family |
| `qwen2.5` | 7B/14B/32B/72B | Strong multilingual and coding performance |

Custom models and fine-tunes are supported via `ollama pull` or local Modelfiles.

### Example

```yaml
providers:
  primary: ollama
  definitions:
    ollama:
      base_url: "http://localhost:11434"
      timeout_ms: 120000
```

---

## Bedrock

The Bedrock adapter is registered so configuration can name it, but `BedrockProvider.forward()` currently throws `Bedrock provider not yet implemented`. `supports()` returns false for every model and `estimateCost()` returns 0. There is no AWS credential chain, region field, or SigV4 client in this package.

Provider definitions only accept `api_key`, `base_url`, and `timeout_ms` (`packages/config/src/schema.ts`). `region`, `access_key_id`, and `secret_access_key` are not config fields and will fail schema validation. Do not point production traffic at `bedrock` until the adapter is implemented.

### Known Limitations

- Requests are not forwarded to AWS Bedrock.
- Streaming and tool-use passthrough are not implemented.
- Built-in cost tables do not include Bedrock model IDs.

---

## Provider Fallback

Bastion can route requests to a fallback provider when the primary provider is unavailable. The fallback provider is specified in the `providers.fallback` field and must reference a provider defined in `providers.definitions`.

### Fallback Triggers

Bastion initiates fallback only when the primary error carries status 429 or 5xx (`packages/proxy/src/fallback/router.ts`). Timeouts, DNS failures, and connection errors that do not include that status are not retried on the fallback provider.

### Request Normalization

Bastion normalizes request and response formats across providers. When a request is rerouted from the primary to the fallback provider, Bastion translates the request into the fallback provider's expected format and translates the response back. The calling application receives a response in the format it expects regardless of which provider ultimately served the request.

### Configuration

```yaml
providers:
  primary: anthropic
  fallback: openai
  definitions:
    anthropic:
      api_key: "${ANTHROPIC_API_KEY}"
    openai:
      api_key: "${OPENAI_API_KEY}"
```

In this configuration, requests are sent to Anthropic first. If Anthropic returns a triggering error, Bastion retries the request against OpenAI. If the fallback provider also fails, Bastion returns the error from the fallback provider to the calling application.
