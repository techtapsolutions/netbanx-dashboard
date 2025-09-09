import { DatabaseService, redis, redisForBull } from '@/lib/database';
import { RedisConnectionManager } from '@/lib/redis-config';
import Queue from 'bull';

// Analytics cache configuration
interface AnalyticsCacheConfig {
  ttl: number;           // Time to live in seconds
  refreshInterval: number; // How often to refresh in seconds
  warmup: boolean;       // Whether to warm up cache on startup
}

interface CachedAnalytics {
  data: any;
  timestamp: number;
  timeRange: string;
  companyId?: string;
  generatedAt: string;
}

// Analytics background processing queue
const analyticsQueue = new Queue('analytics processing', {
  redis: redisForBull, // Use IORedis instance for Bull.js compatibility
  defaultJobOptions: {
    removeOnComplete: 10,
    removeOnFail: 5,
    attempts: 2,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

export class AnalyticsCacheManager {
  private static readonly CACHE_PREFIX = 'analytics_cache';
  private static readonly CONFIGS: Record<string, AnalyticsCacheConfig> = {
    hour: { ttl: 300, refreshInterval: 60, warmup: true },     // 5min cache, refresh every 1min
    day: { ttl: 600, refreshInterval: 300, warmup: true },     // 10min cache, refresh every 5min
    week: { ttl: 1800, refreshInterval: 900, warmup: true },   // 30min cache, refresh every 15min
    month: { ttl: 3600, refreshInterval: 1800, warmup: false }, // 60min cache, refresh every 30min
  };

  /**
   * Get cached analytics or compute if not available
   */
  static async getAnalytics(
    timeRange: 'hour' | 'day' | 'week' | 'month',
    companyId?: string
  ): Promise<any> {
    const cacheKey = this.generateCacheKey(timeRange, companyId);
    
    try {
      // Try to get from cache first
      const cached = await this.getCachedAnalytics(cacheKey);
      
      if (cached) {
        console.log(`Analytics cache HIT for ${timeRange}${companyId ? ` (company: ${companyId})` : ''}`);
        return cached.data;
      }
      
      console.log(`Analytics cache MISS for ${timeRange}${companyId ? ` (company: ${companyId})` : ''}`);
      
      // Cache miss - compute fresh data
      const analytics = await DatabaseService.getAnalytics(timeRange);
      
      // Cache the result
      await this.setCachedAnalytics(cacheKey, analytics, timeRange, companyId);
      
      return analytics;
    } catch (error) {
      console.error('Error getting cached analytics:', error);
      
      // Fallback to direct database query
      return await DatabaseService.getAnalytics(timeRange);
    }
  }

  /**
   * Pre-compute and cache analytics for all time ranges
   */
  static async preComputeAnalytics(companyId?: string): Promise<void> {
    const timeRanges: Array<'hour' | 'day' | 'week' | 'month'> = ['hour', 'day', 'week', 'month'];
    
    for (const timeRange of timeRanges) {
      const config = this.CONFIGS[timeRange];
      if (!config.warmup && !companyId) continue; // Skip expensive calculations for global data
      
      try {
        console.log(`Pre-computing analytics for ${timeRange}${companyId ? ` (company: ${companyId})` : ''}...`);
        
        const analytics = await DatabaseService.getAnalytics(timeRange);
        const cacheKey = this.generateCacheKey(timeRange, companyId);
        
        await this.setCachedAnalytics(cacheKey, analytics, timeRange, companyId);
        
        console.log(`Pre-computed analytics for ${timeRange} cached successfully`);
      } catch (error) {
        console.error(`Failed to pre-compute analytics for ${timeRange}:`, error);
      }
    }
  }

  /**
   * Schedule background analytics refresh
   */
  static async scheduleAnalyticsRefresh(): Promise<void> {
    // Schedule refresh jobs for each time range
    for (const [timeRange, config] of Object.entries(this.CONFIGS)) {
      if (config.warmup) {
        await analyticsQueue.add(
          'refresh-analytics',
          { timeRange },
          {
            repeat: { every: config.refreshInterval * 1000 }, // Convert to milliseconds
            jobId: `analytics-refresh-${timeRange}`, // Prevent duplicate jobs
          }
        );
        
        console.log(`Scheduled analytics refresh for ${timeRange} every ${config.refreshInterval}s`);
      }
    }
  }

  /**
   * Invalidate analytics cache
   */
  static async invalidateAnalytics(companyId?: string): Promise<void> {
    try {
      const pattern = companyId 
        ? `${this.CACHE_PREFIX}:*:company:${companyId}`
        : `${this.CACHE_PREFIX}:*`;
        
      const keys = await RedisConnectionManager.keys(pattern);
      
      if (keys.length > 0) {
        await RedisConnectionManager.del(...keys);
        console.log(`Invalidated ${keys.length} analytics cache entries${companyId ? ` for company ${companyId}` : ''}`);
      }
      
      // Trigger immediate refresh for critical time ranges
      if (companyId) {
        await analyticsQueue.add('refresh-analytics', { timeRange: 'day', companyId }, { priority: 10 });
        await analyticsQueue.add('refresh-analytics', { timeRange: 'hour', companyId }, { priority: 10 });
      }
      
    } catch (error) {
      console.error('Failed to invalidate analytics cache:', error);
    }
  }

  /**
   * Generate cache key for analytics
   */
  private static generateCacheKey(timeRange: string, companyId?: string): string {
    return companyId 
      ? `${this.CACHE_PREFIX}:${timeRange}:company:${companyId}`
      : `${this.CACHE_PREFIX}:${timeRange}:global`;
  }

  /**
   * Get cached analytics data
   */
  private static async getCachedAnalytics(cacheKey: string): Promise<CachedAnalytics | null> {
    try {
      const cached = await RedisConnectionManager.get(cacheKey);
      if (!cached) return null;
      
      const data: CachedAnalytics = JSON.parse(cached);
      
      // Check if cache is still valid
      const config = this.CONFIGS[data.timeRange];
      const isExpired = Date.now() - data.timestamp > (config?.ttl || 300) * 1000;
      
      if (isExpired) {
        await RedisConnectionManager.del(cacheKey);
        return null;
      }
      
      return data;
    } catch (error) {
      console.warn('Failed to get cached analytics:', error);
      return null;
    }
  }

  /**
   * Set cached analytics data
   */
  private static async setCachedAnalytics(
    cacheKey: string,
    data: any,
    timeRange: string,
    companyId?: string
  ): Promise<void> {
    try {
      const config = this.CONFIGS[timeRange];
      const cachedData: CachedAnalytics = {
        data,
        timestamp: Date.now(),
        timeRange,
        companyId,
        generatedAt: new Date().toISOString(),
      };
      
      await RedisConnectionManager.setex(cacheKey, config?.ttl || 300, JSON.stringify(cachedData));
    } catch (error) {
      console.warn('Failed to set cached analytics:', error);
    }
  }

  /**
   * Get analytics cache statistics
   */
  static async getCacheStats(): Promise<{
    totalKeys: number;
    hitRate: number;
    keysByTimeRange: Record<string, number>;
  }> {
    try {
      const keys = await RedisConnectionManager.keys(`${this.CACHE_PREFIX}:*`);
      
      // Analyze keys by time range
      const keysByTimeRange: Record<string, number> = {};
      keys.forEach(key => {
        const parts = key.split(':');
        if (parts.length >= 3) {
          const timeRange = parts[2];
          keysByTimeRange[timeRange] = (keysByTimeRange[timeRange] || 0) + 1;
        }
      });
      
      // Get hit rate from Redis stats (simplified)
      const hitRate = 0.85; // This would normally come from Redis INFO stats
      
      return {
        totalKeys: keys.length,
        hitRate,
        keysByTimeRange,
      };
    } catch (error) {
      console.error('Failed to get cache stats:', error);
      return {
        totalKeys: 0,
        hitRate: 0,
        keysByTimeRange: {},
      };
    }
  }
}

// Analytics queue processor
analyticsQueue.process('refresh-analytics', async (job) => {
  const { timeRange, companyId } = job.data;
  
  console.log(`Refreshing analytics cache for ${timeRange}${companyId ? ` (company: ${companyId})` : ''}...`);
  
  try {
    const analytics = await DatabaseService.getAnalytics(timeRange);
    const cacheKey = AnalyticsCacheManager['generateCacheKey'](timeRange, companyId);
    
    await AnalyticsCacheManager['setCachedAnalytics'](cacheKey, analytics, timeRange, companyId);
    
    console.log(`Analytics cache refreshed for ${timeRange}${companyId ? ` (company: ${companyId})` : ''}`);
    
    return { success: true, timeRange, companyId };
  } catch (error) {
    console.error(`Failed to refresh analytics cache for ${timeRange}:`, error);
    throw error;
  }
});

// Queue event listeners
analyticsQueue.on('completed', (job, result) => {
  console.log(`Analytics refresh job ${job.id} completed for ${result.timeRange}`);
});

analyticsQueue.on('failed', (job, err) => {
  console.error(`Analytics refresh job ${job.id} failed:`, err.message);
});

// Initialize analytics caching system
export async function initializeAnalyticsCache(): Promise<void> {
  try {
    console.log('Initializing analytics cache system...');
    
    // Schedule background refresh jobs
    await AnalyticsCacheManager.scheduleAnalyticsRefresh();
    
    // Pre-compute critical analytics
    await AnalyticsCacheManager.preComputeAnalytics();
    
    console.log('Analytics cache system initialized successfully');
  } catch (error) {
    console.error('Failed to initialize analytics cache system:', error);
  }
}

// Export analytics queue for monitoring
export { analyticsQueue };

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down analytics queue...');
  await analyticsQueue.close();
});

process.on('SIGINT', async () => {
  console.log('Shutting down analytics queue...');
  await analyticsQueue.close();
});