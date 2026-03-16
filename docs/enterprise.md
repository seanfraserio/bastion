# Enterprise Features

Bastion Enterprise extends the open-source proxy with advanced security, compliance, and operational features for production deployments at scale. It replaces and enhances several OSS components through the same pipeline interfaces, so no changes to the core pipeline are required.

Enterprise features are licensed under **BUSL-1.1**. The open-source core (MIT) includes the proxy, pipeline, all providers, exact-match cache, regex-based PII detection, heuristic injection scoring, rate limiting, and audit logging.

---

## Getting Started with Enterprise

To install the enterprise package, clone it into your Bastion project:

```bash
cd packages/
git clone https://github.com/your-org/bastion-enterprise.git enterprise
cd enterprise
npm install
npm run build
```

The enterprise package exports all features from `packages/enterprise/src/index.ts`. Once installed, Bastion automatically detects the enterprise package and enables additional configuration options in `bastion.yaml`.

---

## Semantic Cache

Exact-match caching only helps when two requests are identical. Semantic cache uses vector embeddings to identify requests that mean the same thing even when worded differently. For example, "What is the capital of France?" and "Tell me France's capital city" are different strings but semantically equivalent -- semantic cache recognizes this and returns the cached response, saving an LLM call.

The cache computes an embedding for each incoming request, compares it against stored embeddings using cosine similarity, and returns the best match if it exceeds the similarity threshold. Entries are evicted based on TTL and a configurable maximum entry count (oldest entries are evicted first when the limit is reached).

### Configuration

```yaml
cache:
  enabled: true
  strategy: semantic
  similarity_threshold: 0.95    # Cosine similarity threshold (0.0-1.0). Higher = stricter matching.
  embedding_model: "text-embedding-3-small"  # Model used to generate embeddings.
  max_entries: 10000            # Maximum number of cached entries before eviction.
  ttl_seconds: 3600             # Time-to-live for cache entries in seconds.
  provider: "openai"            # Embedding provider: "openai" or "anthropic".
  api_key: "${EMBEDDING_API_KEY}"  # API key for the embedding provider.
  base_url: ""                  # Optional. Override the embedding API endpoint.
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `strategy` | `"semantic"` | -- | Enables semantic cache (replaces exact-match). |
| `similarity_threshold` | `number` | `0.95` | Minimum cosine similarity to count as a cache hit. Lower values match more broadly but risk returning less relevant cached responses. |
| `embedding_model` | `string` | `"text-embedding-3-small"` | The model used to compute embeddings. Must be compatible with the OpenAI embeddings API schema. |
| `max_entries` | `number` | `10000` | Maximum cache size. When exceeded, the oldest entries are evicted. |
| `ttl_seconds` | `number` | `3600` | How long a cache entry lives before automatic expiration. |
| `provider` | `"openai"` or `"anthropic"` | -- | Which provider supplies the embedding API. When set to `"anthropic"`, the configured `base_url` must point to an OpenAI-compatible embeddings endpoint (Anthropic does not offer a native embedding API). |
| `api_key` | `string` | -- | API key for the embedding provider. |
| `base_url` | `string` | Provider default | Override the embedding API endpoint. Useful for self-hosted embedding models or proxies. |

### How it integrates

Semantic cache replaces the exact-match cache in the pipeline. It occupies the same position (step 4: Cache Lookup and step 6: Cache Store) and uses the same interface. Cache keys are computed from the normalized request content, making them provider-agnostic.

---

## ML-Based PII Detection

The OSS PII detector uses regex patterns, which work well for structured data like email addresses (`user@example.com`), SSNs (`123-45-6789`), and credit card numbers (validated with the Luhn algorithm and card network prefix checks). However, regex struggles with unstructured entities -- person names, physical addresses, and organization names lack consistent patterns.

The enterprise PII detector adds context-based name detection that looks for patterns like "my name is ...", "signed by ...", and "contact ..." followed by sequences of capitalized words. Each detected entity includes a confidence score (0.0 to 1.0), start and end positions in the text, and the entity type. This information feeds directly into the policy engine for redaction or blocking decisions.

The enterprise detector supports five entity types: `email`, `phone`, `ssn`, `credit_card`, and `name`. All detection runs locally -- no data leaves your infrastructure.

### Configuration

PII detection is configured through policies rather than a standalone config block. The enterprise detector replaces the OSS detector transparently.

```yaml
policies:
  - name: redact-all-pii
    condition:
      type: pii_detected
      categories:
        - email
        - phone
        - ssn
        - credit_card
        - name          # Enterprise only -- ML-based name detection
    action: redact
    on: response
