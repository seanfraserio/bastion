# Policies

Policies are declarative rules that Bastion evaluates against request and response content. This page serves as both a reference for the policy system and a collection of practical patterns for common use cases.

---

## Policy Structure

Every policy has the same structure:

```yaml
policies:
  - name: my-policy              # unique identifier
    description: "Why this exists"  # optional, for documentation
    condition:
      type: contains             # condition type
      value: "secret"            # condition-specific fields
    action: block                # what to do on match
    on: request                  # when to evaluate
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Unique identifier for this policy. Appears in audit logs and error messages. |
| `description` | `string` | No | Human-readable explanation. No effect on evaluation. |
| `condition` | `object` | Yes | What to look for. See [Condition Types](#condition-types) below. |
| `action` | `string` | Yes | What to do when the condition matches. See [Actions](#actions) below. |
| `on` | `"request"` or `"response"` | Yes | Whether to evaluate on the inbound request or the outbound response. |

Policies are evaluated in the order they appear in `bastion.yaml`. A `block` action short-circuits evaluation -- no further policies run after a block.

---

## Condition Types

### `contains`

Matches if the content contains the specified string.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"contains"` | Yes | -- |
| `value` | `string` | Yes | The string to search for |
| `case_sensitive` | `boolean` | No | Default: `false` |

```yaml
- name: block-system-prompt-requests
  condition:
    type: contains
    value: "system prompt"
    case_sensitive: false
  action: block
  on: request
```

### `regex`

Matches if the content matches the regular expression.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"regex"` | Yes | -- |
| `pattern` | `string` | Yes | Regular expression pattern |
| `flags` | `string` | No | Regex flags (e.g., `"i"` for case-insensitive) |

```yaml
- name: block-base64-payloads
  condition:
    type: regex
    pattern: "[A-Za-z0-9+/]{100,}={0,2}"
    flags: "i"
  action: block
  on: request
```

### `length_exceeds`

Matches if the content length (in characters) exceeds the threshold.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"length_exceeds"` | Yes | -- |
| `max_length` | `number` | Yes | Maximum allowed character count |

```yaml
- name: limit-request-length
  condition:
    type: length_exceeds
    max_length: 100000
  action: block
  on: request
```

### `injection_score`

Matches if the injection detection score exceeds the threshold. The injection scorer analyzes request content for patterns commonly associated with prompt injection attacks.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"injection_score"` | Yes | -- |
| `threshold` | `number` | Yes | Score threshold (0.0 to 1.0) |

The OSS injection scorer uses heuristic pattern matching. The enterprise scorer uses ML-based classification for higher accuracy.

```yaml
- name: block-injection-attempts
  condition:
    type: injection_score
    threshold: 0.7
  action: block
  on: request
```

### `pii_detected`

Matches if personally identifiable information of the specified categories is detected in the content.

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | `"pii_detected"` | Yes | -- |
| `categories` | `string[]` | Yes | PII categories to detect |

Supported categories:

| Category | Description | Example |
|----------|-------------|---------|
| `email` | Email addresses | `user@example.com` |
| `phone` | Phone numbers | `(555) 123-4567` |
| `ssn` | Social Security Numbers | `123-45-6789` |
| `credit_card` | Credit card numbers | `4111-1111-1111-1111` |
| `address` | Physical addresses | `123 Main St, Springfield` |
| `name` | Person names | Enterprise only (ML-based) |

The OSS PII detector uses regex patterns. The enterprise detector uses ML-based NER for higher accuracy, especially for names and addresses.

```yaml
- name: redact-pii-in-responses
  condition:
    type: pii_detected
    categories:
      - email
      - phone
      - ssn
      - credit_card
  action: redact
  on: response
```

---

## Actions

### `block`

Reject the request or response. Returns an error to the client.

- On request: returns `403 Forbidden` with a JSON error body including the policy name
- On response: returns `502 Bad Gateway` indicating the response violated a policy

Block short-circuits -- no further policies are evaluated after a block.

### `warn`

Allow the request or response through, but log a warning in the audit log. The warning includes the policy name, condition type, and matched content location.

Useful for monitoring suspicious activity without disrupting traffic.

### `redact`

Replace matched content with `[REDACTED]`. The original content is removed before it reaches the client (for response policies) or the provider (for request policies).

Most commonly used with `pii_detected` to strip personal information from model responses.

### `tag`

Allow the request or response through and add a metadata tag to the audit log entry. Tags are key-value pairs that can be used for filtering and analysis.

Useful for categorizing traffic without affecting it.

---

## Common Patterns

These patterns solve frequently encountered problems. Each shows the complete policy configuration and explains when to use it.

### Block prompt injection attempts

If you want to block requests that look like prompt injection attacks, use a layered approach. A high-threshold block catches confident detections, while a lower-threshold warn captures borderline cases for review without disrupting legitimate traffic.

```yaml
policies:
  # Block high-confidence injection attempts
  - name: block-injection-high
    description: "Block requests with strong injection signals"
    condition:
      type: injection_score
      threshold: 0.8
    action: block
    on: request

  # Warn on moderate injection risk
  - name: warn-injection-moderate
    description: "Flag borderline cases for security team review"
    condition:
      type: injection_score
      threshold: 0.5
    action: warn
    on: request
