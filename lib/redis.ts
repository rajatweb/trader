import { Redis } from '@upstash/redis'

/**
 * Redis cache client for trading data
 * Requires UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN env variables
 */
const redis = (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
    ? new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
    : null;

export const cache = {
    async get<T>(key: string): Promise<T | null> {
        if (!redis) return null;
        try {
            const data = await redis.get(key);
            return data as T;
        } catch (e) {
            console.error("Redis Get Error:", e);
            return null;
        }
    },

    async set(key: string, value: any, exSeconds: number = 86400 * 7): Promise<void> {
        if (!redis) return;
        try {
            await redis.set(key, value, { ex: exSeconds });
        } catch (e) {
            console.error("Redis Set Error:", e);
        }
    },

    generateKey(params: any): string {
        const str = JSON.stringify(params);
        return `backtest:v1:${Buffer.from(str).toString('base64').slice(0, 32)}`;
    }
}
