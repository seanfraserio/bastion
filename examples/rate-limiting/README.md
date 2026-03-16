# Rate Limiting

Demonstrates per-agent rate limiting with global defaults. Three tiers are configured:

- **Global default** -- 1,000 requests per minute for any agent without a specific override.
- **support-triage** -- Capped at 100 requests per minute to prevent a chatbot from monopolizing capacity.
- **batch-processor** -- Capped at 20 requests per minute and 10,000 tokens per minute to keep batch jobs from spiking costs.

Agents identify themselves via the `X-Bastion-Agent` header. Any request without this header falls under the global limit.

## Usage

```bash
export ANTHROPIC_API_KEY=sk-ant-...
bastion start -c bastion.yaml
```

Test with agent identification:

```bash
curl http://localhost:4000/v1/messages \
  -H "X-Bastion-Agent: support-triage" \
  -H "Content-Type: application/json" \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":100,"messages":[{"role":"user","content":"Hello"}]}'
```

Exceed the limit and you will receive a `429 Too Many Requests` response.