```

The two-tier approach matters because prompt injection detection is probabilistic. A single threshold forces a tradeoff between false positives (blocking legitimate requests) and false negatives (allowing attacks). Two thresholds let you block the obvious attacks and monitor the ambiguous ones.

If you also want to catch common jailbreak phrases that the scorer might miss, add a `contains` policy:

```yaml
  - name: block-jailbreak-phrases
    description: "Catch known jailbreak patterns by exact text"
    condition:
      type: contains
      value: "ignore all previous instructions"
    action: block
    on: request
```

### Redact PII from responses

If you need to prevent personally identifiable information from reaching your application, add a PII redaction policy on the response phase. This ensures that even if the LLM includes PII in its output, the PII is stripped before your application sees it.

```yaml
policies:
  - name: redact-response-pii
    description: "Strip PII from all model responses"
    condition:
      type: pii_detected
      categories:
        - email
        - phone
        - ssn
        - credit_card
    action: redact
    on: response
```

If you also want to prevent users from sending PII to the model (for example, to avoid PII entering training data), add a request-phase policy:

```yaml
  - name: block-request-pii
    description: "Prevent PII from being sent to the model"
    condition:
      type: pii_detected
      categories:
        - ssn
        - credit_card
    action: block
    on: request
```

Use `block` on request and `redact` on response. Blocking on request prevents PII from reaching the provider entirely. Redacting on response removes PII that the model generates from its training data or context.

### Warn on long responses

If you want to monitor for unexpectedly long model responses (which can indicate runaway generation, prompt injection that causes the model to dump its context, or excessive token costs), add a length check on the response phase.

```yaml
policies:
  - name: warn-long-response
    description: "Flag responses over 50k characters for review"
    condition:
      type: length_exceeds
      max_length: 50000
    action: warn
    on: response
```

If you want to hard-block extremely long responses instead of just warning, change the action to `block` and set a higher threshold:

```yaml
  - name: block-excessive-response
    description: "Reject responses over 200k characters"
    condition:
      type: length_exceeds
      max_length: 200000
    action: block
    on: response
```

### Block requests containing internal data

If you want to prevent agents from sending internal identifiers, API keys, or internal URLs to external LLM providers, use `regex` or `contains` policies to catch these patterns.

```yaml
policies:
  - name: block-internal-api-keys
    description: "Prevent API keys from being sent to the model"
    condition:
      type: regex
      pattern: "(sk-[a-zA-Z0-9]{32,}|ghp_[a-zA-Z0-9]{36}|xoxb-[0-9]+-[a-zA-Z0-9]+)"
    action: block
    on: request

  - name: block-internal-urls
    description: "Prevent internal URLs from leaking to the model"
    condition:
      type: regex
      pattern: "https?://[a-zA-Z0-9.-]+\\.internal\\.[a-zA-Z]{2,}"
    action: block
    on: request

  - name: block-base64-payloads
    description: "Block large base64 blobs that may encode sensitive data"
    condition:
      type: regex
      pattern: "[A-Za-z0-9+/]{200,}={0,2}"
    action: block
    on: request
```

These patterns are especially important for agent systems where the agent constructs prompts from internal data sources. Without these guards, an agent could inadvertently include database credentials, internal service URLs, or encoded payloads in its LLM request.

### Rate limit by agent with policy tagging

If you want to track which agents are generating the most policy violations without blocking them, use `tag` policies to annotate audit log entries. This is useful during a rollout period when you want to understand traffic patterns before enforcing hard limits.

```yaml
policies:
  - name: tag-high-volume-patterns
    description: "Tag requests over 10k characters for volume analysis"
    condition:
      type: length_exceeds
      max_length: 10000
    action: tag
    on: request

  - name: tag-injection-attempts
    description: "Tag requests with any injection signal for analysis"
    condition:
      type: injection_score
      threshold: 0.3
    action: tag
    on: request
```

Combined with audit logging, these tags let you query which agents trigger which policies and how often, giving you data to set appropriate thresholds before switching from `tag`/`warn` to `block`.

---

## Example: Layered Security

This example combines multiple patterns into a defense-in-depth configuration. Policies are ordered so that cheap checks run first and expensive checks run later.

```yaml
policies:
  # Layer 1: Block high-confidence injection attempts
  - name: block-injection
    condition:
      type: injection_score
      threshold: 0.8
    action: block
    on: request

  # Layer 2: Warn on moderate injection risk
  - name: warn-injection
    condition:
      type: injection_score
      threshold: 0.5
    action: warn
    on: request

  # Layer 3: Block oversized requests
  - name: limit-length
    condition:
      type: length_exceeds
      max_length: 50000
    action: block
    on: request

  # Layer 4: Block known bad patterns
  - name: block-jailbreak-phrases
    condition:
      type: contains
      value: "ignore all previous instructions"
    action: block
    on: request

  # Layer 5: Block internal data leakage
  - name: block-api-keys
    condition:
      type: regex
      pattern: "(sk-[a-zA-Z0-9]{32,}|ghp_[a-zA-Z0-9]{36})"
    action: block
    on: request

  # Layer 6: Redact PII from responses
  - name: redact-pii
    condition:
      type: pii_detected
      categories:
        - email
        - phone
        - ssn
    action: redact
    on: response

  # Layer 7: Warn on long responses
  - name: warn-long-response
    condition:
      type: length_exceeds
      max_length: 50000
    action: warn
    on: response
```
