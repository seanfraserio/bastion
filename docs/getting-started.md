# Getting Started with Bastion

## What You'll Build

By the end of this tutorial, you will have a working Bastion proxy running on your local machine, intercepting AI traffic between your application and an LLM provider. Every request and response will flow through Bastion, giving you a single control point for audit logging, policy enforcement, caching, and rate limiting -- even before you enable any of those features. Your application will talk to Bastion on `localhost:4000`, and Bastion will forward requests to Anthropic on your behalf.

## 1. Install

We will start by installing the Bastion CLI globally via npm:

```bash
npm install -g @openbastion-ai/cli
```

Verify the installation:

```bash
bastion --version
```

You'll see the installed version number printed to the terminal.

## 2. Create a Configuration

Next, we will create the configuration file that tells Bastion how to behave. Create a file called `bastion.yaml` in your project root:

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

This is the simplest possible configuration -- it proxies requests to Anthropic and logs every request to stdout. Notice that caching, rate limiting, and policies are all disabled. We will keep things minimal for now and layer on features later.

## 3. Set Environment Variables

Bastion resolves `${VAR_NAME}` references in your config from the environment. We need to set the Anthropic API key so Bastion can authenticate with the provider on your behalf:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

Replace `sk-ant-...` with your actual API key from the [Anthropic Console](https://console.anthropic.com/).

## 4. Validate Your Config

Before starting, we will check that the configuration is valid:

```bash
bastion validate
```

This parses your `bastion.yaml`, checks it against the schema, and reports any errors. If everything is correct, you'll see a success message. If there are problems -- a missing field, an invalid value, an unresolved environment variable -- Bastion will tell you exactly what to fix.

## 5. Start the Proxy

Now we will start Bastion:

```bash
bastion start
```

Bastion starts listening on `http://127.0.0.1:4000`. You'll see output like this:

```
[bastion] Proxy listening on http://127.0.0.1:4000
[bastion] Primary provider: anthropic
[bastion] Audit: stdout
```

Notice that Bastion confirms which provider it is using and where audit logs will go. Leave this terminal running -- Bastion needs to stay active to proxy requests.

## 6. Point Your Application at Bastion

Instead of hitting the Anthropic API directly, we will point your application at the Bastion proxy. Most SDKs support a base URL override:

```bash
# Node.js / TypeScript
ANTHROPIC_BASE_URL=http://localhost:4000 node your-app.js
```

```python
# Python
import anthropic
client = anthropic.Anthropic(base_url="http://localhost:4000")
```

Your application code does not need to change -- only the base URL. Bastion accepts the same API format that Anthropic does, so your existing SDK calls work without modification.

## 7. Verify Everything Works

Finally, we will run the built-in connectivity test:

```bash
bastion test
```

This sends a small request through the proxy and confirms that the provider responds, policies evaluate, and audit logging works. You'll see a summary of what succeeded and what failed.

If the test passes, you are up and running. Switch to the terminal where Bastion is running and you'll see the audit log entry for the test request.

## Troubleshooting

### Port Already in Use

If you see an error like `EADDRINUSE: address already in use :::4000`, another process is already listening on port 4000. You can either stop that process or change the port in `bastion.yaml`:

```yaml
proxy:
  port: 4001
```

To find what is using the port:

```bash
lsof -i :4000
```

### Missing API Key

If Bastion reports an unresolved environment variable at startup, the required API key is not set in your shell session. Verify it is exported:

```bash
echo $ANTHROPIC_API_KEY
```

If this prints nothing, re-export the key. Note that environment variables do not persist across terminal sessions unless added to your shell profile (`.bashrc`, `.zshrc`, etc.).

### Invalid YAML Syntax

YAML is sensitive to indentation and special characters. Common mistakes include:

- Using tabs instead of spaces (YAML requires spaces)
- Missing quotes around values that contain special characters like `$`, `:`, or `{`
- Incorrect indentation depth (each nested level should be two spaces)

Run `bastion validate` to get specific error messages pointing to the problematic line.

### Proxy Not Intercepting Requests

If your application is still hitting the provider directly instead of going through Bastion:

- Confirm that Bastion is running (`bastion start` in a separate terminal)
- Verify that your application's base URL is set to `http://localhost:4000` (or whichever port you configured)
- Check that the base URL override is taking effect -- some SDKs require the environment variable to be set before the client is instantiated
- Test with `curl` directly to isolate the issue:

```bash
curl http://localhost:4000/v1/messages \
  -H "Content-Type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-sonnet-4-20250514","max_tokens":64,"messages":[{"role":"user","content":"Hello"}]}'
```

If `curl` works but your application does not, the issue is in how your application configures its HTTP client.

## Next Steps

You're now running Bastion as a local proxy in front of Anthropic. Every request flows through it, and every request is logged. This is the foundation -- from here, you can layer on the features that matter to your use case.

Here are good things to try next:

- [bastion.yaml Reference](./bastion-yaml-reference.md) -- Explore the full set of configuration options available to you
- [Concepts](./concepts.md) -- Understand the pipeline model and middleware chain that powers Bastion's request processing
- [Policies](./policies.md) -- Add PII redaction, prompt injection detection, and content filtering to protect your AI traffic
- [Providers](./providers.md) -- Configure OpenAI, Ollama, or Bedrock as additional providers, and set up automatic failover
- [Self-Hosting](./self-hosting.md) -- Deploy Bastion in Docker, Kubernetes, or as a sidecar for production workloads
