// Simple in-memory rate limiter
// For production, use Redis or a distributed cache

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

interface RateLimitConfig {
  requests: number;
  windowMs: number;
}

export class RateLimiter {
  private limits: Map<string, RateLimitEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 1000);
  }

  async checkLimit(
    clientId: string,
    endpoint: string,
    config: RateLimitConfig
  ): Promise<{
    allowed: boolean;
    limit: number;
    remaining: number;
    resetTime: number;
    retryAfter?: number;
  }> {
    const key = `${clientId}:${endpoint}`;
    const now = Date.now();
    
    let entry = this.limits.get(key);
    
    // If no entry or window expired, create new entry
    if (!entry || now > entry.resetTime) {
      entry = {
        count: 0,
        resetTime: now + config.windowMs,
      };
      this.limits.set(key, entry);
    }
    
    // Increment counter
    entry.count++;
    
    const allowed = entry.count <= config.requests;
    const remaining = Math.max(0, config.requests - entry.count);
    const retryAfter = allowed ? undefined : Math.ceil((entry.resetTime - now) / 1000);
    
    return {
      allowed,
      limit: config.requests,
      remaining,
      resetTime: entry.resetTime,
      retryAfter,
    };
  }

  // Clean up expired entries
  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.limits.entries()) {
      if (now > entry.resetTime) {
        this.limits.delete(key);
      }
    }
  }

  // Destroy the rate limiter (clean up interval)
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

// Redis-based rate limiter for production
export class RedisRateLimiter {
  private redisClient: any; // Type this properly with your Redis client

  constructor(redisClient: any) {
    this.redisClient = redisClient;
  }

  async checkLimit(
    clientId: string,
    endpoint: string,
    config: RateLimitConfig
  ): Promise<{
    allowed: boolean;
    limit: number;
    remaining: number;
    resetTime: number;
    retryAfter?: number;
  }> {
    const key = `rate_limit:${clientId}:${endpoint}`;
    const now = Date.now();
    const windowStart = now - config.windowMs;
    
    try {
      // Use Redis sorted sets for sliding window rate limiting
      const pipeline = this.redisClient.pipeline();
      
      // Remove old entries
      pipeline.zremrangebyscore(key, '-inf', windowStart);
      
      // Add current request
      pipeline.zadd(key, now, `${now}-${Math.random()}`);
      
      // Count requests in window
      pipeline.zcard(key);
      
      // Set expiry
      pipeline.expire(key, Math.ceil(config.windowMs / 1000));
      
      const results = await pipeline.exec();
      const count = results[2][1];
      
      const allowed = count <= config.requests;
      const remaining = Math.max(0, config.requests - count);
      const resetTime = now + config.windowMs;
      const retryAfter = allowed ? undefined : Math.ceil(config.windowMs / 1000);
      
      return {
        allowed,
        limit: config.requests,
        remaining,
        resetTime,
        retryAfter,
      };
    } catch (error) {
      console.error('Redis rate limit error:', error);
      // Fail open - allow the request if Redis is down
      return {
        allowed: true,
        limit: config.requests,
        remaining: config.requests,
        resetTime: now + config.windowMs,
      };
    }
  }
}