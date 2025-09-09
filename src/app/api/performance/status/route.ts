import { NextRequest, NextResponse } from 'next/server';

/**
 * Performance status endpoint - simplified version without Redis dependency
 * This version provides basic system status without queue or cache metrics
 */
export async function GET(request: NextRequest) {
  try {
    const startTime = Date.now();
    
    // Check if Redis is available
    const redisAvailable = process.env.REDIS_HOST || process.env.REDIS_URL;
    
    // Basic system status without Redis
    const basicStatus = {
      success: true,
      status: 'operational',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      systems: {
        api: {
          status: 'healthy',
          responseTime: Date.now() - startTime,
        },
        database: {
          status: 'connected',
          type: 'postgresql',
        },
        redis: {
          status: redisAvailable ? 'configured' : 'not_configured',
          required: false,
          message: redisAvailable 
            ? 'Redis configured for enhanced performance' 
            : 'Redis not configured - running without caching and queue features',
        },
      },
      performance: {
        response_time_ms: Date.now() - startTime,
        features: {
          caching: redisAvailable ? 'enabled' : 'disabled',
          webhook_queue: redisAvailable ? 'enabled' : 'disabled', 
          analytics_cache: redisAvailable ? 'enabled' : 'disabled',
        },
      },
      alerts: redisAvailable ? [] : [
        'INFO: Redis not configured - performance optimizations disabled',
        'INFO: Webhook processing will be synchronous',
        'INFO: Analytics caching is disabled',
      ],
    };

    // If Redis is available, try to get advanced metrics
    if (redisAvailable) {
      try {
        const { WebhookQueueManager } = await import('@/lib/webhook-queue');
        const { AnalyticsCacheManager } = await import('@/lib/analytics-cache');
        
        const [webhookStats, analyticsCacheStats] = await Promise.all([
          WebhookQueueManager.getQueueStats().catch(() => null),
          AnalyticsCacheManager.getCacheStats().catch(() => null),
        ]);

        if (webhookStats) {
          basicStatus.systems.webhook_processing = {
            enabled: true,
            type: 'async_queue',
            queue_stats: webhookStats,
            health: calculateWebhookHealth(webhookStats),
          };
        }

        if (analyticsCacheStats) {
          basicStatus.systems.analytics_cache = {
            enabled: true,
            type: 'redis_cache',
            cache_stats: analyticsCacheStats,
            health: calculateCacheHealth(analyticsCacheStats),
          };
        }
      } catch (error) {
        console.warn('Failed to get Redis metrics:', error);
        basicStatus.alerts.push('WARNING: Redis configured but metrics unavailable');
      }
    }

    return NextResponse.json(basicStatus);

  } catch (error) {
    console.error('Performance status check failed:', error);
    
    return NextResponse.json(
      {
        success: false,
        status: 'error',
        error: 'Performance status check failed',
        message: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * Test endpoint for performance monitoring
 */
export async function POST(request: NextRequest) {
  try {
    const { action } = await request.json();

    switch (action) {
      case 'health_check':
        return NextResponse.json({
          success: true,
          message: 'Performance monitoring is operational',
          timestamp: new Date().toISOString(),
        });

      case 'system_info':
        return NextResponse.json({
          success: true,
          info: {
            node_version: process.version,
            platform: process.platform,
            memory: process.memoryUsage(),
            uptime: process.uptime(),
          },
        });

      default:
        return NextResponse.json(
          { error: 'Unknown action' },
          { status: 400 }
        );
    }

  } catch (error) {
    console.error('Performance action failed:', error);
    
    return NextResponse.json(
      { 
        success: false,
        error: 'Performance action failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * Calculate webhook processing health
 */
function calculateWebhookHealth(stats: any): 'healthy' | 'degraded' | 'critical' {
  if (!stats) return 'healthy';
  
  const totalJobs = stats.waiting + stats.active + stats.completed + stats.failed;
  
  if (totalJobs === 0) return 'healthy';
  
  const failureRate = stats.failed / (stats.completed + stats.failed + 1);
  const backlogRatio = stats.waiting / (stats.active + 1);
  
  if (failureRate > 0.2 || backlogRatio > 10) return 'critical';
  if (failureRate > 0.1 || backlogRatio > 5) return 'degraded';
  
  return 'healthy';
}

/**
 * Calculate cache health
 */
function calculateCacheHealth(stats: any): 'healthy' | 'degraded' | 'critical' {
  if (!stats) return 'healthy';
  
  const hitRate = stats.hitRate || 0;
  
  if (hitRate < 0.5) return 'critical';
  if (hitRate < 0.8) return 'degraded';
  
  return 'healthy';
}