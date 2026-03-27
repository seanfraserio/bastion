# Concepts

This document explains the core architecture of Bastion and the reasoning behind its design decisions. It is intended to help you build a mental model of how Bastion works, why it is structured the way it is, and how its components relate to each other.

## The Pipeline Model

Every request that passes through Bastion flows through a **middleware pipeline** -- an ordered chain of processing steps. Each middleware in the chain can inspect, modify, or reject the request before it reaches the LLM provider, and can do the same to the response on the way back.

The reason Bastion uses a pipeline rather than a monolithic proxy is composability. Each middleware is independent -- it reads from a shared context, does its work, and writes results back. This means you can enable or disable features (rate limiting, caching, PII detection) without affecting the rest of the chain. It also means new middleware can be added without modifying existing ones.

```
Client Request
    |
    v
[Rate Limit] --> reject if over limit
    |
    v
[Injection Detection] --> score and potentially block
    |
    v
[Policy Evaluation (request)] --> block / warn / redact / tag
    |
    v
[Cache Lookup] --> return cached response if hit
    |
    v
[Provider] --> forward to Anthropic / OpenAI / Ollama / Bedrock
    |
    v
[Cache Store] --> store response for future requests
    |
    v
[Policy Evaluation (response)] --> block / warn / redact / tag
    |
    v
[Audit] --> log the completed request
    |
    v
Client Response
```

## Middleware Order

The middleware chain is evaluated in a specific order, and this order matters:

1. **Rate Limit** -- Check request counts and token budgets. Cheap to evaluate, so it runs first to reject excess traffic before doing any expensive work.
2. **Injection Detection** -- Score the request for prompt injection patterns. Runs before policies so that injection scores are available to policy conditions.
3. **Policy Evaluation (request)** -- Evaluate declarative policy rules against the request content. Can block, warn, redact content, or add tags.
4. **Cache Lookup** -- Check if an identical (or semantically similar) request has been seen recently. If so, return the cached response and skip the provider call entirely.
5. **Provider** -- Forward the request to the configured LLM provider. If the primary fails, try fallback providers in order.
6. **Cache Store** -- Store the provider's response for future cache hits.
7. **Policy Evaluation (response)** -- Evaluate policies against the response content. Commonly used for PII redaction.
8. **Audit** -- Log the completed request-response cycle, including timing, provider used, policy decisions, and optionally the full request and response bodies.

### Why Order Matters

The ordering of middleware is not arbitrary -- changing it produces incorrect or dangerous behavior. Here are concrete examples of what goes wrong when the order is changed:

**Rate limiting must run before injection detection.** Rate limiting is a simple counter check. Injection detection, especially with the enterprise ML scorer, calls an external LLM classifier. If injection detection ran first, an attacker could flood Bastion with thousands of requests, each triggering an expensive classifier call, effectively turning Bastion into an amplification vector for a denial-of-service attack against your own infrastructure. By running the cheap check first, excess traffic is rejected before any expensive work begins.

**Injection detection must run before policy evaluation.** Policies can reference the injection score in their conditions (e.g., `injection_score > 0.7 -> block`). If policies ran first, they would see an injection score of zero for every request because the scorer has not yet executed. This means injection-based policies would never trigger, silently disabling a critical security layer.

**Policy evaluation on requests must run before cache lookup.** If the cache ran first, a request containing a policy violation (for example, a prompt injection attempt) could be served directly from cache, bypassing all policy checks. The reason policy evaluation gates the cache is to ensure that no request -- cached or not -- can circumvent security policies.

**Cache store must run before policy evaluation on responses.** This matters because of PII redaction. When a response contains an email address and a PII redaction policy is active, the original unredacted response is stored in the cache. The reason for this is that redaction is applied on read, not on store. If the redacted version were cached, a future change to redaction rules (e.g., adding phone numbers to the redaction list) would not apply to already-cached responses. Storing the original ensures that the latest redaction policies are always applied at retrieval time.

**Audit must run last.** The audit middleware needs a complete picture of what happened -- which provider was used, how long the request took, which policies matched, whether the response was cached, and what the final content looks like after redaction. If audit ran earlier, it would capture an incomplete snapshot of the request lifecycle.

