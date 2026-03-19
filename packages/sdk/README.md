# @openbastion-ai/sdk

Typed admin API client for [Bastion](https://github.com/seanfraserio/bastion).

## Install

```bash
npm install @openbastion-ai/sdk
```

## Usage

```typescript
import { BastionClient } from "@openbastion-ai/sdk";

const client = new BastionClient("http://localhost:4000");

// Health check
const health = await client.health();
console.log(health.status); // "ok"

// Get proxy stats
const stats = await client.stats();
console.log(stats.totalRequests);
console.log(stats.cacheHitRate);
```

## API

### `new BastionClient(baseUrl: string)`

Creates a client pointing at a running Bastion proxy.

### `client.health(): Promise<HealthResponse>`

Returns `{ status: "ok", version: string }`.

### `client.stats(): Promise<StatsResponse>`

Returns request counts, error counts, cache hit rates, and provider statistics.

## License

MIT
