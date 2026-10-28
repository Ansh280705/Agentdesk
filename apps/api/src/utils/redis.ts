/**
 * Redis client using Upstash REST API.
 * Falls back gracefully when credentials are not configured.
 */
import { config, hasRedis } from '../config';

interface RedisSetOptions {
  ex?: number; // expire seconds
  nx?: boolean; // set if not exists
}

async function redisRequest(command: unknown[]): Promise<unknown> {
  if (!hasRedis) {
    throw new Error('Redis not configured');
  }

  const url = `${config.upstashRedisUrl}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.upstashRedisToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(command),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Redis error ${response.status}: ${text}`);
  }

  const json = (await response.json()) as { result: unknown; error?: string };
  if (json.error) {
    throw new Error(`Redis error: ${json.error}`);
  }

  return json.result;
}

export const redis = {
  available: hasRedis,

  async get(key: string): Promise<string | null> {
    if (!hasRedis) return null;
    try {
      const result = await redisRequest(['GET', key]);
      return result as string | null;
    } catch (err) {
      console.warn('[redis] GET failed:', (err as Error).message);
      return null;
    }
  },

  async set(key: string, value: string, options?: RedisSetOptions): Promise<boolean> {
    if (!hasRedis) return false;
    try {
      const cmd: unknown[] = ['SET', key, value];
      if (options?.ex) {
        cmd.push('EX', options.ex);
      }
      if (options?.nx) {
        cmd.push('NX');
      }
      await redisRequest(cmd);
      return true;
    } catch (err) {
      console.warn('[redis] SET failed:', (err as Error).message);
      return false;
    }
  },

  async del(key: string): Promise<boolean> {
    if (!hasRedis) return false;
    try {
      await redisRequest(['DEL', key]);
      return true;
    } catch (err) {
      console.warn('[redis] DEL failed:', (err as Error).message);
      return false;
    }
  },

  async incr(key: string): Promise<number | null> {
    if (!hasRedis) return null;
    try {
      const result = await redisRequest(['INCR', key]);
      return result as number;
    } catch (err) {
      console.warn('[redis] INCR failed:', (err as Error).message);
      return null;
    }
  },

  async expire(key: string, seconds: number): Promise<boolean> {
    if (!hasRedis) return false;
    try {
      await redisRequest(['EXPIRE', key, seconds]);
      return true;
    } catch (err) {
      console.warn('[redis] EXPIRE failed:', (err as Error).message);
      return false;
    }
  },

  async health(): Promise<boolean> {
    if (!hasRedis) return false;
    try {
      await redisRequest(['PING']);
      return true;
    } catch {
      return false;
    }
  },

  /**
   * Rate limiter: returns { allowed, remaining, reset }
   * Falls back to allowing all requests when Redis is unavailable.
   */
  async rateLimit(
    key: string,
    limit: number,
    windowSeconds: number
  ): Promise<{ allowed: boolean; remaining: number }> {
    if (!hasRedis) {
      return { allowed: true, remaining: limit };
    }
    try {
      const current = await redisRequest(['INCR', key]);
      const count = current as number;
      if (count === 1) {
        await redisRequest(['EXPIRE', key, windowSeconds]);
      }
      return {
        allowed: count <= limit,
        remaining: Math.max(0, limit - count),
      };
    } catch {
      return { allowed: true, remaining: limit };
    }
  },
};
