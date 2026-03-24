import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { CachedResolver } from "./cached-resolver.js";

describe("CachedResolver", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("resolve() returns fetched data", async () => {
    const resolver = new CachedResolver<string>();
    const result = await resolver.resolve("key1", async () => "value1");
    expect(result).toBe("value1");
  });

  it("resolve() returns cached data on second call (fetcher NOT called again)", async () => {
    const resolver = new CachedResolver<string>();
    const fetcher = vi.fn(async () => "value1");

    await resolver.resolve("key1", fetcher);
    const result = await resolver.resolve("key1", fetcher);

    expect(result).toBe("value1");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("resolve() re-fetches after TTL expires", async () => {
    const resolver = new CachedResolver<string>({ ttlMs: 50 });
    const fetcher = vi.fn()
      .mockResolvedValueOnce("value1")
      .mockResolvedValueOnce("value2");

    const first = await resolver.resolve("key1", fetcher);
    expect(first).toBe("value1");

    // Advance time past TTL
    vi.advanceTimersByTime(60);

    const second = await resolver.resolve("key1", fetcher);
    expect(second).toBe("value2");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("resolve() returns null when fetcher returns null (doesn't cache nulls)", async () => {
    const resolver = new CachedResolver<string>();
    const fetcher = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("value1");

    const first = await resolver.resolve("key1", fetcher);
    expect(first).toBeNull();

    const second = await resolver.resolve("key1", fetcher);
    expect(second).toBe("value1");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("invalidate() forces re-fetch", async () => {
    const resolver = new CachedResolver<string>();
    const fetcher = vi.fn()
      .mockResolvedValueOnce("value1")
      .mockResolvedValueOnce("value2");

    await resolver.resolve("key1", fetcher);
    resolver.invalidate("key1");

    const result = await resolver.resolve("key1", fetcher);
    expect(result).toBe("value2");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("clear() empties cache", async () => {
    const resolver = new CachedResolver<string>();
    await resolver.resolve("key1", async () => "value1");
    await resolver.resolve("key2", async () => "value2");

    expect(resolver.size).toBe(2);
    resolver.clear();
    expect(resolver.size).toBe(0);
  });

  it("respects maxEntries (evicts oldest)", async () => {
    const resolver = new CachedResolver<string>({ maxEntries: 2 });

    await resolver.resolve("key1", async () => "value1");
    // Advance time so key2 has a later expiry than key1
    vi.advanceTimersByTime(1);
    await resolver.resolve("key2", async () => "value2");
    // key1 has the earliest expiry, so it should be evicted
    await resolver.resolve("key3", async () => "value3");

    expect(resolver.size).toBe(2);

    // key1 should have been evicted (oldest expiry)
    const fetcher = vi.fn(async () => "refetched");
    const result = await resolver.resolve("key1", fetcher);
    expect(result).toBe("refetched");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
