import { useState, useCallback, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export interface CacheStats {
  totalEntries: number;
  cachedSize: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
}

interface UseCacheReturn<T> {
  get: (key: string) => Promise<T | null>;
  set: (key: string, data: T, ttl?: number) => Promise<void>;
  remove: (key: string) => Promise<void>;
  clear: () => Promise<void>;
  getStats: () => CacheStats;
  isExpired: (key: string) => Promise<boolean>;
  invalidate: (pattern: string) => Promise<void>;
}

const CACHE_PREFIX = 'autobuddy_cache_';
const DEFAULT_TTL = 5 * 60 * 1000;

export const useCache = <T = any>(namespace: string = 'default'): UseCacheReturn<T> => {
  const statsRef = useRef({ hitCount: 0, missCount: 0 });
  const prefixKey = `${CACHE_PREFIX}${namespace}`;

  const get = useCallback(
    async (key: string): Promise<T | null> => {
      try {
        const cacheKey = `${prefixKey}_${key}`;
        const cached = await AsyncStorage.getItem(cacheKey);

        if (!cached) {
          statsRef.current.missCount++;
          return null;
        }

        const entry: CacheEntry<T> = JSON.parse(cached);
        const now = Date.now();

        if (now - entry.timestamp > entry.ttl) {
          await AsyncStorage.removeItem(cacheKey);
          statsRef.current.missCount++;
          return null;
        }

        statsRef.current.hitCount++;
        return entry.data;
      } catch (err) {
        console.error(`Cache get error for ${key}:`, err);
        statsRef.current.missCount++;
        return null;
      }
    },
    [prefixKey]
  );

  const set = useCallback(
    async (key: string, data: T, ttl: number = DEFAULT_TTL): Promise<void> => {
      try {
        const cacheKey = `${prefixKey}_${key}`;
        const entry: CacheEntry<T> = {
          data,
          timestamp: Date.now(),
          ttl,
        };
        await AsyncStorage.setItem(cacheKey, JSON.stringify(entry));
      } catch (err) {
        console.error(`Cache set error for ${key}:`, err);
      }
    },
    [prefixKey]
  );

  const remove = useCallback(
    async (key: string): Promise<void> => {
      try {
        const cacheKey = `${prefixKey}_${key}`;
        await AsyncStorage.removeItem(cacheKey);
      } catch (err) {
        console.error(`Cache remove error for ${key}:`, err);
      }
    },
    [prefixKey]
  );

  const clear = useCallback(async (): Promise<void> => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter((k) => k.startsWith(prefixKey));
      await AsyncStorage.multiRemove(cacheKeys);
      statsRef.current = { hitCount: 0, missCount: 0 };
    } catch (err) {
      console.error('Cache clear error:', err);
    }
  }, [prefixKey]);

  const getStats = useCallback((): CacheStats => {
    const total = statsRef.current.hitCount + statsRef.current.missCount;
    return {
      totalEntries: total,
      cachedSize: 0,
      hitCount: statsRef.current.hitCount,
      missCount: statsRef.current.missCount,
      hitRate: total > 0 ? (statsRef.current.hitCount / total) * 100 : 0,
    };
  }, []);

  const isExpired = useCallback(
    async (key: string): Promise<boolean> => {
      try {
        const cacheKey = `${prefixKey}_${key}`;
        const cached = await AsyncStorage.getItem(cacheKey);

        if (!cached) {return true;}

        const entry: CacheEntry<T> = JSON.parse(cached);
        const now = Date.now();

        return now - entry.timestamp > entry.ttl;
      } catch (err) {
        return true;
      }
    },
    [prefixKey]
  );

  const invalidate = useCallback(
    async (pattern: string): Promise<void> => {
      try {
        const keys = await AsyncStorage.getAllKeys();
        const matchingKeys = keys.filter(
          (k) => k.startsWith(prefixKey) && k.includes(pattern)
        );
        await AsyncStorage.multiRemove(matchingKeys);
      } catch (err) {
        console.error(`Cache invalidate error for pattern ${pattern}:`, err);
      }
    },
    [prefixKey]
  );

  return {
    get,
    set,
    remove,
    clear,
    getStats,
    isExpired,
    invalidate,
  };
};

export interface UseMemoizedRequestReturn<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

export const useMemoizedRequest = <T,>(
  requestFn: () => Promise<T>,
  cacheKey: string,
  cacheTTL: number = DEFAULT_TTL
): UseMemoizedRequestReturn<T> => {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const cache = useCache<T>('memoized_requests');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const cached = await cache.get(cacheKey);
      if (cached) {
        setData(cached);
        setError(null);
        setLoading(false);
        return;
      }

      const result = await requestFn();
      await cache.set(cacheKey, result, cacheTTL);
      setData(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Unknown error'));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [requestFn, cacheKey, cacheTTL, cache]);

  const refetch = useCallback(async () => {
    await cache.remove(cacheKey);
    await fetchData();
  }, [cache, cacheKey, fetchData]);

  return { data, loading, error, refetch };
};
