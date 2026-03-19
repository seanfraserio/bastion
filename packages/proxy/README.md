# @openbastion-ai/proxy

Core proxy server for [Bastion](https://github.com/seanfraserio/bastion) — the open-source AI gateway. This package contains the middleware pipeline, provider implementations, and server runtime.

## Install

```bash
npm install @openbastion-ai/proxy
```

## Programmatic Usage

```typescript
import { createServer } from "@openbastion-ai/proxy";

const { app, config } = await createServer("./bastion.yaml");
// Server is now running on the configured port
```

## Architecture

Every request flows through an ordered middleware pipeline:

```
Rate Limit → Injection → Policy(request) → Cache(request)
  → [Provider] →
Cache(response) → Policy(response) → Audit
```

### Middleware

| Middleware | Purpose |
|-----------|---------|
| Rate Limiter | Token bucket per IP/agent, LRU eviction at 10K buckets |
| Injection Detector | 12 weighted patterns, NFKC normalization, leet-speak decoding |
| Policy Engine | Declarative rules with 5 condition types, pre-compiled regexes |
| Cache | SHA-256 keys scoped by agent/team/env, structuredClone isolation |
| Audit | Pluggable exporters (stdout, file, HTTP) with graceful shutdown |

### Providers

| Provider | Endpoint |
|----------|----------|
| Anthropic | Messages API with prompt caching |
| OpenAI | Chat completions with function calling |
| Google | Gemini GenerateContent |
| AWS Bedrock | InvokeModel with cross-region inference |
| Ollama | Local open-source models |

### Security

- Timing-safe auth token comparison (`crypto.timingSafeEqual`)
- Security headers on all responses (nosniff, no-store, DENY)
- Request ID and header validation
- ReDoS protection on policy regexes
- Graceful shutdown with audit log flushing

## License

MIT
