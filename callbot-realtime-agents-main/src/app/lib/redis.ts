import { createClient } from 'redis';

type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | null = null;
let connecting: Promise<RedisClient> | null = null;
let lastErrorLogAt = 0;
const ERROR_LOG_THROTTLE_MS = 10_000;

export async function getRedis(): Promise<RedisClient> {
  const url = process.env.REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL is not set');
  }

  if (client) return client;
  if (connecting) return connecting;

  connecting = (async () => {
    const c = createClient({
      url,
      socket: {
        connectTimeout: 800,
        reconnectStrategy: (retries) => {
          // Retry a few times quickly, then stop reconnecting to avoid log spam / request stalls.
          if (retries >= 3) return new Error('Redis reconnect retries exhausted');
          return Math.min(200 * (retries + 1), 600);
        },
      },
    });

    c.on('error', (err) => {
      const now = Date.now();
      if (now - lastErrorLogAt > ERROR_LOG_THROTTLE_MS) {
        lastErrorLogAt = now;
        console.error('[redis] error', err);
      }
    });

    try {
      await c.connect();
      client = c;
      return c;
    } catch (err) {
      // Reset so subsequent calls can retry.
      try {
        await c.disconnect();
      } catch {
        // ignore
      }
      client = null;
      connecting = null;
      throw err;
    }
  })();

  return connecting!;
}

export async function redisGetJson<T>(key: string): Promise<T | null> {
  try {
    const r = await getRedis();
    const raw = await r.get(key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  } catch {
    return null;
  }
}

export async function redisSetJson(key: string, value: unknown, ttlSeconds?: number) {
  try {
    const r = await getRedis();
    const payload = JSON.stringify(value);
    if (ttlSeconds && ttlSeconds > 0) {
      await r.set(key, payload, { EX: ttlSeconds });
    } else {
      await r.set(key, payload);
    }
  } catch {
    // If Redis is down, treat as best-effort cache.
  }
}

