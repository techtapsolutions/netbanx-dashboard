import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/database';
import { RedisConnectionManager } from '@/lib/redis-config';
import crypto from 'crypto';

// Cache configuration interface
interface CacheConfig {
  ttl?: number;           // Time to live in seconds (default: 300 = 5 minutes)
  keyPrefix?: string;     // Cache key prefix (default: 'api_cache')
  tags?: string[];        // Cache tags for invalidation
  varyBy?: string[];      // Headers to vary cache by (e.g., ['user-id', 'company-id'])
  skipCache?: boolean;    // Skip caching entirely
  etag?: boolean;         // Generate and use ETags (default: true)
}

interface CachedResponse {
  data: any;
  status: number;
  headers: Record<string, string>;
  etag: string;
  timestamp: number;
  ttl: number;
  tags?: string[];
}

export class ApiCacheManager {
  private static readonly DEFAULT_TTL = 300; // 5 minutes
  private static readonly DEFAULT_PREFIX = 'api_cache';
  private static readonly TAGS_PREFIX = 'cache_tags';

  /**
   * Generate cache key from request URL and vary headers
   */
  static generateCacheKey(request: NextRequest, config: CacheConfig = {}): string {
    const url = new URL(request.url);
    const keyParts = [url.pathname, url.search];
    
    // Add vary headers to cache key
    if (config.varyBy) {
      config.varyBy.forEach(header => {
        const value = request.headers.get(header);
        if (value) {
          keyParts.push(`${header}:${value}`);
        }
      });
    }
    
    const keyString = keyParts.join('|');
    const keyHash = crypto.createHash('sha256').update(keyString).digest('hex');
    const prefix = config.keyPrefix || this.DEFAULT_PREFIX;
    
    return `${prefix}:${keyHash}`;
  }

  /**
   * Generate ETag from response data
   */
  static generateETag(data: any): string {
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);
    return `"${crypto.createHash('sha256').update(dataString).digest('hex').substring(0, 16)}"`;
  }

  /**
   * Get cached response
   */
  static async getCachedResponse(cacheKey: string): Promise<CachedResponse | null> {
    try {
      const cached = await RedisConnectionManager.get(cacheKey);
      if (!cached) return null;
      
      const response: CachedResponse = JSON.parse(cached);
      
      // Check if cache is still valid
      const now = Date.now();
      if (now > response.timestamp + (response.ttl * 1000)) {
        // Cache expired, delete it
        await RedisConnectionManager.del(cacheKey);
        return null;
      }
      
      return response;
    } catch (error) {
      console.warn('Failed to get cached response:', error);
      return null;
    }
  }

  /**
   * Set cached response
   */
  static async setCachedResponse(
    cacheKey: string, 
    data: any, 
    status: number = 200,
    headers: Record<string, string> = {},
    config: CacheConfig = {}
  ): Promise<void> {
    try {
      const ttl = config.ttl || this.DEFAULT_TTL;
      const etag = this.generateETag(data);
      
      const cachedResponse: CachedResponse = {
        data,
        status,
        headers,
        etag,
        timestamp: Date.now(),
        ttl,
        tags: config.tags,
      };

      // Store the cached response
      await RedisConnectionManager.setex(cacheKey, ttl, JSON.stringify(cachedResponse));

      // Store cache tags for invalidation
      if (config.tags) {
        await this.storeCacheTags(cacheKey, config.tags, ttl);
      }
      
    } catch (error) {
      console.warn('Failed to set cached response:', error);
    }
  }

  /**
   * Store cache tags for invalidation
   */
  private static async storeCacheTags(cacheKey: string, tags: string[], ttl: number): Promise<void> {
    try {
      // Note: sadd and expire are not available in universal adapter
      // For Upstash REST API, we'll use a simplified approach
      for (const tag of tags) {
        const tagKey = `${this.TAGS_PREFIX}:${tag}`;
        try {
          // Try IORedis operations first
          const redisInstance = redis as any;
          if (redisInstance.sadd && redisInstance.expire) {
            await redisInstance.sadd(tagKey, cacheKey);
            await redisInstance.expire(tagKey, ttl + 60);
          } else {
            // Fallback: Store tag as a simple key-value pair for Upstash REST
            const existingTags = await RedisConnectionManager.get(tagKey) || '[]';
            const tagList = JSON.parse(existingTags);
            if (!tagList.includes(cacheKey)) {
              tagList.push(cacheKey);
              await RedisConnectionManager.setex(tagKey, ttl + 60, JSON.stringify(tagList));
            }
          }
        } catch (error) {
          console.warn(`Failed to store cache tag ${tag}:`, error);
        }
      }
    } catch (error) {
      console.warn('Failed to store cache tags:', error);
    }
  }

  /**
   * Invalidate cache by tags
   */
  static async invalidateByTags(tags: string[]): Promise<number> {
    try {
      let keysToDelete: string[] = [];
      
      for (const tag of tags) {
        const tagKey = `${this.TAGS_PREFIX}:${tag}`;
        try {
          const redisInstance = redis as any;
          if (redisInstance.smembers) {
            // Use Redis set operations if available
            const cacheKeys = await redisInstance.smembers(tagKey);
            keysToDelete = keysToDelete.concat(cacheKeys);
            await redisInstance.del(tagKey);
          } else {
            // Fallback for Upstash REST API
            const tagData = await RedisConnectionManager.get(tagKey);
            if (tagData) {
              const tagList = JSON.parse(tagData);
              keysToDelete = keysToDelete.concat(tagList);
              await RedisConnectionManager.del(tagKey);
            }
          }
        } catch (error) {
          console.warn(`Failed to invalidate tag ${tag}:`, error);
        }
      }
      
      // Remove duplicates
      const uniqueKeys = [...new Set(keysToDelete)];
      
      if (uniqueKeys.length > 0) {
        await RedisConnectionManager.del(...uniqueKeys);
        console.log(`Invalidated ${uniqueKeys.length} cache entries for tags:`, tags);
      }
      
      return uniqueKeys.length;
    } catch (error) {
      console.error('Failed to invalidate cache by tags:', error);
      return 0;
    }
  }

  /**
   * Clear all cache entries with a specific prefix
   */
  static async clearCachePrefix(prefix: string = this.DEFAULT_PREFIX): Promise<number> {
    try {
      const keys = await RedisConnectionManager.keys(`${prefix}:*`);
      if (keys.length > 0) {
        await RedisConnectionManager.del(...keys);
        console.log(`Cleared ${keys.length} cache entries with prefix: ${prefix}`);
      }
      return keys.length;
    } catch (error) {
      console.error('Failed to clear cache prefix:', error);
      return 0;
    }
  }
}

