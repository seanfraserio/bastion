# Bastion

## Mission

Bastion is a local proxy gateway that sits between application code and LLM providers. It enforces policies, redacts PII, detects prompt injection, routes across providers with automatic fallback, caches responses, rate-limits traffic, and emits structured audit logs. Bastion is the third product in the **Forge / Lantern / Bastion** trilogy.

## Package Map

```
packages/
  proxy/       Core proxy server, pipeline, middleware, providers
  cli/         CLI binary (bastion start / validate / test / status)
  config/      Zod schema and YAML loader for bastion.yaml
  sdk/         Typed admin API client
  enterprise/  Enterprise features (BUSL-1.1)
```

## Architecture: The Pipeline Model

Every request flows through an ordered middleware pipeline:

```
rate-limit → injection → policy(request) → cache(request) → [provider] → cache(response) → policy(response) → audit
```

**PipelineContext** is the shared state object that travels through the entire chain. Each middleware reads from and writes to the context. Order matters:

- Rate limiting runs first because it is a cheap counter check -- no reason to run expensive injection scoring on requests that exceed limits.
- Cache lookup runs after request policies so policy-violating requests are never served from cache.
- Cache store runs before response policies so the original unredacted response is cached (redaction is applied on read).

## Adding a New Provider

1. Implement the `IProvider` interface in `packages/proxy/src/providers/`.
2. Add the provider file to `providers/` and register it in `fallback/router.ts`.
3. Add a cost table for token pricing.
4. Add the provider name to the `ProviderName` type union and the Zod schema enum in `packages/config/`.

## Adding a New Middleware

1. Implement the `PipelineMiddleware` interface.
2. Register the middleware in `server.ts` pipeline setup, respecting the correct position in the chain.
3. Add any new config fields to the Zod schema in `packages/config/`.

## Adding a New Policy Condition Type

1. Add the new type to the condition type union in `packages/config/src/schema.ts`.
2. Implement the evaluator function in `packages/proxy/src/policies/policy.ts`.
3. Add tests and update docs.

## OSS / Enterprise Boundary

The open-source core (MIT) includes:
- Proxy server and full pipeline
- All providers (Anthropic, OpenAI, Ollama, Bedrock)
- Exact-match cache
- Regex-based PII detection
- Heuristic injection scoring
- Rate limiting (in-memory)
- Audit logging (stdout, file)

Enterprise features (BUSL-1.1, in `packages/enterprise/`) include anything requiring:
- ML models (semantic cache, ML PII detection, LLM injection scoring)
- External service integrations (SIEM export, alerting)
- Compliance reporting
- RBAC
- Cluster synchronization (Redis-backed state)

If in doubt, ask: "Does this require an ML model or external service?" If yes, it goes in `enterprise/`.

## Trilogy Integration

- **Forge** defines and orchestrates AI agents.
- **Lantern** observes agent behavior with traces, metrics, and dashboards.
- **Bastion** governs agent traffic with policies, rate limits, and audit logging.

To connect Forge to Bastion, point Forge's `base_url` at the Bastion proxy:

```yaml
# forge.yaml
model:
  provider: anthropic
  base_url: "http://localhost:4000"
  name: claude-sonnet-4-6
```

To connect Bastion to Lantern, enable the lantern integration in `bastion.yaml`:

```yaml
# bastion.yaml
lantern:
  enabled: true
  endpoint: "http://localhost:3100"
```

## Commands Before Committing

```bash
pnpm build && pnpm test && pnpm typecheck
```
