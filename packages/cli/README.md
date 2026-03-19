# @openbastion-ai/cli

Command-line interface for [Bastion](https://github.com/seanfraserio/bastion) — the open-source AI gateway that secures, governs, and optimizes every LLM API call.

## Install

```bash
npm install -g @openbastion-ai/cli
```

## Quick Start

```bash
# Create a config file
bastion init

# Validate configuration
bastion validate

# Start the proxy
bastion start

# Test with a sample request
bastion test

# Check proxy status
bastion status
```

## Usage

Point your LLM client at the Bastion proxy — zero code changes:

```bash
export ANTHROPIC_BASE_URL=http://localhost:4000
node your-app.js
```

## What Bastion Does

Every request flows through a six-stage middleware pipeline:

```
Rate Limit → Injection Detection → Policy Check → Cache → Provider → Audit
```

- **Rate limiting** — Token bucket per IP/agent with LRU eviction
- **Injection detection** — 12 weighted regex patterns with NFKC normalization
- **Policy enforcement** — Declarative rules from `bastion.yaml`
- **Caching** — SHA-256 keyed, scoped by agent/team/environment
- **Provider fallback** — Automatic failover across Anthropic, OpenAI, Google, Bedrock
- **Audit logging** — Full request/response capture with pluggable exporters

## Configuration

All settings in `bastion.yaml` with Zod schema validation and `${ENV_VAR}` interpolation:

```yaml
providers:
  primary: anthropic
  fallback: [openai, bedrock]
  anthropic:
    api_key: ${ANTHROPIC_API_KEY}

policies:
  - name: block-injection
    on: request
    if: { injection_score: { gt: 0.8 } }
    then: block

cache:
  enabled: true
  ttl: 3600
```

## Related Packages

| Package | Description |
|---------|-------------|
| [@openbastion-ai/proxy](https://www.npmjs.com/package/@openbastion-ai/proxy) | Core proxy server and middleware pipeline |
| [@openbastion-ai/config](https://www.npmjs.com/package/@openbastion-ai/config) | Zod schema and YAML config loader |
| [@openbastion-ai/sdk](https://www.npmjs.com/package/@openbastion-ai/sdk) | Typed admin API client |

## Part of the Trilogy

**Forge** (define agents) + **Bastion** (protect traffic) + **Lantern** (observe traces)

## License

MIT
