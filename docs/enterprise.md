# Enterprise Features

Bastion Enterprise extends the open-source proxy with advanced security, compliance, and operational features for production deployments.

---

## Semantic Cache

Go beyond exact-match caching. Semantic cache uses embedding similarity to identify equivalent requests even when the wording differs.

- Configurable similarity threshold
- Embedding model selection (local or API-based)
- Cache analytics and hit-rate dashboards

```yaml
cache:
  enabled: true
  strategy: semantic
  similarity_threshold: 0.95
  embedding_model: "text-embedding-3-small"
```

---

## ML-Based PII Detection

Replace regex-based PII detection with ML-powered Named Entity Recognition (NER) for significantly higher accuracy.

- Detects person names, organizations, and contextual PII that regex misses
- Supports custom entity types
- Runs locally -- no data leaves your infrastructure
- Fine-tunable on your domain-specific data

---

## LLM Injection Scoring

Upgrade from heuristic pattern matching to ML-based injection classification.

- Trained on large-scale prompt injection datasets
- Handles obfuscation, encoding, and multi-language attacks
- Configurable model size (speed vs. accuracy tradeoff)
- Continuous model updates

---

## SIEM Export

Stream audit logs to external Security Information and Event Management systems.

- Splunk, Datadog, Elastic, Sentinel connectors
- Real-time streaming via webhook or queue
- Configurable export filters and field mapping

```yaml
audit:
  enabled: true
  output: siem
  siem:
    type: splunk
    endpoint: "https://splunk.internal:8088"
    token: "${SPLUNK_HEC_TOKEN}"
    index: "bastion-audit"
```

---

## Compliance Reports

Generate audit reports for regulatory compliance.

- SOC 2 evidence packages
- Data access logs with retention policies
- Policy enforcement summaries
- Exportable PDF and CSV formats

---

## Role-Based Access Control (RBAC)

Control who can configure and manage Bastion.

- Define roles (admin, operator, viewer)
- Assign roles to API keys or SSO identities
- Audit all configuration changes
- Integrate with OIDC / SAML identity providers

---

## Alerting

Real-time alerts when policies trigger, rate limits are hit, or providers degrade.

- Webhook, Slack, PagerDuty, and email channels
- Configurable alert thresholds and cooldowns
- Alert aggregation to prevent notification storms

```yaml
alerts:
  channels:
    - type: slack
      webhook_url: "${SLACK_WEBHOOK_URL}"
  rules:
    - event: policy_block
      channel: slack
      cooldown_minutes: 5
    - event: provider_error_rate
      threshold: 0.1
      window_minutes: 5
      channel: slack
```

---

## Cluster Synchronization

Run multiple Bastion instances with shared state for high availability.

- Redis-backed rate limit counters (global enforcement across nodes)
- Shared cache for consistent cache hit rates
- Leader election for background tasks
- Health checking and automatic node removal

```yaml
cluster:
  enabled: true
  redis_url: "redis://redis:6379"
  node_id: "${HOSTNAME}"
```

---

## Managed Cloud

Fully managed Bastion deployment. We run the infrastructure -- you configure the policies.

- Zero-ops deployment
- Global edge network
- 99.99% SLA
- SOC 2 Type II certified infrastructure
- Dedicated support

---

## Licensing

Enterprise features are licensed under BUSL-1.1. Contact us for pricing and evaluation access.

The open-source core (MIT) includes the proxy, pipeline, all providers, exact-match cache, regex-based PII detection, heuristic injection scoring, rate limiting, and audit logging. Most teams can start with OSS and add enterprise features as they scale.
