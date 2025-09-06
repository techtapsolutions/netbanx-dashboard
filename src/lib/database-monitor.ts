/**
 * DATABASE MONITORING AND PERFORMANCE TRACKING
 * 
 * This module provides comprehensive monitoring for the serverless database solution
 * to ensure prepared statement conflicts are resolved and performance is optimal.
 */

import { withDatabase } from './database';
import { createAlert } from './database-serverless';

export interface DatabaseMetrics {
  timestamp: Date;
  operationType: 'select' | 'insert' | 'update' | 'delete' | 'upsert';
  duration: number;
  success: boolean;
  error?: string;
  environment: 'serverless' | 'development';
  connectionId?: string;
}

export interface PerformanceStats {
  totalOperations: number;
  successfulOperations: number;
  failedOperations: number;
  averageDuration: number;
  maxDuration: number;
  minDuration: number;
  errorRate: number;
  preparedStatementErrors: number;
  connectionErrors: number;
  timeoutErrors: number;
}

class DatabaseMonitor {
  private metrics: DatabaseMetrics[] = [];
  private maxMetricsHistory = 1000;
  private alertThresholds = {
    errorRate: 0.05, // 5%
    averageDuration: 10000, // 10 seconds
    preparedStatementErrors: 1 // Any prepared statement error is critical
  };

  /**
   * Record a database operation metric
   */
  recordOperation(metric: Omit<DatabaseMetrics, 'timestamp'>) {
    const fullMetric: DatabaseMetrics = {
      ...metric,
      timestamp: new Date()
    };

    this.metrics.push(fullMetric);

    // Keep only recent metrics
    if (this.metrics.length > this.maxMetricsHistory) {
      this.metrics = this.metrics.slice(-this.maxMetricsHistory);
    }

    // Check for immediate alerts
    this.checkForAlerts(fullMetric);

    // Log the operation
    const status = fullMetric.success ? '✅' : '❌';
    console.log(
      `${status} DB ${fullMetric.operationType} (${fullMetric.environment}): ` +
      `${fullMetric.duration}ms${fullMetric.error ? ` - ${fullMetric.error}` : ''}`
    );
  }

  /**
   * Get performance statistics
   */
  getStats(timeWindow?: number): PerformanceStats {
    let metricsToAnalyze = this.metrics;

    if (timeWindow) {
      const cutoff = new Date(Date.now() - timeWindow);
      metricsToAnalyze = this.metrics.filter(m => m.timestamp > cutoff);
    }

    if (metricsToAnalyze.length === 0) {
      return {
        totalOperations: 0,
        successfulOperations: 0,
        failedOperations: 0,
        averageDuration: 0,
        maxDuration: 0,
        minDuration: 0,
        errorRate: 0,
        preparedStatementErrors: 0,
        connectionErrors: 0,
        timeoutErrors: 0
      };
    }

    const successful = metricsToAnalyze.filter(m => m.success);
    const failed = metricsToAnalyze.filter(m => !m.success);
    const durations = metricsToAnalyze.map(m => m.duration);

    const preparedStatementErrors = failed.filter(m => 
      m.error?.includes('prepared statement') || 
      m.error?.includes('already exists')
    ).length;

    const connectionErrors = failed.filter(m =>
      m.error?.includes('connection') ||
      m.error?.includes('connect') ||
      m.error?.includes('P1001')
    ).length;

    const timeoutErrors = failed.filter(m =>
      m.error?.includes('timeout') ||
      m.error?.includes('P1002')
    ).length;

    return {
      totalOperations: metricsToAnalyze.length,
      successfulOperations: successful.length,
      failedOperations: failed.length,
      averageDuration: Math.round(durations.reduce((a, b) => a + b, 0) / durations.length),
      maxDuration: Math.max(...durations),
      minDuration: Math.min(...durations),
      errorRate: failed.length / metricsToAnalyze.length,
      preparedStatementErrors,
      connectionErrors,
      timeoutErrors
    };
  }

  /**
   * Check for performance issues and create alerts
   */
  private async checkForAlerts(metric: DatabaseMetrics) {
    // Immediate alerts for critical errors
    if (!metric.success && metric.error) {
      if (metric.error.includes('prepared statement')) {
        await createAlert({
          type: 'ERROR',
          title: 'CRITICAL: Prepared Statement Conflict Detected',
          message: `Prepared statement conflict occurred despite serverless solution: ${metric.error}`,
          metadata: {
            metric,
            severity: 'CRITICAL',
            requiresImmedateAction: true
          }
        });
      }

      if (metric.error.includes('P1001') || metric.error.includes('connection')) {
        await createAlert({
          type: 'ERROR',
          title: 'Database Connection Error',
          message: `Database connection failed: ${metric.error}`,
          metadata: {
            metric,
            severity: 'HIGH'
          }
        });
      }
    }

    // Performance degradation alerts
    if (metric.success && metric.duration > this.alertThresholds.averageDuration) {
      await createAlert({
        type: 'WARNING',
        title: 'Slow Database Operation Detected',
        message: `Database operation took ${metric.duration}ms (threshold: ${this.alertThresholds.averageDuration}ms)`,
        metadata: {
          metric,
          severity: 'MEDIUM'
        }
      });
    }

    // Periodic stats-based alerts
    const recentStats = this.getStats(60000); // Last minute
    if (recentStats.totalOperations >= 10) { // Only alert if we have enough data
      if (recentStats.errorRate > this.alertThresholds.errorRate) {
        await createAlert({
          type: 'WARNING',
          title: 'High Database Error Rate',
          message: `Error rate is ${Math.round(recentStats.errorRate * 100)}% (threshold: ${Math.round(this.alertThresholds.errorRate * 100)}%)`,
          metadata: {
            stats: recentStats,
            severity: 'HIGH'
          }
        });
      }

      if (recentStats.preparedStatementErrors > 0) {
        await createAlert({
          type: 'ERROR',
          title: 'CRITICAL: Multiple Prepared Statement Errors',
          message: `${recentStats.preparedStatementErrors} prepared statement errors in the last minute`,
          metadata: {
            stats: recentStats,
            severity: 'CRITICAL',
            requiresImmedateAction: true
          }
        });
      }
    }
  }

