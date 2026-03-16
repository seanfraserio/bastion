# Policies

Policies are declarative rules that Bastion evaluates against request and response content. Each policy specifies a condition to match, an action to take, and the phase (request or response) in which to evaluate.

Policies are evaluated in the order they appear in `bastion.yaml`. A `block` action short-circuits evaluation -- no further policies run after a block.

## Policy Structure

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

- name: warn-suspicious-prompts
  condition:
    type: injection_score
    threshold: 0.5
  action: warn
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

## Example: Layered Security

Combine multiple policies for defense in depth:

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

  # Layer 5: Redact PII from responses
  - name: redact-pii
    condition:
      type: pii_detected
      categories:
        - email
        - phone
        - ssn
    action: redact
    on: response
```
