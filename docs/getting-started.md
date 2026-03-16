# Getting Started with Bastion

This guide walks you through installing Bastion, creating a configuration, and proxying your first LLM request.

## 1. Install

```bash
npm install -g @openbastion-ai/cli
```

Verify the installation:

```bash
bastion --version
```

## 2. Create a Configuration

Create a file called `bastion.yaml` in your project root:

```yaml
version: "1"

proxy:
  port: 4000
  host: "127.0.0.1"
  log_level: info

providers:
  primary: anthropic
  definitions:
    anthropic:
      api_key: "${ANTHROPIC_API_KEY}"
      timeout_ms: 30000

cache:
  enabled: false

rate_limits:
  enabled: false

policies: []

audit:
  enabled: true
  output: stdout
  include_request_body: false
  include_response_body: false
```

This is the simplest possible configuration -- it proxies requests to Anthropic and logs every request to stdout.

## 3. Set Environment Variables

Bastion resolves `${VAR_NAME}` references in your config from the environment:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## 4. Validate Your Config

Before starting, check that your configuration is valid:

```bash
bastion validate
```

This parses your `bastion.yaml`, checks the schema, and reports any errors.

## 5. Start the Proxy

```bash
bastion start
```

Bastion starts listening on `http://127.0.0.1:4000`. You should see:

```
[bastion] Proxy listening on http://127.0.0.1:4000
[bastion] Primary provider: anthropic
[bastion] Audit: stdout
```

## 6. Point Your Application at Bastion

Instead of hitting the Anthropic API directly, point your application at the Bastion proxy. Most SDKs support a base URL override:

```bash
# Node.js / TypeScript
ANTHROPIC_BASE_URL=http://localhost:4000 node your-app.js
```

```python
# Python
import anthropic
client = anthropic.Anthropic(base_url="http://localhost:4000")
```

Your application code does not need to change -- only the base URL.

## 7. Verify Everything Works

Run the built-in connectivity test:

```bash
bastion test
```

This sends a small request through the proxy and confirms that the provider responds, policies evaluate, and audit logging works.

## Next Steps

- [bastion.yaml Reference](./bastion-yaml-reference.md) -- Full documentation of every config field
- [Concepts](./concepts.md) -- Understand the pipeline model and middleware chain
- [Policies](./policies.md) -- Add PII redaction, injection detection, and content filtering
- [Providers](./providers.md) -- Configure OpenAI, Ollama, Bedrock, and provider fallback
- [Self-Hosting](./self-hosting.md) -- Run Bastion in Docker, Kubernetes, or as a sidecar
