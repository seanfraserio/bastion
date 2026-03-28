import { describe, it, expect, vi, beforeEach, type MockInstance } from "vitest";

// Mock ioredis before importing the module under test
vi.mock("ioredis", () => {
  const mockOn = vi.fn().mockReturnThis();
  const MockRedis = vi.fn().mockImplementation(() => ({ on: mockOn }));
  return { default: MockRedis };
});

import Redis from "ioredis";
import { createRedisClient } from "./redis.js";

describe("createRedisClient", () => {
  let RedisMock: MockInstance;

  beforeEach(() => {
    vi.clearAllMocks();
    RedisMock = Redis as unknown as MockInstance;
  });

  it("creates a client with default config when only url is provided", () => {
    createRedisClient({ url: "redis://localhost:6379" });
    expect(RedisMock).toHaveBeenCalledOnce();
    expect(RedisMock).toHaveBeenCalledWith(
      "redis://localhost:6379",
      expect.objectContaining({
        keyPrefix: "bastion:",
        connectTimeout: 5000,
      }),
    );
  });

  it("passes URL to ioredis constructor", () => {
    const url = "redis://myhost:6380";
    createRedisClient({ url });
    expect(RedisMock).toHaveBeenCalledWith(url, expect.any(Object));
  });

  it("sets key prefix from config", () => {
    createRedisClient({ url: "redis://localhost:6379", keyPrefix: "myapp:" });
    expect(RedisMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ keyPrefix: "myapp:" }),
    );
  });

  it("sets connect timeout from config", () => {
    createRedisClient({ url: "redis://localhost:6379", connectTimeoutMs: 10000 });
    expect(RedisMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ connectTimeout: 10000 }),
    );
  });

  it("registers an error event handler", () => {
    const mockClient = { on: vi.fn().mockReturnThis() };
    RedisMock.mockImplementationOnce(() => mockClient);

    createRedisClient({ url: "redis://localhost:6379" });

    expect(mockClient.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("returns the Redis client instance", () => {
    const mockClient = { on: vi.fn().mockReturnThis() };
    RedisMock.mockImplementationOnce(() => mockClient);

    const result = createRedisClient({ url: "redis://localhost:6379" });

    expect(result).toBe(mockClient);
  });
});