/**
 * API Cache Middleware for Next.js API routes
 */
export function withCache(config: CacheConfig = {}) {
  return function cacheMiddleware(
    handler: (request: NextRequest) => Promise<NextResponse>
  ) {
    return async function cachedHandler(request: NextRequest): Promise<NextResponse> {
      // Skip caching for non-GET requests or if explicitly disabled
      if (request.method !== 'GET' || config.skipCache) {
        return handler(request);
      }

      const cacheKey = ApiCacheManager.generateCacheKey(request, config);
      
      // Check for If-None-Match header (ETag support)
      const ifNoneMatch = request.headers.get('if-none-match');
      
      // Try to get cached response
      const cachedResponse = await ApiCacheManager.getCachedResponse(cacheKey);
      
      if (cachedResponse) {
        // Check ETag match for 304 Not Modified
        if (ifNoneMatch && ifNoneMatch === cachedResponse.etag) {
          return new NextResponse(null, { 
            status: 304,
            headers: {
              'etag': cachedResponse.etag,
              'cache-control': `public, max-age=${config.ttl || ApiCacheManager['DEFAULT_TTL']}`,
            }
          });
        }

        // Return cached response with appropriate headers
        const headers = {
          ...cachedResponse.headers,
          'etag': cachedResponse.etag,
          'x-cache': 'HIT',
          'x-cache-key': cacheKey,
          'cache-control': `public, max-age=${config.ttl || ApiCacheManager['DEFAULT_TTL']}`,
          'content-type': 'application/json',
        };

        return NextResponse.json(cachedResponse.data, {
          status: cachedResponse.status,
          headers,
        });
      }

      // Cache miss - execute handler
      try {
        const response = await handler(request);
        
        // Only cache successful responses
        if (response.status >= 200 && response.status < 300) {
          const responseData = await response.json();
          
          // Cache the response
          await ApiCacheManager.setCachedResponse(
            cacheKey,
            responseData,
            response.status,
            Object.fromEntries(response.headers.entries()),
            config
          );

          // Generate ETag for response
          const etag = ApiCacheManager.generateETag(responseData);
          
          // Add cache headers to response
          const headers = {
            'etag': etag,
            'x-cache': 'MISS',
            'x-cache-key': cacheKey,
            'cache-control': `public, max-age=${config.ttl || ApiCacheManager['DEFAULT_TTL']}`,
            'content-type': 'application/json',
          };

          // Copy existing headers and add cache headers
          Object.entries(headers).forEach(([key, value]) => {
            response.headers.set(key, value);
          });

          return NextResponse.json(responseData, {
            status: response.status,
            headers: response.headers,
          });
        }

        return response;
      } catch (error) {
        console.error('Cache middleware error:', error);
        return handler(request); // Fallback to uncached response
      }
    };
  };
}

/**
 * Smart cache invalidation helper
 */
export class CacheInvalidator {
  /**
   * Invalidate analytics cache when new data arrives
   */
  static async invalidateAnalytics(companyId?: string): Promise<void> {
    const tags = ['analytics', 'transactions', 'webhooks'];
    if (companyId) {
      tags.push(`company:${companyId}`);
    }
    await ApiCacheManager.invalidateByTags(tags);
  }

  /**
   * Invalidate transaction cache
   */
  static async invalidateTransactions(companyId?: string): Promise<void> {
    const tags = ['transactions'];
    if (companyId) {
      tags.push(`company:${companyId}`);
    }
    await ApiCacheManager.invalidateByTags(tags);
  }

  /**
   * Invalidate account cache
   */
  static async invalidateAccounts(companyId?: string): Promise<void> {
    const tags = ['accounts'];
    if (companyId) {
      tags.push(`company:${companyId}`);
    }
    await ApiCacheManager.invalidateByTags(tags);
  }

  /**
   * Invalidate all caches
   */
  static async invalidateAll(): Promise<void> {
    await ApiCacheManager.clearCachePrefix();
  }
}

// Export commonly used cache configurations
export const CACHE_CONFIGS = {
  // Short cache for real-time data
  SHORT: { ttl: 30, etag: true },
  
  // Medium cache for API responses
  MEDIUM: { ttl: 300, etag: true },
  
  // Long cache for rarely changing data
  LONG: { ttl: 3600, etag: true },
  
  // Analytics cache with smart invalidation
  ANALYTICS: { 
    ttl: 180, 
    tags: ['analytics', 'transactions', 'webhooks'],
    varyBy: ['authorization'],
    etag: true,
  },
  
  // Transaction data cache
  TRANSACTIONS: {
    ttl: 120,
    tags: ['transactions'],
    varyBy: ['authorization'],
    etag: true,
  },
  
  // Account data cache
  ACCOUNTS: {
    ttl: 600,
    tags: ['accounts'],
    varyBy: ['authorization'],
    etag: true,
  },
} as const;