```

### How it integrates

The enterprise PII detector implements the same `detectPii()` interface as the OSS detector. When the enterprise package is installed, it replaces the OSS regex detector automatically. Policies that reference `pii_detected` conditions work identically -- only the detection accuracy changes.

---

## PII Redaction

The enterprise redactor supports four strategies for handling detected PII entities, giving you control over how sensitive data is replaced.

| Strategy | Description | Example output |
|----------|-------------|----------------|
| `mask` | Replace with a type-specific label | `[EMAIL_REDACTED]`, `[SSN_REDACTED]` |
| `hash` | Replace with a truncated SHA-256 hash | `PII_HASH_a1b2c3d4e5f6` |
| `tokenize` | Replace with a UUID token and maintain a reversible token map | `PII_TOKEN_550e8400-e29b-...` |
| `remove` | Delete the entity entirely (empty string replacement) | *(content removed)* |

The `mask` strategy is the default and the most common choice for production. Use `hash` when you need deterministic replacement (the same input always produces the same hash) for analytics that need to correlate entities without exposing them. Use `tokenize` when you need reversibility -- the redactor returns a token map that lets you recover the original values if authorized. Use `remove` when you want no trace of the entity in the output.

### Configuration

```yaml
pii:
  redaction_strategy: mask      # "mask", "hash", "tokenize", or "remove"
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `redaction_strategy` | `string` | `"mask"` | How detected PII entities are replaced. See strategy table above. |

### How it integrates

The redactor runs as part of the policy evaluation phase. When a policy with action `redact` matches, the redactor processes the content using the configured strategy. Entities are replaced from the end of the string to the start, preserving character positions for earlier entities.

---

## LLM Injection Scoring

The OSS injection scorer uses heuristic pattern matching -- it looks for known phrases like "ignore previous instructions" and scores based on pattern density. This catches straightforward attacks but misses obfuscated attempts, encoded payloads, and multilingual injection patterns.

The enterprise scorer calls an external LLM classifier (Anthropic or OpenAI) to evaluate whether a piece of text is a prompt injection attempt. The classifier returns a score (0.0 to 1.0), a confidence level, and a brief reasoning explanation. Results are cached in-memory for 60 seconds (keyed on a SHA-256 hash of the input) to avoid redundant classifier calls.

The scorer is designed to fail safe: if the classifier API is unreachable or returns an error, the scorer returns a score of 0 with zero confidence and the reasoning "Scoring unavailable." This means a classifier outage does not block legitimate traffic.

### Configuration

```yaml
injection:
  scorer: ml                    # "ml" for enterprise LLM-based scoring
  provider: "anthropic"         # "anthropic" or "openai"
  api_key: "${INJECTION_SCORER_API_KEY}"
  model: "claude-haiku-4-5-20251001"  # Model used for classification
  base_url: ""                  # Optional. Override the classifier API endpoint.
  timeout_ms: 5000              # Maximum time to wait for a classification response.
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `scorer` | `"ml"` | -- | Enables ML-based scoring (replaces heuristic). |
| `provider` | `"anthropic"` or `"openai"` | -- | Which LLM provider to use for classification. |
| `api_key` | `string` | -- | API key for the classifier provider. |
| `model` | `string` | `"claude-haiku-4-5-20251001"` (Anthropic) or `"gpt-4o-mini"` (OpenAI) | The model to use for injection classification. Smaller models are faster; larger models are more accurate. |
| `base_url` | `string` | Provider default | Override the API endpoint. Useful for self-hosted models. |
| `timeout_ms` | `number` | `5000` | Maximum milliseconds to wait for the classifier. If exceeded, the request is aborted and the safe default score (0) is returned. |

### How it integrates

The ML scorer replaces the heuristic scorer at pipeline step 2 (Injection Detection). It writes the score to the PipelineContext, where downstream policies can reference it via `injection_score` conditions. The same policies work with both the OSS and enterprise scorer -- only the scoring accuracy changes.

---

## SIEM Export

SIEM export streams Bastion audit log entries to external Security Information and Event Management systems in real time. This is essential for organizations that centralize security monitoring and need Bastion events alongside application logs, firewall events, and other security data.

The exporter supports two backends: **Splunk** (via the HTTP Event Collector) and **Elastic** (via the Bulk API). Entries are buffered in memory and flushed in batches to reduce network overhead. If a flush fails, the exporter retries with exponential backoff (up to 3 attempts). After exhausting retries, entries are dropped and an error is logged -- the exporter never blocks the pipeline.

### Configuration

**Splunk:**

```yaml
audit:
  enabled: true
  output: siem
  siem:
    type: splunk
    endpoint: "https://splunk.internal:8088/services/collector"
    token: "${SPLUNK_HEC_TOKEN}"
    index: "bastion-audit"
    batch_size: 100             # Number of entries per flush.
    flush_interval_ms: 10000    # Milliseconds between automatic flushes.