## PipelineContext

Every request creates a **PipelineContext** -- a shared state object that travels through the entire middleware chain. The context carries:

- **Request metadata** -- method, path, headers, body, agent name
- **Provider info** -- which provider was selected, model used, latency
- **Policy decisions** -- which policies matched, what actions were taken
- **Injection score** -- the computed injection risk score
- **Cache status** -- whether the response was served from cache
- **Timing** -- timestamps for each middleware stage
- **Tags** -- arbitrary metadata added by policies or middleware

Middleware reads from and writes to the context. For example, the injection detection middleware writes the score to the context, and a downstream policy reads that score to decide whether to block.

The reason the context exists as a shared object (rather than passing data through function arguments) is that middleware stages are not always aware of each other. A policy does not need to know that injection detection exists -- it just reads `context.injectionScore` and acts on it. This decoupling is what makes the pipeline extensible.

## Provider Normalization

Bastion supports multiple LLM providers (Anthropic, OpenAI, Ollama, Bedrock), each with its own API format. Internally, Bastion converts all provider-specific formats into a **common internal representation** before processing.

### Why Normalization Exists

The reason for the normalization layer is that every other component in the pipeline -- policies, caching, audit, injection detection -- would otherwise need provider-specific logic. Without normalization, a PII redaction policy would need separate implementations for Anthropic's message format (which uses `content` arrays with typed blocks) and OpenAI's format (which uses plain `content` strings). Every new provider would multiply the maintenance burden across every middleware.

By normalizing at the boundary, Bastion translates provider-specific formats exactly once on the way in and once on the way out. Everything in between operates on the common representation. This matters because:

- **Policies work the same regardless of which provider is being used.** A `contains` condition matches against the normalized content, not a provider-specific field path. You write one policy, and it applies to all providers.
- **Switching providers does not require changing policies or middleware.** If you move from OpenAI to Anthropic (or add Anthropic as a fallback), your policies, rate limits, and audit configuration remain unchanged.
- **Audit logs have a consistent format across providers.** Whether a request went to Ollama or Bedrock, the audit entry has the same schema, making it possible to query and analyze logs without provider-specific parsing.
- **Cache keys are provider-agnostic.** An OpenAI response can serve an equivalent Anthropic request in fallback scenarios because the cache operates on normalized content, not raw API payloads.

The normalization layer also handles differences in error formats, token counting methods, and streaming protocols. The reason this complexity is hidden inside the provider adapter (rather than exposed to the pipeline) is to maintain the invariant that middleware never needs to know which provider is in use.

## Policy Evaluation

Policies are **declarative rules** defined in `bastion.yaml`. Each policy specifies:

- A **condition** -- what to look for (e.g., PII detected, injection score above threshold, content contains a forbidden string)
- An **action** -- what to do when the condition matches (block, warn, redact, tag)
- A **phase** -- whether to evaluate on the request or response

Policies are evaluated in the order they appear in the configuration. Multiple policies can match a single request, and their actions are applied in order. A `block` action short-circuits -- no further policies are evaluated.

The reason policies are declarative (YAML configuration) rather than imperative (code) is that security rules should be auditable, diffable, and changeable without redeployment. A security team can review `bastion.yaml` and understand exactly what rules are enforced without reading application code.

See the [Policies reference](./policies.md) for the full list of condition types and actions.

## OSS vs Enterprise Boundary

Bastion is split into an open-source core (MIT-licensed) and an enterprise extension (BUSL-1.1). The boundary between them is deliberate and follows a consistent philosophy.

The OSS core includes everything needed to run a secure, functional LLM proxy: the pipeline, all provider adapters, exact-match caching, regex-based PII detection, heuristic injection scoring, declarative policies, rate limiting, and audit logging. Most teams can deploy OSS Bastion and get meaningful security and governance from day one.

The enterprise extension adds capabilities that fall into three categories:

