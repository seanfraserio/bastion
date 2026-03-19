/**
 * Generic cached resolver — looks up a value by key with TTL caching.
 * Used for tenant resolution, config caching, etc.
 */
export class CachedResolver<T> {
  private cache = new Map<string, { data: T; expiresAt: number }>();
  private ttlMs: number;
  private maxEntries: number;

  constructor(opts?: { ttlMs?: number; maxEntries?: number }) {
    this.ttlMs = opts?.ttlMs ?? 60_000;
    this.maxEntries = opts?.maxEntries ?? 10_000;
  }

  async resolve(key: string, fetcher: () => Promise<T | null>): Promise<T | null> {
    // Check cache
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data;
    }

    // Fetch
    const data = await fetcher();
    if (data === null) return null;

    // Evict oldest entry if at capacity
    if (this.cache.size >= this.maxEntries) {
      let oldestKey: string | undefined;
      let oldestExpiry = Infinity;
      for (const [k, v] of this.cache) {
        if (v.expiresAt < oldestExpiry) {
          oldestExpiry = v.expiresAt;
          oldestKey = k;
        }
      }
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }

    // Cache
    this.cache.set(key, { data, expiresAt: Date.now() + this.ttlMs });
    return data;
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}
