/**
 * In-Memory Sliding Window Rate Limiter for Next.js API Routes
 * Tracks request timestamps per key (IP address or Session Token).
 */

interface RateLimitRecord {
    timestamps: number[];
}

class RateLimiter {
    private store: Map<string, RateLimitRecord> = new Map();
    private cleanupInterval: NodeJS.Timeout;

    constructor() {
        // Run cleanup every 5 minutes to remove stale records
        this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
        if (this.cleanupInterval.unref) {
            this.cleanupInterval.unref();
        }
    }

    /**
     * Check if a request exceeds the limit within the specified window.
     * @param key Identifier (e.g. IP address or session token)
     * @param limit Maximum allowed requests within windowMs
     * @param windowMs Time window in milliseconds (default: 60,000ms = 1 minute)
     */
    public check(key: string, limit: number, windowMs: number = 60000): {
        allowed: boolean;
        limit: number;
        remaining: number;
        resetMs: number;
        retryAfterSec: number;
    } {
        const now = Date.now();
        const windowStart = now - windowMs;

        let record = this.store.get(key);
        if (!record) {
            record = { timestamps: [] };
            this.store.set(key, record);
        }

        // Filter out timestamps outside the current window
        record.timestamps = record.timestamps.filter((ts) => ts > windowStart);

        if (record.timestamps.length >= limit) {
            const oldestInWindow = record.timestamps[0];
            const resetMs = oldestInWindow + windowMs - now;
            const retryAfterSec = Math.ceil(resetMs / 1000);

            return {
                allowed: false,
                limit,
                remaining: 0,
                resetMs,
                retryAfterSec: Math.max(retryAfterSec, 1),
            };
        }

        // Add current timestamp
        record.timestamps.push(now);
        const remaining = limit - record.timestamps.length;

        return {
            allowed: true,
            limit,
            remaining,
            resetMs: windowMs,
            retryAfterSec: 0,
        };
    }

    private cleanup() {
        const now = Date.now();
        const maxWindow = 10 * 60 * 1000; // 10 minutes max window
        for (const [key, record] of this.store.entries()) {
            record.timestamps = record.timestamps.filter((ts) => ts > now - maxWindow);
            if (record.timestamps.length === 0) {
                this.store.delete(key);
            }
        }
    }
}

// Global singleton instance across HMR reloads
const globalForRateLimiter = globalThis as unknown as { rateLimiter?: RateLimiter };
export const rateLimiter = globalForRateLimiter.rateLimiter ?? new RateLimiter();
if (process.env.NODE_ENV !== 'production') {
    globalForRateLimiter.rateLimiter = rateLimiter;
}
