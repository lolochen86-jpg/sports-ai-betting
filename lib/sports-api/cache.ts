// Server-side in-memory TTL cache for external API responses
// Avoids hitting MLB/ESPN APIs on every request

interface CacheEntry<T> {
  data: T;
  expiresAt: number; // Unix timestamp in ms
}

const store = new Map<string, CacheEntry<unknown>>();

export const apiCache = {
  get<T>(key: string): T | null {
    const entry = store.get(key) as CacheEntry<T> | undefined;
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      store.delete(key);
      return null;
    }
    return entry.data;
  },

  set<T>(key: string, data: T, ttlSeconds: number): void {
    store.set(key, {
      data,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });
  },

  has(key: string): boolean {
    return this.get(key) !== null;
  },

  clear(): void {
    store.clear();
  },
};

// Default TTLs (in seconds)
export const CacheTTL = {
  TEAMS: 86400,     // 24 hours — teams rarely change
  GAMES: 60,        // 1 minute — scores update frequently during live games
  PLAYERS: 21600,   // 6 hours — rosters change occasionally
} as const;
