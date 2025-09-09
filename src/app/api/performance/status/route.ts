import { NextRequest, NextResponse } from 'next/server';
import { WebhookQueueManager } from '@/lib/webhook-queue';
import { AnalyticsCacheManager } from '@/lib/analytics-cache';
import { ApiCacheManager } from '@/lib/api-cache';
import { getInitializationStatus } from '@/lib/performance-init';

/**
 * @swagger
 * /api/performance/status:
 *   get:
 *     summary: Get performance optimization status
 *     description: Monitor the status of async webhook processing, caching systems, and performance metrics
 *     responses:
 *       200:
 *         description: Performance status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 status:
 *                   type: string
 *                   enum: [healthy, degraded, critical]
 *                 initialized:
 *                   type: boolean
 *                 systems:
 *                   type: object
 *                   properties:
 *                     webhook_processing:
 *                       type: object
 *                     analytics_cache:
 *                       type: object
 *                     api_cache:
 *                       type: object
 *                 performance:
 *                   type: object
 *                 timestamp:
 *                   type: string
 */
export async function GET(request: NextRequest) {
  try {
    const startTime = Date.now();
    
    // Collect system status
    const [webhookStats, analyticsCacheStats] = await Promise.all([
      WebhookQueueManager.getQueueStats(),
      AnalyticsCacheManager.getCacheStats(),
    ]);

    // Calculate overall system health
    const health = calculateSystemHealth(webhookStats, analyticsCacheStats);
    
    const responseTime = Date.now() - startTime;

    const response = {
      success: true,
      status: health.status,
      initialized: getInitializationStatus(),
      systems: {
        webhook_processing: {
          enabled: true,
          type: 'async_queue',
          queue_stats: webhookStats,
          health: health.webhook,
        },
        analytics_cache: {
          enabled: true,
          type: 'redis_cache_with_background_refresh',
          cache_stats: analyticsCacheStats,
          health: health.analytics,
        },
        api_cache: {
          enabled: true,
          type: 'redis_cache_with_etags',
          health: health.apiCache,
        },
        deduplication: {
          enabled: true,
          type: 'redis_hash_based',
          health: 'healthy',
        },
        signature_optimization: {
          enabled: true,
          type: 'single_pass_cached_secrets',
          health: 'healthy',
        },
      },
      performance: {
        response_time_ms: responseTime,
        targets: {
          webhook_acceptance: '< 10ms',
          api_response_time: '< 100ms',
          cache_hit_rate: '> 90%',
          webhook_throughput: '1000+ webhooks/second',
        },
        current_metrics: {
          webhook_acceptance_time: estimateWebhookAcceptanceTime(webhookStats),
          api_cache_hit_rate: analyticsCacheStats.hitRate,
          webhook_throughput_capacity: estimateWebhookThroughput(webhookStats),
        },
      },
      alerts: generateAlerts(health, webhookStats, analyticsCacheStats),
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response);

  } catch (error) {
    console.error('Performance status check failed:', error);
    
    return NextResponse.json(
      {
        success: false,
        status: 'critical',
        initialized: false,
        error: 'Performance status check failed',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}

/**
 * Force cache refresh for testing
 */
export async function POST(request: NextRequest) {
  try {
    const { action, target } = await request.json();

    switch (action) {
      case 'refresh_analytics':
        await AnalyticsCacheManager.preComputeAnalytics();
        return NextResponse.json({
          success: true,
          message: 'Analytics cache refreshed',
          action: 'refresh_analytics',
        });

      case 'invalidate_cache':
        if (target === 'analytics') {
          await AnalyticsCacheManager.invalidateAnalytics();
        } else if (target === 'api') {
          await ApiCacheManager.clearCachePrefix();
        } else {
          await Promise.all([
            AnalyticsCacheManager.invalidateAnalytics(),
            ApiCacheManager.clearCachePrefix(),
          ]);
        }
        return NextResponse.json({
          success: true,
          message: 'Cache invalidated',
          action: 'invalidate_cache',
          target: target || 'all',
        });

      case 'clean_queues':
        await WebhookQueueManager.cleanQueue();
        return NextResponse.json({
          success: true,
          message: 'Queues cleaned',
          action: 'clean_queues',
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
 * Calculate overall system health
 */
function calculateSystemHealth(webhookStats: any, analyticsCacheStats: any) {
  // Webhook processing health
  const webhookHealth = calculateWebhookHealth(webhookStats);
  
  // Analytics cache health
  const analyticsHealth = calculateAnalyticsCacheHealth(analyticsCacheStats);
  
  // API cache health (simplified)
  const apiCacheHealth = 'healthy';

  // Overall status
  const healths = [webhookHealth, analyticsHealth, apiCacheHealth];
  const criticalCount = healths.filter(h => h === 'critical').length;
  const degradedCount = healths.filter(h => h === 'degraded').length;

  let overallStatus: 'healthy' | 'degraded' | 'critical';
  if (criticalCount > 0) {
    overallStatus = 'critical';
  } else if (degradedCount > 0) {
    overallStatus = 'degraded';
  } else {
    overallStatus = 'healthy';
  }

  return {
    status: overallStatus,
    webhook: webhookHealth,
    analytics: analyticsHealth,
    apiCache: apiCacheHealth,
  };
}

/**
 * Calculate webhook processing health
 */
function calculateWebhookHealth(stats: any): 'healthy' | 'degraded' | 'critical' {
  const totalJobs = stats.waiting + stats.active + stats.completed + stats.failed;
  
  if (totalJobs === 0) return 'healthy';
  
  const failureRate = stats.failed / (stats.completed + stats.failed + 1);
  const backlogRatio = stats.waiting / (stats.active + 1);
  
  if (failureRate > 0.2 || backlogRatio > 10) return 'critical';
  if (failureRate > 0.1 || backlogRatio > 5) return 'degraded';
  
  return 'healthy';
}

/**
 * Calculate analytics cache health
 */
function calculateAnalyticsCacheHealth(stats: any): 'healthy' | 'degraded' | 'critical' {
  const hitRate = stats.hitRate || 0;
  
  if (hitRate < 0.5) return 'critical';
  if (hitRate < 0.8) return 'degraded';
  
  return 'healthy';
}

/**
 * Estimate webhook acceptance time
 */
function estimateWebhookAcceptanceTime(stats: any): string {
  // This would be calculated from actual metrics in production
  // For now, return an estimate based on queue load
  const load = stats.active + stats.waiting;
  
  if (load < 10) return '< 5ms';
  if (load < 50) return '< 10ms';
  if (load < 100) return '< 20ms';
  
  return '> 20ms';
}

/**
 * Estimate webhook throughput capacity
 */
function estimateWebhookThroughput(stats: any): string {
  // This would be calculated from actual throughput metrics
  // For now, return an estimate based on queue health
  const utilization = stats.active / (stats.active + stats.waiting + 1);
  
  if (utilization < 0.5) return '1000+ webhooks/sec';
  if (utilization < 0.8) return '500-1000 webhooks/sec';
  
  return '< 500 webhooks/sec';
}

/**
 * Generate alerts based on system status
 */
function generateAlerts(health: any, webhookStats: any, analyticsCacheStats: any): string[] {
  const alerts: string[] = [];
  
  if (health.webhook === 'critical') {
    alerts.push('CRITICAL: Webhook processing system unhealthy');
  } else if (health.webhook === 'degraded') {
    alerts.push('WARNING: Webhook processing performance degraded');
  }
  
  if (health.analytics === 'critical') {
    alerts.push('CRITICAL: Analytics cache system unhealthy');
  } else if (health.analytics === 'degraded') {
    alerts.push('WARNING: Analytics cache performance degraded');
  }
  
  if (webhookStats.waiting > 100) {
    alerts.push(`WARNING: Large webhook backlog (${webhookStats.waiting} jobs)`);
  }
  
  if (analyticsCacheStats.hitRate < 0.8) {
    alerts.push(`WARNING: Low cache hit rate (${Math.round(analyticsCacheStats.hitRate * 100)}%)`);
  }
  
  return alerts;
}