```

**Elastic:**

```yaml
audit:
  enabled: true
  output: siem
  siem:
    type: elastic
    endpoint: "https://elastic.internal:9200"
    token: "${ELASTIC_API_KEY}"
    index: "bastion-audit"
    batch_size: 100
    flush_interval_ms: 10000
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `type` | `"splunk"` or `"elastic"` | -- | Which SIEM backend to use. |
| `endpoint` | `string` | -- | The SIEM ingest endpoint. For Splunk, this is the HEC URL. For Elastic, this is the cluster URL (the `/_bulk` path is appended automatically). |
| `token` | `string` | -- | Authentication token. For Splunk: HEC token. For Elastic: API key. |
| `index` | `string` | -- | Target index name in the SIEM. |
| `batch_size` | `number` | `100` | Number of entries to accumulate before flushing. Larger batches reduce network calls but increase memory use and latency. |
| `flush_interval_ms` | `number` | `10000` | Maximum milliseconds between automatic flushes, even if the batch is not full. |

### How it integrates

SIEM export extends the audit middleware (pipeline step 8). When configured, audit entries are sent both to the standard output (stdout/file) and to the SIEM backend. The exporter runs asynchronously and never blocks the request pipeline.

---

## Compliance Reports

Compliance reports generate structured audit evidence for regulatory frameworks. Bastion currently supports **SOC 2** and **HIPAA** report formats.

Reports are generated from the audit log and include a summary section (total requests, blocked requests, policy violations, PII detections, injection attempts, average response time, unique agents and teams) and a list of categorized entries mapped to the relevant compliance controls.

**SOC 2** reports map events to Trust Services Criteria:
- **CC6.1** -- Access control events (blocked requests)
- **CC7.1** -- System monitoring (request volume, response times)
- **CC7.2** -- Anomaly detection (injection attempts)
- **CC8.1** -- Change management (policy violation summaries)

**HIPAA** reports map events to Security Rule provisions:
- **\u00A7164.312(b)** -- Audit controls (logged requests)
- **\u00A7164.312(a)(1)** -- Access control (authorized vs. blocked requests)
- **\u00A7164.312(e)(1)** -- Transmission security (provider interactions)
- **\u00A7164.530(j)** -- Record retention (log completeness)

### Configuration

