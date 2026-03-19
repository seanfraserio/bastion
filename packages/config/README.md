# @openbastion-ai/config

Configuration schema and YAML loader for [Bastion](https://github.com/seanfraserio/bastion).

## Install

```bash
npm install @openbastion-ai/config
```

## Usage

```typescript
import { loadConfig } from "@openbastion-ai/config";

const config = await loadConfig("./bastion.yaml");
// config is fully validated with Zod
```

## Features

- **Zod schema validation** — every field validated at load time
- **Environment variable interpolation** — `${ENV_VAR}` syntax for secrets
- **Provider references** — validates that referenced providers exist
- **Hot reload** — watch for config changes with `watchConfig()`

## Schema

```yaml
version: "1"

proxy:
  port: 4000
  host: 127.0.0.1

auth:
  enabled: true
  tokens:
    - name: production
      token: ${BASTION_TOKEN}

providers:
  primary: anthropic
  fallback: [openai]
  anthropic:
    api_key: ${ANTHROPIC_API_KEY}

rate_limit:
  requests_per_minute: 60

policies:
  - name: block-injection
    on: request
    if: { injection_score: { gt: 0.8 } }
    then: block

cache:
  enabled: true
  ttl: 3600

audit:
  exporters: [stdout, file]
```

## License

MIT
