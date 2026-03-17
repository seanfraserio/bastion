# Trilogy Demo: Forge → Bastion → Lantern

This demo shows the three products working together:

1. **Forge** defines an agent as code in `forge.yaml`
2. **Bastion** proxies the agent's LLM traffic with policy enforcement
3. **Lantern** receives traces from Bastion for observability

## Prerequisites

- Bastion proxy running (local or cloud)
- Lantern instance (optional, for trace viewing)
- Anthropic API key

## Setup

```bash
# 1. Start Bastion locally
cd /path/to/bastion
export ANTHROPIC_API_KEY=sk-ant-...
bastion start

# 2. Define agent with Forge (points at Bastion)
cd examples/trilogy-demo
forge validate -c forge.yaml
forge deploy -c forge.yaml

# 3. Send a request through the agent (via Bastion)
curl -X POST http://localhost:4000/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -d '{
    "model": "claude-haiku-4-5-20251001",
    "max_tokens": 100,
    "messages": [{"role": "user", "content": "Summarize what Bastion does in one sentence."}]
  }'

# 4. Check Bastion stats
bastion status

# 5. View traces in Lantern (if configured)
# Open http://localhost:3000 to see the trace
```

## What happens

```
Your App
    │
    ▼
Forge (forge.yaml)
    │ base_url: http://localhost:4000
    ▼
Bastion Proxy (:4000)
    │ Rate Limit → Injection → Policy → Cache
    ▼
Anthropic API
    │
    ▼ (trace span)
Lantern (:3000)
    │
    ▼
Dashboard (traces, spans, metrics)
```

## Cloud version

For the managed cloud proxy:

```bash
# Create a tenant
curl -X POST https://api.openbastionai.org/tenants \
  -H "Content-Type: application/json" \
  -d '{"name":"Demo","email":"demo@example.com","providerKeys":{"anthropic":"sk-ant-..."}}'

# Update forge.yaml to point at the cloud proxy
# base_url: https://proxy.openbastionai.org
# Use the proxy key as the API key
```
