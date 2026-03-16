# Concepts

This document explains the core architecture of Bastion and how requests flow through the system.

## The Pipeline Model

Every request that passes through Bastion flows through a **middleware pipeline** -- an ordered chain of processing steps. Each middleware in the chain can inspect, modify, or reject the request before it reaches the LLM provider, and can do the same to the response on the way back.

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

Rate limiting runs before injection detection because it is a simple counter check -- there is no reason to run an expensive injection scorer on a request that would be rejected for exceeding rate limits anyway.

Cache lookup runs after policy evaluation on requests so that policy-violating requests are never served from cache. Cache store runs before policy evaluation on responses so that the original unredacted response is cached (redaction is applied on read, not on store).

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

## Provider Normalization

Bastion supports multiple LLM providers (Anthropic, OpenAI, Ollama, Bedrock), each with its own API format. Internally, Bastion converts all provider-specific formats into a **common internal representation** before processing.

This means:

- Policies work the same regardless of which provider is being used
- Switching providers does not require changing policies or middleware
- Audit logs have a consistent format across providers
- Cache keys are provider-agnostic (an OpenAI response can serve an equivalent Anthropic request in fallback scenarios)

## Policy Evaluation

Policies are **declarative rules** defined in `bastion.yaml`. Each policy specifies:

- A **condition** -- what to look for (e.g., PII detected, injection score above threshold, content contains a forbidden string)
- An **action** -- what to do when the condition matches (block, warn, redact, tag)
- A **phase** -- whether to evaluate on the request or response

Policies are evaluated in the order they appear in the configuration. Multiple policies can match a single request, and their actions are applied in order. A `block` action short-circuits -- no further policies are evaluated.

See the [Policies reference](./policies.md) for the full list of condition types and actions.

## Forge Integration

Bastion is designed to work seamlessly with [Forge](https://github.com/your-org/forge), the agent orchestration framework. To route Forge agent traffic through Bastion, point the agent's base URL at the Bastion proxy:

```yaml
# In forge.yaml -- point the agent at Bastion instead of the provider directly
model:
  provider: anthropic
  base_url: "http://localhost:4000"    # Bastion proxy
  name: claude-sonnet-4-6
```

With this configuration:

- All agent traffic flows through Bastion's pipeline
- Rate limits are enforced per agent (using the agent name from Forge)
- Policies apply to all agent requests and responses
- Audit logs capture the full agent conversation with Forge metadata
- Lantern receives traces from both Forge (agent decisions) and Bastion (traffic governance)

## The Trilogy

Bastion is the third product in the **Forge / Lantern / Bastion** trilogy:

- **Forge** defines and orchestrates AI agents
- **Lantern** observes agent behavior with traces, metrics, and dashboards
- **Bastion** governs agent traffic with policies, rate limits, and audit logging

Together, they provide a complete platform for building, observing, and securing AI agent systems.