  /**
   * Generate a comprehensive health report
   */
  generateHealthReport(timeWindow = 3600000): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    stats: PerformanceStats;
    issues: string[];
    recommendations: string[];
  } {
    const stats = this.getStats(timeWindow);
    const issues: string[] = [];
    const recommendations: string[] = [];
    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Critical issues
    if (stats.preparedStatementErrors > 0) {
      status = 'unhealthy';
      issues.push(`${stats.preparedStatementErrors} prepared statement conflicts detected`);
      recommendations.push('Check serverless database configuration');
      recommendations.push('Verify unique connection strings are being used');
    }

    // Performance issues
    if (stats.errorRate > this.alertThresholds.errorRate) {
      status = status === 'healthy' ? 'degraded' : status;
      issues.push(`High error rate: ${Math.round(stats.errorRate * 100)}%`);
      recommendations.push('Investigate database connectivity issues');
    }

    if (stats.averageDuration > this.alertThresholds.averageDuration / 2) {
      status = status === 'healthy' ? 'degraded' : status;
      issues.push(`Slow average response time: ${stats.averageDuration}ms`);
      recommendations.push('Consider optimizing database queries');
      recommendations.push('Check database server performance');
    }

    // Connection issues
    if (stats.connectionErrors > 0) {
      status = status === 'healthy' ? 'degraded' : status;
      issues.push(`${stats.connectionErrors} connection errors`);
      recommendations.push('Check database connection string');
      recommendations.push('Verify database server availability');
    }

    // Success case
    if (status === 'healthy') {
      recommendations.push('Database performance is optimal');
      recommendations.push('No immediate action required');
    }

    return {
      status,
      stats,
      issues,
      recommendations
    };
  }

  /**
   * Clear old metrics
   */
  clearMetrics() {
    this.metrics = [];
  }

  /**
   * Export metrics for external monitoring systems
   */
  exportMetrics(format: 'json' | 'prometheus' = 'json') {
    if (format === 'prometheus') {
      const stats = this.getStats();
      return [
        `# HELP database_operations_total Total number of database operations`,
        `# TYPE database_operations_total counter`,
        `database_operations_total{status="success"} ${stats.successfulOperations}`,
        `database_operations_total{status="error"} ${stats.failedOperations}`,
        ``,
        `# HELP database_operation_duration_ms Database operation duration in milliseconds`,
        `# TYPE database_operation_duration_ms histogram`,
        `database_operation_duration_ms_sum ${stats.averageDuration * stats.totalOperations}`,
        `database_operation_duration_ms_count ${stats.totalOperations}`,
        ``,
        `# HELP database_prepared_statement_errors_total Number of prepared statement errors`,
        `# TYPE database_prepared_statement_errors_total counter`,
        `database_prepared_statement_errors_total ${stats.preparedStatementErrors}`,
      ].join('\n');
    }

    return {
      metrics: this.metrics,
      stats: this.getStats(),
      timestamp: new Date()
    };
  }
}

// Global monitor instance
const monitor = new DatabaseMonitor();

/**
 * Wrap database operations with monitoring
 */
export async function withDatabaseMonitoring<T>(
  operation: string,
  dbOperation: () => Promise<T>,
  environment: 'serverless' | 'development' = 'serverless'
): Promise<T> {
  const startTime = Date.now();
  
  try {
    const result = await dbOperation();
    const duration = Date.now() - startTime;
    
    monitor.recordOperation({
      operationType: operation as any,
      duration,
      success: true,
      environment
    });
    
    return result;
  } catch (error: any) {
    const duration = Date.now() - startTime;
    
    monitor.recordOperation({
      operationType: operation as any,
      duration,
      success: false,
      error: error.message,
      environment
    });
    
    throw error;
  }
}

/**
 * Enhanced withDatabase wrapper with monitoring
 */
export async function withMonitoredDatabase<T>(
  operation: (client: any) => Promise<T>,
  operationType: string = 'select',
  options?: any
): Promise<T> {
  return withDatabaseMonitoring(
    operationType,
    () => withDatabase(operation, options),
    process.env.VERCEL ? 'serverless' : 'development'
  );
}

// Export monitor instance and functions
export { monitor as databaseMonitor };
export const getDatabaseStats = (timeWindow?: number) => monitor.getStats(timeWindow);
export const getDatabaseHealthReport = (timeWindow?: number) => monitor.generateHealthReport(timeWindow);
export const clearDatabaseMetrics = () => monitor.clearMetrics();
export const exportDatabaseMetrics = (format?: 'json' | 'prometheus') => monitor.exportMetrics(format);

/**
 * Middleware for API routes to automatically monitor database operations
 */
export function createDatabaseMonitoringMiddleware() {
  return {
    beforeDatabaseOperation: (operationType: string) => {
      const startTime = Date.now();
      return {
        complete: (success: boolean, error?: string) => {
          const duration = Date.now() - startTime;
          monitor.recordOperation({
            operationType: operationType as any,
            duration,
            success,
            error,
            environment: process.env.VERCEL ? 'serverless' : 'development'
          });
        }
      };
    }
  };
}