```yaml
compliance:
  enabled: true
  frameworks:
    - soc2
    - hipaa
  schedule: "daily"             # How often to generate reports: "daily", "weekly", "monthly"
  retention_days: 365           # How long to keep generated reports
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `frameworks` | `string[]` | -- | Which compliance frameworks to generate reports for. Supported: `"soc2"`, `"hipaa"`. |
| `schedule` | `string` | `"daily"` | Report generation frequency. |
| `retention_days` | `number` | `365` | How long generated reports are retained before cleanup. |

### How it integrates

Compliance reports consume the same audit log entries that the audit middleware produces. Report generation runs as a background task on the configured schedule. Each report covers the entries from the previous period (day, week, or month) and produces a structured `ComplianceReport` object that can be exported to PDF or CSV.

---

## Team RBAC

Team RBAC lets you scope policies per team, so different teams can have different security rules applied to their agents. Each team is defined as a policy namespace with its own set of policy rules, and teams can inherit from a base namespace to share common policies.

For example, a "payments" team might have strict PII redaction policies that the "internal-tools" team does not need. Instead of writing a single set of policies that covers every team, you define base policies that apply to everyone and then override or extend them per team.

When a request arrives with a team identifier, the TeamPolicyManager resolves the effective policy set by merging the team's own policies with inherited policies. If a team policy has the same name as a base policy, the team policy takes precedence.

### Configuration

```yaml
rbac:
  enabled: true
  teams:
    - name: default
      namespace: base
      policies:
        - name: block-injection
          condition:
            type: injection_score
            threshold: 0.8
          action: block
          on: request
        - name: redact-pii
          condition:
            type: pii_detected
            categories: [email, phone, ssn]
          action: redact
          on: response

    - name: payments
      namespace: payments
      inherits_from: default    # Inherit all 'default' policies
      policies:
        - name: redact-pii      # Override: add credit_card to redaction
          condition:
            type: pii_detected
            categories: [email, phone, ssn, credit_card, name]
          action: redact
          on: response
        - name: block-financial-data
          condition:
            type: regex
            pattern: "\\b\\d{9,18}\\b"
          action: block
          on: request
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | `string` | Yes | Team identifier. Matched against the team name in the request. |
| `namespace` | `string` | Yes | Policy namespace for this team. Used for scoping and logging. |
| `inherits_from` | `string` | No | Name of the team to inherit policies from. Inherited policies are included unless overridden by a policy with the same name. |
| `policies` | `PolicyRule[]` | Yes | The team's policy rules. Same structure as top-level policies. |

### How it integrates

Team RBAC extends the policy evaluation phase (pipeline steps 3 and 7). When a request includes a team identifier, the TeamPolicyManager resolves the effective policy set and passes it to the policy evaluator in place of the global policies. If no team is identified, the global policies apply as usual.

---

## Alerting

Alerting sends real-time notifications when security-relevant events occur -- policy blocks, injection detections, provider errors, rate limit hits. Alerts are dispatched through configured channels: **Slack** (via incoming webhook), **PagerDuty** (via Events API v2), or a **generic webhook** (HTTP POST with bearer token).

Alerts are sent asynchronously and never block the pipeline. If delivery fails, the alerter retries with exponential backoff (up to 3 attempts). After exhausting retries, a failure is logged but the pipeline continues normally.

### Configuration

