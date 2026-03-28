import Redis from "ioredis";

export interface RedisClientConfig {
  url: string;
  keyPrefix?: string;
  connectTimeoutMs?: number;
}

export function createRedisClient(config: RedisClientConfig): Redis {
  const client = new Redis(config.url, {
    keyPrefix: config.keyPrefix ?? "bastion:",
    connectTimeout: config.connectTimeoutMs ?? 5000,
    maxRetriesPerRequest: 3,
    retryStrategy(times: number) {
      if (times > 5) return null;
      return Math.min(times * 200, 2000);
    },
    lazyConnect: false,
  });

  client.on("error", (err) => {
    console.error("[bastion] Redis connection error:", err.message);
  });

  return client;
}

export type { Redis };
