import { NextRequest, NextResponse } from 'next/server';
import { performanceTester } from '@/lib/database-performance-test';

/**
 * Database Performance Testing API Endpoint
 * 
 * Provides comprehensive testing of the high-performance webhook
 * database persistence system under various load conditions.
 * 
 * GET  /api/database/test - Run basic performance tests
 * POST /api/database/test - Run custom performance tests with config
 */

export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    console.log('🧪 Starting basic database performance test...');

    // Run basic performance test suite
    const results = await performanceTester.runFullTestSuite({
      totalWebhooks: 500,
      concurrentBatches: 5,
      batchSize: 20,
      testDuration: 15,
    });

    // Generate performance report
    const report = performanceTester.generateReport(results);
    console.log(report);

    const response = {
      success: results.success,
      testSuite: 'basic',
      configuration: {
        totalWebhooks: 500,
        concurrentBatches: 5,
        batchSize: 20,
      },
      results: results.results,
      summary: results.summary,
      recommendations: generateRecommendations(results),
      report,
      meta: {
        totalDuration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        serverless: !!process.env.VERCEL,
      },
    };

    if (!results.success) {
      console.warn('⚠️ Performance tests revealed issues');
      return NextResponse.json(response, { status: 207 }); // Multi-status
    }

    console.log('✅ All performance tests passed');
    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ Performance test suite failed:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      meta: {
        totalDuration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { 
      testType = 'full',
      config = {},
      skipTests = [],
    } = await request.json();

    console.log(`🧪 Starting ${testType} database performance test...`);

    let results;

    switch (testType) {
      case 'basic':
        results = await performanceTester.runFullTestSuite({
          totalWebhooks: 100,
          concurrentBatches: 2,
          batchSize: 10,
          testDuration: 5,
          ...config,
        });
        break;

      case 'load':
        results = await performanceTester.runFullTestSuite({
          totalWebhooks: 2000,
          concurrentBatches: 20,
          batchSize: 50,
          testDuration: 60,
          ...config,
        });
        break;

      case 'stress':
        results = await performanceTester.runFullTestSuite({
          totalWebhooks: 10000,
          concurrentBatches: 50,
          batchSize: 100,
          testDuration: 180,
          ...config,
        });
        break;

      case 'full':
      default:
        results = await performanceTester.runFullTestSuite({
          totalWebhooks: 1000,
          concurrentBatches: 10,
          batchSize: 25,
          testDuration: 30,
          ...config,
        });
        break;
    }

    // Generate detailed report
    const report = performanceTester.generateReport(results);
    const recommendations = generateRecommendations(results);
    const healthScore = calculateHealthScore(results);

    console.log(report);

    const response = {
      success: results.success,
      testSuite: testType,
      configuration: config,
      results: results.results,
      summary: results.summary,
      healthScore,
      recommendations,
      report,
      meta: {
        totalDuration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        serverless: !!process.env.VERCEL,
      },
    };

    if (!results.success || healthScore < 70) {
      console.warn(`⚠️ Performance issues detected (Health Score: ${healthScore}%)`);
      return NextResponse.json(response, { status: 207 });
    }

    console.log(`✅ Performance tests passed (Health Score: ${healthScore}%)`);
    return NextResponse.json(response);

  } catch (error) {
    console.error('❌ Custom performance test failed:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      meta: {
        totalDuration: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
    }, { status: 500 });
  }
}

/**
 * Generate performance recommendations based on test results
 */