1. **Accuracy upgrades.** The OSS PII detector uses regex patterns, which work well for structured data (emails, SSNs, credit card numbers) but struggle with unstructured entities like person names and addresses. The enterprise detector uses ML-based Named Entity Recognition, which catches entities that regex misses. Similarly, the OSS injection scorer uses heuristic pattern matching, while the enterprise scorer uses an LLM-based classifier that handles obfuscation, encoding, and multilingual attacks. These are not different features -- they are higher-accuracy implementations of the same feature, replacing the OSS implementation at the interface boundary.

2. **Operational scale.** Cluster synchronization, SIEM export, and compliance reporting exist because organizations running Bastion across dozens of services and multiple teams need global rate limit enforcement, centralized audit pipelines, and regulatory evidence packages. These features are not useful at small scale, and they introduce infrastructure dependencies (Redis, Splunk, Elastic) that would add unnecessary complexity to the OSS core.

3. **Organizational control.** Team RBAC and alerting exist because organizations with multiple teams need to scope policies per team, control who can modify configuration, and route security events to the right on-call channels. A single-team deployment does not need these abstractions.

The reason the boundary matters is that it keeps the OSS core simple and dependency-light. You can run OSS Bastion with nothing more than a `bastion.yaml` file and an API key. Enterprise features are additive -- they enhance or replace OSS components through the same interfaces, never requiring changes to the core pipeline.

See [Enterprise](./enterprise.md) for the full feature reference.

## Edge Proxy Mode

Bastion can operate in **edge mode**, where a local instance runs on the customer's infrastructure and forwards requests to an upstream cloud Bastion proxy instead of directly to AI providers.

In edge mode, the middleware pipeline runs identically -- the only difference is the terminal action. Instead of forwarding to Anthropic or OpenAI, the pipeline forwards to the upstream Bastion proxy. This means all local middleware (caching, rate limiting, injection detection, policies, audit) executes before the request leaves the customer's network.

The reason edge mode exists is to solve three problems with direct-to-cloud routing:

1. **Latency.** A local cache serves repeated prompts without any network round-trip to the cloud. For workloads with prompt reuse, this can eliminate the majority of upstream calls.
2. **Local control.** Customers can enforce their own policies, rate limits, and audit logging without depending on the cloud proxy's configuration. Security-sensitive organizations can inspect and block requests before they leave their network.
3. **Bandwidth.** Large prompts and responses only travel over the WAN once. Subsequent cache hits are served locally.

Edge mode is configured with the `upstream` section in `bastion.yaml`, which replaces the `providers` section:

```yaml
upstream:
  url: "https://api.bastion.cloud"
  proxy_key: "${BASTION_PROXY_KEY}"
  forward_agent_headers: true
```

Agent identity headers (`X-Bastion-Agent`, `X-Bastion-Team`, `X-Bastion-Env`) are forwarded to the cloud proxy so it can track per-agent usage for billing and audit, even though authentication is handled at the site level via `proxy_key`.

## Forge Integration

Bastion is designed to work seamlessly with [Forge](https://github.com/your-org/forge), the agent orchestration framework. The integration is straightforward because Bastion acts as a transparent proxy -- any application that makes HTTP calls to an LLM provider can route those calls through Bastion instead.

With Forge routed through Bastion:

- All agent traffic flows through Bastion's pipeline
- Rate limits are enforced per agent (using the agent name from Forge)
- Policies apply to all agent requests and responses
- Audit logs capture the full agent conversation with Forge metadata
- Lantern receives traces from both Forge (agent decisions) and Bastion (traffic governance)

For configuration details on connecting Forge to Bastion, see the [Getting Started guide](./getting-started.md).

## The Trilogy

Bastion is the third product in the **Forge / Lantern / Bastion** trilogy:

- **Forge** defines and orchestrates AI agents
- **Lantern** observes agent behavior with traces, metrics, and dashboards
- **Bastion** governs agent traffic with policies, rate limits, and audit logging

Together, they provide a complete platform for building, observing, and securing AI agent systems. The reason they are separate products (rather than a single monolith) is that each concern -- orchestration, observability, governance -- has different deployment requirements, update cadences, and operational owners. A security team manages Bastion policies; a platform team manages Forge agent definitions; an SRE team manages Lantern dashboards. Separating the products reflects how organizations actually divide responsibility.
