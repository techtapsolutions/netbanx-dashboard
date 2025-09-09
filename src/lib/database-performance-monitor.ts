import { redis } from './database';

interface QueryPerformanceMetric {
  query: string;
  duration: number;
  timestamp: number;
  success: boolean;
  error?: string;
}

interface DatabasePerformanceStats {
  averageQueryTime: number;
  slowQueries: QueryPerformanceMetric[];
  queryCount: number;
  errorRate: number;
  connectionPoolStats: {
    totalConnections: number;
    activeConnections: number;
    poolUtilization: number;
  };
}

export class DatabasePerformanceMonitor {
  private static readonly SLOW_QUERY_THRESHOLD = 50; // 50ms
  private static readonly METRICS_KEY = 'db_performance_metrics';
  private static readonly SLOW_QUERIES_KEY = 'db_slow_queries';
  private static readonly RETENTION_PERIOD = 3600; // 1 hour in seconds

  /**
   * Record a database query performance metric
   */
  static async recordQuery(
    query: string,
    duration: number,
    success: boolean = true,
    error?: string
  ): Promise<void> {
    const metric: QueryPerformanceMetric = {
      query: this.sanitizeQuery(query),
      duration,
      timestamp: Date.now(),
      success,
      error
    };

    try {
      // Store metric in Redis with TTL
      const metricKey = `${this.METRICS_KEY}:${metric.timestamp}`;
      await redis.setex(metricKey, this.RETENTION_PERIOD, JSON.stringify(metric));

      // Track slow queries separately
      if (duration > this.SLOW_QUERY_THRESHOLD) {
        await this.recordSlowQuery(metric);
      }

      // Update performance counters
      await this.updatePerformanceCounters(metric);

    } catch (error) {
      console.warn('Failed to record database performance metric:', error);
    }
  }

  /**
   * Get current database performance statistics
   */
  static async getPerformanceStats(): Promise<DatabasePerformanceStats> {
    try {
      const [metrics, slowQueries, counters] = await Promise.all([
        this.getRecentMetrics(),
        this.getSlowQueries(),
        this.getPerformanceCounters()
      ]);

      const totalDuration = metrics.reduce((sum, m) => sum + m.duration, 0);
      const successfulQueries = metrics.filter(m => m.success).length;
      const errorRate = metrics.length > 0 ? ((metrics.length - successfulQueries) / metrics.length) * 100 : 0;

      return {
        averageQueryTime: metrics.length > 0 ? totalDuration / metrics.length : 0,
        slowQueries: slowQueries.slice(0, 20), // Last 20 slow queries
        queryCount: counters.totalQueries,
        errorRate,
        connectionPoolStats: {
          totalConnections: counters.totalConnections || 0,
          activeConnections: counters.activeConnections || 0,
          poolUtilization: counters.poolUtilization || 0
        }
      };

    } catch (error) {
      console.error('Failed to get performance stats:', error);
      return {
        averageQueryTime: 0,
        slowQueries: [],
        queryCount: 0,
        errorRate: 0,
        connectionPoolStats: {
          totalConnections: 0,
          activeConnections: 0,
          poolUtilization: 0
        }
      };
    }
  }

  /**
   * Get queries that exceed the performance threshold
   */
  static async getSlowQueries(limit: number = 50): Promise<QueryPerformanceMetric[]> {
    try {
      const slowQueriesData = await redis.lrange(this.SLOW_QUERIES_KEY, 0, limit - 1);
      return slowQueriesData.map(data => JSON.parse(data));
    } catch (error) {
      console.warn('Failed to get slow queries:', error);
      return [];
    }
  }

  /**
   * Clear performance metrics (for testing or cleanup)
   */
  static async clearMetrics(): Promise<void> {
    try {
      const keys = await redis.keys(`${this.METRICS_KEY}:*`);
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      await redis.del(this.SLOW_QUERIES_KEY);
      await redis.del(`${this.METRICS_KEY}:counters`);
      
      console.log('Database performance metrics cleared');
    } catch (error) {
      console.error('Failed to clear metrics:', error);
    }
  }