function generateRecommendations(results: any): string[] {
  const recommendations: string[] = [];
  const { summary } = results;

  // Insert time recommendations
  if (summary.avgInsertTime > 1000) {
    recommendations.push(
      '🔧 Average insert time is high (>1s). Consider optimizing batch size or database connection pooling.'
    );
  }

  // Query time recommendations
  if (summary.avgQueryTime > 500) {
    recommendations.push(
      '🔍 Query performance needs improvement. Check if indexes are being used effectively.'
    );
  }

  // Throughput recommendations
  if (summary.maxThroughput < 100) {
    recommendations.push(
      '📈 Low throughput detected (<100/sec). Consider increasing batch size or concurrent processing.'
    );
  }

  // Memory efficiency recommendations
  if (summary.memoryEfficiency === 'Needs Optimization') {
    recommendations.push(
      '💾 Memory usage is high. Implement better garbage collection or reduce in-memory caching.'
    );
  }

  // Check individual test failures
  const failedTests = results.results.filter((r: any) => !r.success);
  if (failedTests.length > 0) {
    recommendations.push(
      `❗ ${failedTests.length} test(s) failed: ${failedTests.map((t: any) => t.testName).join(', ')}`
    );
  }

  // Database-specific recommendations
  const dbTest = results.results.find((r: any) => r.testName === 'Database Connection');
  if (dbTest && !dbTest.success) {
    recommendations.push(
      '🔌 Database connectivity issues detected. Check connection string and network configuration.'
    );
  }

  const indexTest = results.results.find((r: any) => r.testName === 'Index Effectiveness');
  if (indexTest && !indexTest.success) {
    recommendations.push(
      '📊 Database indexes are not being used effectively. Run migration to create performance indexes.'
    );
  }

  const cacheTest = results.results.find((r: any) => r.testName === 'Cache Performance');
  if (cacheTest && !cacheTest.success) {
    recommendations.push(
      '⚡ Redis cache performance is poor. Check Redis configuration and network latency.'
    );
  }

  // Environment-specific recommendations
  if (process.env.VERCEL) {
    recommendations.push(
      '☁️ Running on Vercel serverless. Consider using connection pooling for better performance.'
    );
  }

  if (recommendations.length === 0) {
    recommendations.push('🎉 All performance metrics are within acceptable ranges!');
  }

  return recommendations;
}

/**
 * Calculate overall health score based on test results
 */
function calculateHealthScore(results: any): number {
  const { summary, results: testResults } = results;
  let score = 0;
  let maxScore = 0;

  // Connection test (20 points)
  const connectionTest = testResults.find((r: any) => r.testName === 'Database Connection');
  if (connectionTest) {
    score += connectionTest.success ? 20 : 0;
    maxScore += 20;
  }

  // Insert performance (25 points)
  if (summary.avgInsertTime <= 500) score += 25;
  else if (summary.avgInsertTime <= 1000) score += 15;
  else if (summary.avgInsertTime <= 2000) score += 8;
  maxScore += 25;

  // Query performance (25 points)
  if (summary.avgQueryTime <= 200) score += 25;
  else if (summary.avgQueryTime <= 500) score += 15;
  else if (summary.avgQueryTime <= 1000) score += 8;
  maxScore += 25;

  // Throughput (20 points)
  if (summary.maxThroughput >= 500) score += 20;
  else if (summary.maxThroughput >= 200) score += 15;
  else if (summary.maxThroughput >= 100) score += 8;
  maxScore += 20;

  // Memory efficiency (10 points)
  if (summary.memoryEfficiency === 'Excellent') score += 10;
  else if (summary.memoryEfficiency === 'Good') score += 6;
  else score += 2;
  maxScore += 10;

  return Math.round((score / maxScore) * 100);
}

/**
 * PUT endpoint for advanced performance testing scenarios
 */
export async function PUT(request: NextRequest) {
  try {
    const { 
      action,
      parameters = {},
    } = await request.json();

    switch (action) {
      case 'benchmark':
        // Run specific benchmarks
        const benchmarkConfig = {
          totalWebhooks: parameters.webhooks || 5000,
          concurrentBatches: parameters.concurrent || 25,
          batchSize: parameters.batchSize || 50,
          testDuration: parameters.duration || 120,
        };

        const benchmarkResults = await performanceTester.runFullTestSuite(benchmarkConfig);

        return NextResponse.json({
          success: true,
          action: 'benchmark',
          configuration: benchmarkConfig,
          results: benchmarkResults,
          timestamp: new Date().toISOString(),
        });

      case 'validate':
        // Validate system is ready for production load
        const validationResults = await performanceTester.runFullTestSuite({
          totalWebhooks: 1000,
          concurrentBatches: 10,
          batchSize: 25,
          testDuration: 30,
        });

        const isProductionReady = validationResults.success && 
                                 validationResults.summary.maxThroughput >= 200 &&
                                 validationResults.summary.avgInsertTime <= 1000;

        return NextResponse.json({
          success: true,
          action: 'validate',
          productionReady: isProductionReady,
          results: validationResults,
          recommendations: generateRecommendations(validationResults),
          timestamp: new Date().toISOString(),
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Use: benchmark, validate',
        }, { status: 400 });
    }

  } catch (error) {
    console.error('Advanced performance test failed:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}