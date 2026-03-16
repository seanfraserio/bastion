# Provider Fallback

Demonstrates automatic provider fallback. Anthropic is the primary provider; if it fails or times out, Bastion automatically retries the request against OpenAI.

This example also enables exact-match response caching with a one-hour TTL, a global rate limit of 500 requests per minute, and file-based audit logging.

## Usage

```bash
export ANTHROPIC_API_KEY=sk-ant-...
export OPENAI_API_KEY=sk-...
bastion start -c bastion.yaml
```

When Anthropic returns an error or exceeds the 30-second timeout, Bastion transparently routes the request to OpenAI. The fallback is invisible to your application.
