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

    // Evict if at capacity
    if (this.cache.size >= this.maxEntries) {
      const oldest = [...this.cache.entries()].sort((a, b) => a[1].expiresAt - b[1].expiresAt)[0];
      if (oldest) this.cache.delete(oldest[0]);
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
