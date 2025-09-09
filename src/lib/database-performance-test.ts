import { withDatabase, redis } from '@/lib/database';
import { webhookStorePersistent } from '@/lib/webhook-store-persistent';
import { DatabaseMigrator } from '@/lib/database-migration';
import { PrismaClient } from '@prisma/client';
import { WebhookEvent } from '@/types/webhook';

/**
 * Database Performance Testing Suite
 * 
 * This module provides comprehensive testing for the high-performance
 * webhook database persistence system. It tests:
 * 
 * - Batch insert performance under load
 * - Query optimization effectiveness
 * - Index usage and performance
 * - Cache layer functionality
 * - Concurrent webhook processing
 * - Memory usage optimization
 */

interface PerformanceTestResult {
  testName: string;
  success: boolean;
  duration: number;
  throughput?: number;
  memoryUsed?: number;
  details: any;
  error?: string;
}

interface LoadTestConfig {
  totalWebhooks: number;
  concurrentBatches: number;
  batchSize: number;
  testDuration: number; // seconds
}

export class DatabasePerformanceTester {
  private startMemory: number = 0;
  private testResults: PerformanceTestResult[] = [];

  /**
   * Run comprehensive performance test suite
   */
  async runFullTestSuite(config?: Partial<LoadTestConfig>): Promise<{
    success: boolean;
    totalTests: number;
    passed: number;
    failed: number;
    results: PerformanceTestResult[];
    summary: {
      avgInsertTime: number;
      avgQueryTime: number;
      maxThroughput: number;
      memoryEfficiency: string;
    };
  }> {
    console.log('🚀 Starting NetBanx Database Performance Test Suite...');
    this.startMemory = process.memoryUsage().heapUsed;
    this.testResults = [];

    const defaultConfig: LoadTestConfig = {
      totalWebhooks: 1000,
      concurrentBatches: 10,
      batchSize: 25,
      testDuration: 30,
      ...config,
    };

    // Test sequence
    const tests = [
      () => this.testDatabaseConnection(),
      () => this.testMigrationStatus(),
      () => this.testBasicInsertPerformance(),
      () => this.testBatchInsertPerformance(defaultConfig),
      () => this.testQueryPerformance(),
      () => this.testIndexEffectiveness(),
      () => this.testCachePerformance(),
      () => this.testConcurrentOperations(defaultConfig),
      () => this.testMemoryUsage(defaultConfig),
      () => this.testDataRetention(),
    ];

    // Run all tests
    for (const test of tests) {
      try {
        const result = await test();
        this.testResults.push(result);
      } catch (error) {
        this.testResults.push({
          testName: 'Unknown Test',
          success: false,
          duration: 0,
          details: {},
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    // Calculate summary
    const passed = this.testResults.filter(r => r.success).length;
    const failed = this.testResults.length - passed;
    
    const avgInsertTime = this.calculateAverageMetric('insert_time');
    const avgQueryTime = this.calculateAverageMetric('query_time');
    const maxThroughput = Math.max(...this.testResults
      .filter(r => r.throughput)
      .map(r => r.throughput!));

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryGrowth = finalMemory - this.startMemory;
    const memoryEfficiency = memoryGrowth < 50 * 1024 * 1024 ? 'Excellent' : 
                            memoryGrowth < 100 * 1024 * 1024 ? 'Good' : 'Needs Optimization';

    console.log(`✅ Performance test suite completed: ${passed}/${this.testResults.length} tests passed`);

    return {
      success: failed === 0,
      totalTests: this.testResults.length,
      passed,
      failed,
      results: this.testResults,
      summary: {
        avgInsertTime,
        avgQueryTime,
        maxThroughput: maxThroughput || 0,
        memoryEfficiency,
      },
    };
  }

  /**
   * Test basic database connectivity
   */
  private async testDatabaseConnection(): Promise<PerformanceTestResult> {
    const startTime = Date.now();

    try {
      await withDatabase(async (db: PrismaClient) => {
        const result = await db.$queryRaw<Array<{ version: string }>>`SELECT version()`;
        
        return {
          testName: 'Database Connection',
          success: true,
          duration: Date.now() - startTime,
          details: {
            postgresVersion: result[0]?.version?.split(' ')[1] || 'Unknown',
            connectionMethod: process.env.VERCEL ? 'Serverless' : 'Direct',
          },
        };
      });

      return {
        testName: 'Database Connection',
        success: true,
        duration: Date.now() - startTime,
        details: { status: 'Connected successfully' },
      };
    } catch (error) {
      return {
        testName: 'Database Connection',
        success: false,
        duration: Date.now() - startTime,
        details: {},
        error: error instanceof Error ? error.message : 'Connection failed',
      };
    }
  }

  /**
   * Test migration status and optimization readiness
   */
  private async testMigrationStatus(): Promise<PerformanceTestResult> {
    const startTime = Date.now();

    try {
      const status = await DatabaseMigrator.checkMigrationStatus();
      
      return {
        testName: 'Migration Status',
        success: status.pending.length === 0,
        duration: Date.now() - startTime,
        details: {
          appliedMigrations: status.applied,
          pendingMigrations: status.pending,
          lastMaintenance: status.lastRun,
        },
      };
    } catch (error) {
      return {
        testName: 'Migration Status',
        success: false,
        duration: Date.now() - startTime,
        details: {},
        error: error instanceof Error ? error.message : 'Migration check failed',
      };
    }
  }

  /**
   * Test basic insert performance
   */
  private async testBasicInsertPerformance(): Promise<PerformanceTestResult> {
    const startTime = Date.now();

    try {
      const testWebhooks = this.generateTestWebhooks(100);
      const insertStart = Date.now();

      // Test individual inserts
      for (const webhook of testWebhooks.slice(0, 10)) {
        webhookStorePersistent.addWebhookEvent(webhook);
      }

      // Wait for batch processing
      await new Promise(resolve => setTimeout(resolve, 3000));

      const insertTime = Date.now() - insertStart;
      const throughput = Math.round(10 / (insertTime / 1000));

      return {
        testName: 'Basic Insert Performance',
        success: insertTime < 5000, // Should complete in under 5 seconds
        duration: Date.now() - startTime,
        throughput,
        details: {
          insert_time: insertTime,
          webhooks_inserted: 10,
          avg_time_per_webhook: Math.round(insertTime / 10),
        },
      };
    } catch (error) {
      return {
        testName: 'Basic Insert Performance',
        success: false,
        duration: Date.now() - startTime,
        details: {},
        error: error instanceof Error ? error.message : 'Insert test failed',
      };
    }
  }

  /**
   * Test batch insert performance under load
   */
  private async testBatchInsertPerformance(config: LoadTestConfig): Promise<PerformanceTestResult> {
    const startTime = Date.now();

    try {
      const testWebhooks = this.generateTestWebhooks(config.totalWebhooks);
      const batchStart = Date.now();

      // Process webhooks in batches
      for (let i = 0; i < testWebhooks.length; i += config.batchSize) {
        const batch = testWebhooks.slice(i, i + config.batchSize);
        batch.forEach(webhook => {
          webhookStorePersistent.addWebhookEvent(webhook);
        });

        // Small delay to simulate real webhook timing
        if (i % (config.batchSize * 5) === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      // Wait for all batches to process
      await new Promise(resolve => setTimeout(resolve, 5000));

      const batchTime = Date.now() - batchStart;
      const throughput = Math.round(config.totalWebhooks / (batchTime / 1000));

      return {
        testName: 'Batch Insert Performance',
        success: throughput > 100, // Should handle > 100 webhooks/second
        duration: Date.now() - startTime,
        throughput,
        details: {
          total_webhooks: config.totalWebhooks,
          batch_time: batchTime,
          batch_size: config.batchSize,
          avg_batch_time: Math.round(batchTime / (config.totalWebhooks / config.batchSize)),
        },
      };
    } catch (error) {
      return {
        testName: 'Batch Insert Performance',
        success: false,
        duration: Date.now() - startTime,
        details: {},
        error: error instanceof Error ? error.message : 'Batch test failed',
      };
    }
  }

  /**
   * Test query performance with various filters
   */
  private async testQueryPerformance(): Promise<PerformanceTestResult> {
    const startTime = Date.now();

    try {
      const queries = [
        () => webhookStorePersistent.getWebhookEvents(100),
        () => webhookStorePersistent.getWebhookEvents(500),
        () => webhookStorePersistent.getTransactions(100),
        () => webhookStorePersistent.getTransactions(1000),
        () => webhookStorePersistent.getWebhookStats(),
      ];

      const queryTimes: number[] = [];
      
      for (const query of queries) {
        const queryStart = Date.now();
        await query();
        queryTimes.push(Date.now() - queryStart);
      }

      const avgQueryTime = queryTimes.reduce((a, b) => a + b, 0) / queryTimes.length;
      const maxQueryTime = Math.max(...queryTimes);

      return {
        testName: 'Query Performance',
        success: avgQueryTime < 1000 && maxQueryTime < 2000, // Avg < 1s, Max < 2s
        duration: Date.now() - startTime,
        details: {
          query_time: avgQueryTime,
          max_query_time: maxQueryTime,
          queries_tested: queries.length,
          individual_times: queryTimes,
        },
      };
    } catch (error) {
      return {
        testName: 'Query Performance',
        success: false,
        duration: Date.now() - startTime,
        details: {},
        error: error instanceof Error ? error.message : 'Query test failed',
      };
    }
  }

  /**
   * Test index effectiveness
   */
  private async testIndexEffectiveness(): Promise<PerformanceTestResult> {
    const startTime = Date.now();

    try {
      const indexQueries = await withDatabase(async (db: PrismaClient) => {
        // Check if indexes are being used
        const indexUsage = await db.$queryRaw<Array<{
          tablename: string;
          indexname: string;
          idx_scan: number;
          idx_tup_read: number;
        }>>`
          SELECT tablename, indexname, idx_scan, idx_tup_read
          FROM pg_stat_user_indexes 
          WHERE tablename IN ('webhook_events', 'transactions')
          AND idx_scan > 0
          ORDER BY idx_scan DESC
        `;

        return indexUsage;
      });

      const activeIndexes = indexQueries.length;
      const totalScans = indexQueries.reduce((sum, idx) => sum + idx.idx_scan, 0);

      return {
        testName: 'Index Effectiveness',
        success: activeIndexes >= 5 && totalScans > 0, // Should have active indexes
        duration: Date.now() - startTime,
        details: {
          active_indexes: activeIndexes,
          total_scans: totalScans,
          top_indexes: indexQueries.slice(0, 3).map(idx => ({
            name: idx.indexname,
            scans: idx.idx_scan,
          })),
        },
      };
    } catch (error) {
      return {
        testName: 'Index Effectiveness',
        success: false,
        duration: Date.now() - startTime,
        details: {},
        error: error instanceof Error ? error.message : 'Index test failed',
      };
    }
  }

  /**
   * Test Redis cache performance
   */
  private async testCachePerformance(): Promise<PerformanceTestResult> {
    const startTime = Date.now();

    try {
      // Test cache connectivity and performance
      const cacheStart = Date.now();
      await redis.ping();
      const pingTime = Date.now() - cacheStart;

      // Test cache operations
      const testKey = 'perf_test_' + Date.now();
      const testData = { test: 'performance', timestamp: Date.now() };

      const setStart = Date.now();
      await redis.setex(testKey, 60, JSON.stringify(testData));
      const setTime = Date.now() - setStart;

      const getStart = Date.now();
      const retrieved = await redis.get(testKey);
      const getTime = Date.now() - getStart;

      await redis.del(testKey);

      const success = retrieved !== null && pingTime < 100 && setTime < 50 && getTime < 50;

      return {
        testName: 'Cache Performance',
        success,
        duration: Date.now() - startTime,
        details: {
          ping_time: pingTime,
          set_time: setTime,
          get_time: getTime,
          data_integrity: retrieved === JSON.stringify(testData),
        },
      };
    } catch (error) {
      return {
        testName: 'Cache Performance',
        success: false,
        duration: Date.now() - startTime,
        details: {},
        error: error instanceof Error ? error.message : 'Cache test failed',
      };
    }
  }

  /**
   * Test concurrent operations
   */
  private async testConcurrentOperations(config: LoadTestConfig): Promise<PerformanceTestResult> {
    const startTime = Date.now();

    try {
      const concurrentStart = Date.now();
      
      // Create concurrent webhook processing tasks
      const tasks = [];
      for (let i = 0; i < config.concurrentBatches; i++) {
        tasks.push(this.processConcurrentBatch(config.batchSize, i));
      }

      await Promise.all(tasks);
      
      const concurrentTime = Date.now() - concurrentStart;
      const totalProcessed = config.concurrentBatches * config.batchSize;
      const throughput = Math.round(totalProcessed / (concurrentTime / 1000));

      return {
        testName: 'Concurrent Operations',
        success: throughput > 200, // Should handle > 200 concurrent webhooks/second
        duration: Date.now() - startTime,
        throughput,
        details: {
          concurrent_batches: config.concurrentBatches,
          total_processed: totalProcessed,
          concurrent_time: concurrentTime,
          avg_time_per_batch: Math.round(concurrentTime / config.concurrentBatches),
        },
      };
    } catch (error) {
      return {
        testName: 'Concurrent Operations',
        success: false,
        duration: Date.now() - startTime,
        details: {},
        error: error instanceof Error ? error.message : 'Concurrency test failed',
      };
    }
  }

  /**
   * Test memory usage efficiency
   */
  private async testMemoryUsage(config: LoadTestConfig): Promise<PerformanceTestResult> {
    const startTime = Date.now();

    try {
      const beforeMemory = process.memoryUsage();
      
      // Process a large batch of webhooks
      const webhooks = this.generateTestWebhooks(config.totalWebhooks);
      webhooks.forEach(webhook => {
        webhookStorePersistent.addWebhookEvent(webhook);
      });

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 3000));

      const afterMemory = process.memoryUsage();
      const memoryGrowth = afterMemory.heapUsed - beforeMemory.heapUsed;
      const memoryPerWebhook = Math.round(memoryGrowth / config.totalWebhooks);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const afterGcMemory = process.memoryUsage();
      const memoryEfficiency = (afterGcMemory.heapUsed - beforeMemory.heapUsed) / memoryGrowth;

      return {
        testName: 'Memory Usage',
        success: memoryPerWebhook < 1024 && memoryEfficiency < 0.5, // < 1KB per webhook, good GC
        duration: Date.now() - startTime,
        memoryUsed: memoryGrowth,
        details: {
          memory_growth_mb: Math.round(memoryGrowth / (1024 * 1024) * 100) / 100,
          memory_per_webhook: memoryPerWebhook,
          memory_efficiency: Math.round(memoryEfficiency * 100) / 100,
          webhooks_processed: config.totalWebhooks,
        },
      };
    } catch (error) {
      return {
        testName: 'Memory Usage',
        success: false,
        duration: Date.now() - startTime,
        details: {},
        error: error instanceof Error ? error.message : 'Memory test failed',
      };
    }
  }

  /**
   * Test data retention and cleanup
   */
  private async testDataRetention(): Promise<PerformanceTestResult> {
    const startTime = Date.now();

    try {
      // Test cleanup functionality
      const cleanupResult = await DatabaseMigrator.runMaintenance();
      
      const success = cleanupResult.every(result => result.success);
      const totalCleaned = cleanupResult.reduce((sum, result) => sum + result.records_affected, 0);

      return {
        testName: 'Data Retention',
        success,
        duration: Date.now() - startTime,
        details: {
          cleanup_operations: cleanupResult.length,
          records_cleaned: totalCleaned,
          operations: cleanupResult.map(r => ({
            operation: r.operation,
            records: r.records_affected,
            time: r.execution_time_ms,
          })),
        },
      };
    } catch (error) {
      return {
        testName: 'Data Retention',
        success: false,
        duration: Date.now() - startTime,
        details: {},
        error: error instanceof Error ? error.message : 'Retention test failed',
      };
    }
  }

  /**
   * Process a concurrent batch of webhooks
   */
  private async processConcurrentBatch(batchSize: number, batchId: number): Promise<void> {
    const webhooks = this.generateTestWebhooks(batchSize, `batch_${batchId}`);
    
    webhooks.forEach(webhook => {
      webhookStorePersistent.addWebhookEvent(webhook);
    });

    // Small delay to simulate processing time
    await new Promise(resolve => setTimeout(resolve, Math.random() * 100));
  }

  /**
   * Generate test webhooks for performance testing
   */
  private generateTestWebhooks(count: number, prefix: string = 'test'): WebhookEvent[] {
    const webhooks: WebhookEvent[] = [];
    const eventTypes = ['PAYMENT_COMPLETED', 'PAYMENT_FAILED', 'PAYMENT_PENDING', 'PAYMENT_AUTHORIZED'];
    
    for (let i = 0; i < count; i++) {
      webhooks.push({
        id: `${prefix}_${i}_${Date.now()}`,
        timestamp: new Date(Date.now() - Math.random() * 24 * 60 * 60 * 1000).toISOString(),
        eventType: eventTypes[Math.floor(Math.random() * eventTypes.length)],
        source: 'netbanx',
        processed: true,
        payload: {
          id: `pay_${i}_${Date.now()}`,
          eventType: eventTypes[Math.floor(Math.random() * eventTypes.length)],
          eventData: {
            id: `pay_${i}_${Date.now()}`,
            merchantRefNum: `ORDER_${prefix.toUpperCase()}_${i}`,
            amount: Math.floor(Math.random() * 50000) / 100,
            currencyCode: 'USD',
            status: 'COMPLETED',
            txnTime: new Date().toISOString(),
            card: {
              type: ['VISA', 'MASTERCARD', 'AMEX'][Math.floor(Math.random() * 3)],
              lastDigits: Math.floor(Math.random() * 9999).toString().padStart(4, '0'),
            },
          },
        },
      });
    }
    
    return webhooks;
  }

  /**
   * Calculate average metric from test results
   */
  private calculateAverageMetric(metricName: string): number {
    const values = this.testResults
      .map(r => r.details[metricName])
      .filter(v => typeof v === 'number');
    
    return values.length > 0 ? Math.round(values.reduce((a, b) => a + b, 0) / values.length) : 0;
  }

  /**
   * Generate performance report
   */
  generateReport(results: any): string {
    const { success, totalTests, passed, failed, summary } = results;
    
    let report = `
=== NetBanx Database Performance Test Report ===
Date: ${new Date().toISOString()}
Environment: ${process.env.NODE_ENV || 'development'}

OVERALL RESULTS:
✓ Tests Passed: ${passed}/${totalTests}
✗ Tests Failed: ${failed}/${totalTests}
Status: ${success ? '🟢 PASS' : '🔴 FAIL'}

PERFORMANCE METRICS:
- Average Insert Time: ${summary.avgInsertTime}ms
- Average Query Time: ${summary.avgQueryTime}ms
- Maximum Throughput: ${summary.maxThroughput} webhooks/second
- Memory Efficiency: ${summary.memoryEfficiency}

DETAILED RESULTS:
`;

    results.results.forEach((result: PerformanceTestResult) => {
      report += `
${result.success ? '✅' : '❌'} ${result.testName}
  Duration: ${result.duration}ms
  ${result.throughput ? `Throughput: ${result.throughput}/sec` : ''}
  ${result.error ? `Error: ${result.error}` : ''}
  Details: ${JSON.stringify(result.details, null, 2)}
`;
    });

    return report;
  }
}

// Export singleton for use in API endpoints
export const performanceTester = new DatabasePerformanceTester();