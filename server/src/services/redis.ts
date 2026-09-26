import Redis from "ioredis";
import { config } from "../config/env";

/**
 * Redis is a best-effort cache: with the offline queue disabled, commands fail
 * fast while disconnected and callers fall back to the database instead of
 * waiting on reconnect attempts.
 */
export const redis = new Redis(config.REDIS_URL, {
  lazyConnect: true,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
  connectTimeout: 3000,
});
redis.on("error", () => {
  // Connection errors are expected while Redis is down; `cached` degrades gracefully.
});

export function cacheStatus(): "up" | "down" {
  return redis.status === "ready" ? "up" : "down";
}

export async function cached<T>(key: string, ttlSeconds: number, loader: () => Promise<T>): Promise<T> {
  if (redis.status === "ready") {
    try {
      const hit = await redis.get(key);
      if (hit) return JSON.parse(hit) as T;
    } catch {
      // fall through to the loader
    }
  }
  const value = await loader();
  if (redis.status === "ready") {
    redis.set(key, JSON.stringify(value), "EX", ttlSeconds).catch(() => undefined);
  }
  return value;
}

/** Delete every key with the prefix. Uses SCAN, which unlike KEYS doesn't block Redis. */
export async function invalidate(prefix: string): Promise<void> {
  if (redis.status !== "ready") return;
  try {
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 200);
      if (keys.length) await redis.unlink(...keys);
      cursor = next;
    } while (cursor !== "0");
  } catch {
    // Cache entries expire on their own (short TTL).
  }
}
