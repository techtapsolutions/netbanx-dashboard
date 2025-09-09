/**
 * Performance optimization initialization
 * Initializes async webhook processing, caching systems, and background jobs
 */

import { initializeAnalyticsCache } from '@/lib/analytics-cache';
import { webhookQueue, WebhookQueueManager } from '@/lib/webhook-queue';

let isInitialized = false;

export async function initializePerformanceOptimizations(): Promise<void> {
  if (isInitialized) {
    console.log('Performance optimizations already initialized');
    return;
  }

  console.log('🚀 Initializing performance optimizations...');
  
  try {
    // Initialize analytics caching system
    console.log('📊 Setting up analytics caching...');
    await initializeAnalyticsCache();
    
    // Initialize webhook queue
    console.log('⚡ Setting up webhook queue processing...');
    await initWebhookQueue();
    
    // Set up background maintenance jobs
    console.log('🧹 Setting up maintenance jobs...');
    await setupMaintenanceJobs();
    
    isInitialized = true;
    console.log('✅ Performance optimizations initialized successfully');
    
    // Log system status
    await logSystemStatus();
    
  } catch (error) {
    console.error('❌ Failed to initialize performance optimizations:', error);
    throw error;
  }
}

/**
 * Initialize webhook queue system
 */
async function initWebhookQueue(): Promise<void> {
  try {
    // Queue should be automatically initialized when imported
    // Just verify it's working
    const stats = await WebhookQueueManager.getQueueStats();
    console.log('Webhook queue initialized:', stats);
    
    // Clean old jobs on startup
    await WebhookQueueManager.cleanQueue();
    console.log('Cleaned old webhook queue jobs');
    
  } catch (error) {
    console.error('Failed to initialize webhook queue:', error);
    throw error;
  }
}

/**
 * Set up maintenance jobs for cache cleanup and metrics
 */
async function setupMaintenanceJobs(): Promise<void> {
  try {
    // Schedule periodic cache cleanup every hour
    setInterval(async () => {
      try {
        console.log('🧹 Running periodic cache cleanup...');
        await WebhookQueueManager.cleanQueue();
        console.log('✅ Cache cleanup completed');
      } catch (error) {
        console.error('❌ Cache cleanup failed:', error);
      }
    }, 60 * 60 * 1000); // Every hour

    // Schedule performance metrics logging every 5 minutes
    setInterval(async () => {
      try {
        await logPerformanceMetrics();
      } catch (error) {
        console.warn('Performance metrics logging failed:', error);
      }
    }, 5 * 60 * 1000); // Every 5 minutes

    console.log('✅ Maintenance jobs scheduled');
    
  } catch (error) {
    console.error('Failed to setup maintenance jobs:', error);
    throw error;
  }
}

/**
 * Log current system status
 */
async function logSystemStatus(): Promise<void> {
  try {
    const [webhookStats, analyticsStats] = await Promise.all([
      WebhookQueueManager.getQueueStats(),
      import('@/lib/analytics-cache').then(m => m.AnalyticsCacheManager.getCacheStats()),
    ]);

    console.log('📈 System Status:');
    console.log('  Webhook Queue:', webhookStats);
    console.log('  Analytics Cache:', analyticsStats);
    console.log('  Initialization Time:', new Date().toISOString());
    
  } catch (error) {
    console.error('Failed to log system status:', error);
  }
}

/**
 * Log performance metrics
 */
async function logPerformanceMetrics(): Promise<void> {
  try {
    const [webhookStats, analyticsStats] = await Promise.all([
      WebhookQueueManager.getQueueStats(),
      import('@/lib/analytics-cache').then(m => m.AnalyticsCacheManager.getCacheStats()),
    ]);

    // Calculate queue health
    const queueHealth = {
      utilization: webhookStats.active / (webhookStats.active + webhookStats.waiting + 1),
      failureRate: webhookStats.failed / (webhookStats.completed + webhookStats.failed + 1),
      backlog: webhookStats.waiting,
    };

    // Log metrics (in production, these would go to a monitoring system)
    console.log(`📊 Metrics [${new Date().toISOString()}]:`, {
      webhook: {
        queue: webhookStats,
        health: queueHealth,
      },
      analytics: {
        cache: analyticsStats,
      },
    });

    // Alert on concerning metrics
    if (queueHealth.utilization > 0.8) {
      console.warn('⚠️  High webhook queue utilization:', queueHealth.utilization);
    }
    
    if (queueHealth.failureRate > 0.1) {
      console.warn('⚠️  High webhook failure rate:', queueHealth.failureRate);
    }
    
    if (queueHealth.backlog > 100) {
      console.warn('⚠️  Large webhook backlog:', queueHealth.backlog);
    }

  } catch (error) {
    // Don't spam logs with metric collection errors
    if (process.env.NODE_ENV === 'development') {
      console.warn('Performance metrics collection failed:', error.message);
    }
  }
}

/**
 * Graceful shutdown of performance systems
 */
export async function shutdownPerformanceOptimizations(): Promise<void> {
  if (!isInitialized) return;

  console.log('🔄 Shutting down performance optimizations...');
  
  try {
    // Close queues gracefully
    await webhookQueue.close();
    
    // Close analytics queue
    const { analyticsQueue } = await import('@/lib/analytics-cache');
    await analyticsQueue.close();
    
    console.log('✅ Performance systems shutdown complete');
    
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
  } finally {
    isInitialized = false;
  }
}

// Initialize automatically in production
if (process.env.NODE_ENV === 'production') {
  // Delay initialization to ensure all modules are loaded
  setTimeout(() => {
    initializePerformanceOptimizations().catch(console.error);
  }, 1000);
}

// Handle graceful shutdown
process.on('SIGTERM', shutdownPerformanceOptimizations);
process.on('SIGINT', shutdownPerformanceOptimizations);

// Export initialization status
export const getInitializationStatus = () => isInitialized;