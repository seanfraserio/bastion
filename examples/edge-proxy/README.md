# Edge Proxy Example

Run a local Bastion proxy that forwards to your cloud Bastion instance.

## Setup

1. Set your cloud proxy key:
   ```bash
   export BASTION_PROXY_KEY=bst_your_proxy_key_here
   export LOCAL_AGENT_TOKEN=your_local_agent_token
   ```

2. Start the edge proxy:
   ```bash
   bastion start -c examples/edge-proxy/bastion.yaml
   ```

3. Point your AI agents at the local proxy:
   ```
   http://127.0.0.1:3000/v1/messages     (Anthropic)
   http://127.0.0.1:3000/v1/chat/completions  (OpenAI)
   ```

## What runs locally

- Authentication (local tokens)
- Cache (repeated prompts served locally)
- Rate limiting
- Injection detection + policy enforcement
- Audit logging to local file

## What runs in the cloud

- Tenant authentication (proxy_key)
- Billing and usage tracking
- Provider routing and API key management
- Cloud-side policies