  /**
   * Generate performance report
   */
  static async generateReport(): Promise<string> {
    const stats = await this.getPerformanceStats();
    
    return `
DATABASE PERFORMANCE REPORT
===========================

Query Performance:
- Average Query Time: ${stats.averageQueryTime.toFixed(2)}ms
- Total Queries: ${stats.queryCount}
- Error Rate: ${stats.errorRate.toFixed(2)}%
- Slow Queries (>${this.SLOW_QUERY_THRESHOLD}ms): ${stats.slowQueries.length}

Connection Pool:
- Total Connections: ${stats.connectionPoolStats.totalConnections}
- Active Connections: ${stats.connectionPoolStats.activeConnections}
- Pool Utilization: ${stats.connectionPoolStats.poolUtilization.toFixed(1)}%

Recent Slow Queries:
${stats.slowQueries.slice(0, 5).map(q => 
  `- ${q.query} (${q.duration}ms) at ${new Date(q.timestamp).toISOString()}`
).join('\n')}

Performance Status: ${this.getPerformanceStatus(stats)}
`;
  }

  private static async recordSlowQuery(metric: QueryPerformanceMetric): Promise<void> {
    try {
      await redis.lpush(this.SLOW_QUERIES_KEY, JSON.stringify(metric));
      await redis.ltrim(this.SLOW_QUERIES_KEY, 0, 99); // Keep last 100 slow queries
      await redis.expire(this.SLOW_QUERIES_KEY, this.RETENTION_PERIOD);
    } catch (error) {
      console.warn('Failed to record slow query:', error);
    }
  }

  private static async getRecentMetrics(): Promise<QueryPerformanceMetric[]> {
    try {
      const keys = await redis.keys(`${this.METRICS_KEY}:*`);
      const recentKeys = keys
        .filter(key => !key.endsWith(':counters'))
        .sort()
        .slice(-100); // Last 100 metrics

      if (recentKeys.length === 0) return [];

      const metricsData = await redis.mget(...recentKeys);
      return metricsData
        .filter(data => data !== null)
        .map(data => JSON.parse(data!));
    } catch (error) {
      console.warn('Failed to get recent metrics:', error);
      return [];
    }
  }

  private static async updatePerformanceCounters(metric: QueryPerformanceMetric): Promise<void> {
    try {
      const countersKey = `${this.METRICS_KEY}:counters`;
      
      await redis.hincrby(countersKey, 'totalQueries', 1);
      
      if (!metric.success) {
        await redis.hincrby(countersKey, 'totalErrors', 1);
      }
      
      await redis.expire(countersKey, this.RETENTION_PERIOD);
    } catch (error) {
      console.warn('Failed to update performance counters:', error);
    }
  }

  private static async getPerformanceCounters(): Promise<any> {
    try {
      const countersKey = `${this.METRICS_KEY}:counters`;
      const counters = await redis.hgetall(countersKey);
      
      return {
        totalQueries: parseInt(counters.totalQueries || '0'),
        totalErrors: parseInt(counters.totalErrors || '0'),
        totalConnections: 0, // Will be updated by connection manager
        activeConnections: 0,
        poolUtilization: 0
      };
    } catch (error) {
      console.warn('Failed to get performance counters:', error);
      return { totalQueries: 0, totalErrors: 0 };
    }
  }

  private static sanitizeQuery(query: string): string {
    // Remove sensitive data from queries for logging
    return query
      .replace(/'\w+'|"\w+"/g, "'***'") // Replace string literals
      .replace(/\d+/g, 'N') // Replace numbers
      .substring(0, 100); // Limit length
  }

  private static getPerformanceStatus(stats: DatabasePerformanceStats): string {
    if (stats.averageQueryTime > 100) return 'CRITICAL - High latency detected';
    if (stats.errorRate > 5) return 'WARNING - High error rate';
    if (stats.connectionPoolStats.poolUtilization > 80) return 'WARNING - High pool utilization';
    if (stats.averageQueryTime > 50) return 'ATTENTION - Queries approaching threshold';
    return 'HEALTHY';
  }
}

/**
 * Decorator function to automatically monitor database operations
 */
export function monitorDatabaseOperation(operationName: string) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      let success = true;
      let error: string | undefined;

      try {
        const result = await originalMethod.apply(this, args);
        return result;
      } catch (err) {
        success = false;
        error = err instanceof Error ? err.message : 'Unknown error';
        throw err;
      } finally {
        const duration = Date.now() - startTime;
        await DatabasePerformanceMonitor.recordQuery(
          operationName,
          duration,
          success,
          error
        );
      }
    };

    return descriptor;
  };
}