```yaml
alerts:
  channels:
    - name: slack-security
      type: slack
      url: "${SLACK_WEBHOOK_URL}"

    - name: pagerduty-oncall
      type: pagerduty
      url: "https://events.pagerduty.com/v2/enqueue"
      token: "${PAGERDUTY_ROUTING_KEY}"

    - name: custom-webhook
      type: webhook
      url: "https://internal.example.com/bastion-alerts"
      token: "${WEBHOOK_BEARER_TOKEN}"    # Optional. Sent as Bearer token in Authorization header.

  rules:
    - event: policy_block
      channel: slack-security
      cooldown_minutes: 5

    - event: injection_detected
      channel: pagerduty-oncall
      cooldown_minutes: 15

    - event: provider_error_rate
      threshold: 0.1              # Alert when error rate exceeds 10%
      window_minutes: 5
      channel: slack-security
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `channels[].name` | `string` | Yes | Identifier for this channel. Referenced by alert rules. |
| `channels[].type` | `"slack"`, `"pagerduty"`, or `"webhook"` | Yes | Delivery mechanism. |
| `channels[].url` | `string` | Yes | Endpoint URL. For Slack: incoming webhook URL. For PagerDuty: Events API URL. For webhook: your endpoint. |
| `channels[].token` | `string` | No | Authentication token. Required for PagerDuty (routing key) and optional for webhook (bearer token). Not used for Slack (authentication is embedded in the webhook URL). |
| `rules[].event` | `string` | Yes | The event type that triggers this alert. |
| `rules[].channel` | `string` | Yes | Which channel to send the alert to. Must match a `channels[].name`. |
| `rules[].cooldown_minutes` | `number` | No | Minimum minutes between alerts of the same type. Prevents notification storms. |
| `rules[].threshold` | `number` | No | For rate-based events. The rate that triggers the alert. |
| `rules[].window_minutes` | `number` | No | For rate-based events. The time window over which the rate is measured. |

**Slack alerts** are formatted with Block Kit and include a header (alert title), a section with severity and message, and a context block with the timestamp and source.

**PagerDuty alerts** create incidents via the Events API v2 with the alert summary, severity, and `bastion-proxy` as the source.

**Webhook alerts** send a JSON payload with the alert details, timestamp, and source identifier. If a token is configured, it is sent as a Bearer token in the `Authorization` header.

### How it integrates

Alerting hooks into multiple pipeline stages. Policy blocks, injection detections, and PII findings generate alert events during policy evaluation. Provider errors generate events during the provider call. Rate limit events generate alerts at pipeline step 1. All alert dispatches are asynchronous and non-blocking.

---

## Cluster Synchronization

Cluster sync enables multiple Bastion instances to operate as a coordinated group with shared state. This is essential for high-availability deployments where rate limits must be enforced globally (not per-node) and configuration changes must propagate to all instances.

The cluster uses a peer-to-peer HTTP mesh. Each node registers with its configured peers, broadcasts configuration updates via `POST /cluster/sync`, and runs periodic health checks against all known peers. Nodes that fail to respond within three health check intervals are marked unhealthy (but retained in the peer list for automatic recovery).

Each node tracks its own configuration version (a SHA-256 hash of the active configuration). When a configuration update arrives from a peer, the node compares the hash -- if it differs, the new configuration is applied.

### Configuration

```yaml
cluster:
  enabled: true
  node_id: "${HOSTNAME}"        # Unique identifier for this node.
  address: "http://${HOSTNAME}:4000"  # This node's reachable address.
  peers:                        # List of peer node addresses.
    - "http://bastion-0:4000"
    - "http://bastion-1:4000"
    - "http://bastion-2:4000"
  health_interval_ms: 30000     # Milliseconds between health checks.
  sync_timeout_ms: 5000         # Timeout for sync and health check requests.
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `node_id` | `string` | -- | Unique identifier for this node. Typically set to `${HOSTNAME}` in container environments. |
| `address` | `string` | -- | The HTTP address where this node is reachable by peers. |
| `peers` | `string[]` | -- | List of peer addresses to register with and health check. Include all nodes, including self (self-registration is handled automatically). |
| `health_interval_ms` | `number` | `30000` | How often to health check peers, in milliseconds. |
| `sync_timeout_ms` | `number` | `5000` | Timeout for sync and health check HTTP requests. |

### Cluster status

Each node exposes a `GET /cluster/health` endpoint that returns the node's configuration version, and a `GET /cluster/status` endpoint that returns the full cluster state:

```json
{
  "nodeId": "bastion-0",
  "totalNodes": 3,
  "healthyNodes": 3,
  "configVersion": "a1b2c3d4...",
  "nodes": [
    { "id": "bastion-0", "address": "http://bastion-0:4000", "healthy": true },
    { "id": "bastion-1", "address": "http://bastion-1:4000", "healthy": true },
    { "id": "bastion-2", "address": "http://bastion-2:4000", "healthy": true }
  ]
}
```

### How it integrates

Cluster sync operates as a background service alongside the pipeline. It does not add a middleware step -- instead, it ensures that shared state (rate limit counters, configuration) is consistent across nodes. Rate limiting reads from and writes to Redis-backed counters that are shared across the cluster. Cache entries can also be shared via Redis when configured.

---

## Managed Cloud

Fully managed Bastion deployment. We run the infrastructure -- you configure the policies.

- Zero-ops deployment
- Global edge network
- 99.99% SLA
- SOC 2 Type II certified infrastructure
- Dedicated support

Contact us for details.

---

## Licensing

Enterprise features are licensed under **BUSL-1.1**. Contact us for pricing and evaluation access.

The open-source core (MIT) includes the proxy, pipeline, all providers, exact-match cache, regex-based PII detection, heuristic injection scoring, rate limiting, and audit logging. Most teams can start with OSS and add enterprise features as they scale.
