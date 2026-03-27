# Bastion

**Bastion is an open-source security gateway for AI agent traffic -- policy enforcement, PII redaction, provider fallback, and audit logging in a single proxy.**

## The Problem

AI agents make uncontrolled calls to LLM providers. There is no standard way to enforce content policies, redact sensitive data, rate-limit individual agents, or maintain an audit trail of what was sent and received. Teams bolt on ad-hoc middleware, duplicate logic across services, and lack visibility into what their agents are actually doing. Bastion solves this by providing a single proxy that sits between your application and the LLM provider, applying governance rules to every request.

## Quick Start

Install the CLI:

```bash
npm install -g @openbastion-ai/cli
```

Create a `bastion.yaml`:

```yaml
version: "1"
proxy:
  port: 4000
providers:
  primary: anthropic
  definitions:
    anthropic:
      api_key: "${ANTHROPIC_API_KEY}"
cache:
  enabled: false
rate_limits:
  enabled: false
policies: []
audit:
  enabled: true
  output: stdout
```

Set your API key and start:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
bastion validate
bastion start
```

## Point Your App at Bastion

Change one environment variable -- no code changes required:

```bash
ANTHROPIC_BASE_URL=http://localhost:4000 node your-app.js
```

## Core Concepts

### Pipeline

Every request flows through an ordered middleware chain:

```
rate-limit → injection → policy(request) → cache → provider → cache → policy(response) → audit
```

Order matters. Rate limiting runs first (cheap) so expensive injection scoring is skipped for over-limit requests. Policies run before cache so violating requests are never served from cache.

### Policies

Declarative rules evaluated against request and response content:

```yaml
policies:
  - name: block-injection
    condition:
      type: injection_score
      threshold: 0.7
    action: block
    on: request

  - name: redact-pii
    condition:
      type: pii_detected
      categories: [email, phone]
    action: redact
    on: response
```

Condition types: `contains`, `regex`, `length_exceeds`, `injection_score`, `pii_detected`.
Actions: `block`, `warn`, `redact`, `tag`.

### Providers

Bastion normalizes requests across providers. Configure a primary and optional fallbacks:

```yaml
providers:
  primary: anthropic
  fallback: [openai]
```

Supported: Anthropic, OpenAI, Ollama, AWS Bedrock.

### Edge Proxy Mode

Run a local Bastion proxy on your infrastructure that forwards to an upstream cloud Bastion proxy. Get local caching, policy enforcement, and audit logging while the cloud handles tenant auth, billing, and provider routing.

```yaml
upstream:
  url: "https://api.bastion.cloud"
  proxy_key: "${BASTION_PROXY_KEY}"
  forward_agent_headers: true
```

The `upstream` section replaces `providers` -- Bastion operates in **edge mode** and forwards requests to the cloud proxy instead of directly to AI providers. All middleware (cache, rate limiting, policies, audit) works locally. See [Edge Proxy example](./examples/edge-proxy/) for a complete setup.

### Audit

Structured JSON logs for every request, including timing, provider used, policy decisions, and optionally full request/response bodies:

```yaml
audit:
  enabled: true
  output: file
  path: ./logs/audit.jsonl
```

## OSS vs Enterprise

| Feature | OSS (MIT) | Enterprise (BUSL-1.1) |
|---------|-----------|----------------------|
| Proxy & pipeline | Yes | Yes |
| Edge proxy mode | Yes | Yes |
| All providers | Yes | Yes |
| Exact-match cache | Yes | Yes |
| Semantic cache | -- | Yes |
| Regex PII detection | Yes | Yes |
| ML PII detection (NER) | -- | Yes |
| Heuristic injection scoring | Yes | Yes |
| ML injection scoring | -- | Yes |
| Rate limiting (in-memory) | Yes | Yes |
| Rate limiting (cluster/Redis) | -- | Yes |
| Audit (stdout, file) | Yes | Yes |
| Audit (SIEM export) | -- | Yes |
| Compliance reports | -- | Yes |
| RBAC | -- | Yes |
| Alerting | -- | Yes |
| Managed cloud | -- | Yes |

## Self-Hosting

Bastion runs as a single binary, a Docker container, a Kubernetes sidecar, or a standalone Kubernetes deployment.

```bash
docker build -t bastion -f docker/Dockerfile .
docker run -p 4000:4000 -e ANTHROPIC_API_KEY bastion
```

See [Self-Hosting docs](./docs/self-hosting.md) for Docker Compose, Kubernetes, and cluster mode.

## The Trilogy: Forge + Lantern + Bastion

Bastion is the third product in the **Forge / Lantern / Bastion** trilogy for production AI agent systems:

- **[Forge](https://github.com/your-org/forge)** -- Define and orchestrate AI agents with structured workflows, tool use, and multi-agent coordination.
- **[Lantern](https://github.com/your-org/lantern)** -- Observe agent behavior with distributed traces, metrics, dashboards, and anomaly detection.
- **Bastion** -- Govern agent traffic with policies, rate limits, PII redaction, injection detection, and audit logging.

Point Forge's `base_url` at Bastion. Enable Lantern integration in `bastion.yaml`. All three work independently but are designed to work together.

## Documentation

- [Getting Started](./docs/getting-started.md)
- [bastion.yaml Reference](./docs/bastion-yaml-reference.md)
- [Concepts](./docs/concepts.md)
- [Providers](./docs/providers.md)
- [Policies](./docs/policies.md)
- [Self-Hosting](./docs/self-hosting.md)
- [Enterprise](./docs/enterprise.md)

## Examples

- [Basic Proxy](./examples/basic-proxy/) -- Minimal config, Anthropic only
- [Provider Fallback](./examples/provider-fallback/) -- Anthropic primary, OpenAI fallback
- [PII Redaction](./examples/pii-redaction/) -- Redact emails and phone numbers
- [Rate Limiting](./examples/rate-limiting/) -- Per-agent rate limits
- [Injection Detection](./examples/injection-detection/) -- Block prompt injection attacks
- [Edge Proxy](./examples/edge-proxy/) -- Local proxy forwarding to a cloud Bastion

## Contributing

Contributions are welcome. Please run the following before submitting a PR:

```bash
pnpm build && pnpm test && pnpm typecheck
```

## License

MIT. See [LICENSE](./LICENSE).
