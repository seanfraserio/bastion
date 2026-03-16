# Basic Proxy

The simplest possible Bastion configuration. This example proxies all requests directly to the Anthropic API with no caching, no rate limiting, and no policy enforcement.

Audit logging is enabled and writes to stdout so you can see every request flowing through the proxy.

## Usage

```bash
export ANTHROPIC_API_KEY=sk-ant-...
bastion start -c bastion.yaml
```

Then point your application at `http://localhost:4000` instead of the Anthropic API.
