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
| `claude-opus-4-20250514` | $15.00 | $75.00 |
| `claude-sonnet-4-20250514` | $3.00 | $15.00 |
| `claude-haiku-3-20250414` | $0.80 | $4.00 |

All other models available via the Anthropic API are also supported. Pricing for additional models is determined by Anthropic and may change. Consult the [Anthropic pricing page](https://www.anthropic.com/pricing) for current rates.

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
| `base_url` | `string` | No | `"https://api.openai.com/v1"` |

### Supported Models

| Model | Input (per 1M tokens) | Output (per 1M tokens) |
|-------|----------------------|------------------------|
| `gpt-4o` | $2.50 | $10.00 |
| `gpt-4o-mini` | $0.15 | $0.60 |
| `gpt-4-turbo` | $10.00 | $30.00 |
| `o1` | $15.00 | $60.00 |
| `o1-mini` | $1.10 | $4.40 |
| `o1-pro` | $150.00 | $600.00 |
| `o3` | $10.00 | $40.00 |
| `o3-mini` | $1.10 | $4.40 |
| `o4-mini` | $1.10 | $4.40 |

All other models available via the OpenAI API are also supported. Pricing is determined by OpenAI and may change. Consult the [OpenAI pricing page](https://openai.com/pricing) for current rates.

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
| `timeout_ms` | `number` | No | `60000` |

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

Bastion supports AWS Bedrock for accessing foundation models through AWS infrastructure. Bedrock provider support is currently in preview. The configuration interface is stable, but some features (streaming, certain model families) may have limitations that are being addressed in upcoming releases.

### Configuration

| Field | Type | Required | Default |
|-------|------|----------|---------|
| `region` | `string` | Yes | -- |
| `access_key_id` | `string` | No | -- |
| `secret_access_key` | `string` | No | -- |
| `timeout_ms` | `number` | No | `30000` |

If `access_key_id` and `secret_access_key` are not provided, Bastion uses the default AWS credential chain: environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`), shared credentials file (`~/.aws/credentials`), EC2/ECS instance role, and SSO credentials, in that order.

### Supported Models

Bedrock model availability depends on the AWS region and the models enabled in the AWS account. The following are commonly available models:

| Model ID | Provider | Input (per 1M tokens) | Output (per 1M tokens) |
|----------|----------|----------------------|------------------------|
| `anthropic.claude-3-5-sonnet-20241022-v2:0` | Anthropic | $3.00 | $15.00 |
| `anthropic.claude-3-haiku-20240307-v1:0` | Anthropic | $0.25 | $1.25 |
| `amazon.titan-text-premier-v1:0` | Amazon | $0.50 | $1.50 |
| `amazon.titan-text-lite-v1` | Amazon | $0.15 | $0.20 |
| `meta.llama3-70b-instruct-v1:0` | Meta | $2.65 | $3.50 |
| `meta.llama3-8b-instruct-v1:0` | Meta | $0.30 | $0.60 |
| `mistral.mistral-large-2407-v1:0` | Mistral | $4.00 | $12.00 |

Pricing listed is on-demand Bedrock pricing and may differ from direct API pricing. Consult the [AWS Bedrock pricing page](https://aws.amazon.com/bedrock/pricing/) for current rates and regional availability.

### Known Limitations

- Streaming responses are not yet fully supported for all Bedrock model families.
- Tool use (function calling) passthrough is supported for Anthropic models on Bedrock but not yet for other model families.
- Cross-region inference profiles are not currently handled; each Bastion instance connects to a single region.

### Example

```yaml
providers:
  primary: bedrock
  definitions:
    bedrock:
      region: "us-east-1"
      access_key_id: "${AWS_ACCESS_KEY_ID}"
      secret_access_key: "${AWS_SECRET_ACCESS_KEY}"
```

---

## Provider Fallback

Bastion can route requests to a fallback provider when the primary provider is unavailable. The fallback provider is specified in the `providers.fallback` field and must reference a provider defined in `providers.definitions`.

### Fallback Triggers

Bastion initiates fallback when the primary provider returns one of the following:

- **HTTP 5xx errors** -- Server-side failures from the provider indicating an outage or internal error.
- **Connection timeouts** -- The provider did not respond within the configured `timeout_ms` window.
- **Rate limit errors (HTTP 429)** -- The provider rejected the request due to rate limiting.
- **Connection failures** -- DNS resolution failures, TCP connection refused, or TLS handshake errors.

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
