import { NextRequest, NextResponse } from 'next/server';
import { 
  getDatabaseStats, 
  getDatabaseHealthReport, 
  exportDatabaseMetrics 
} from '@/lib/database-monitor';
import { databaseHealthCheck } from '@/lib/database-serverless';
import { withDatabase } from '@/lib/database';

/**
 * DATABASE HEALTH AND MONITORING ENDPOINT
 * 
 * Provides comprehensive information about database performance,
 * prepared statement conflicts, and overall system health.
 */

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const format = url.searchParams.get('format') || 'json';
    const timeWindow = url.searchParams.get('timeWindow');
    const detailed = url.searchParams.get('detailed') === 'true';

    // Parse time window (default to 1 hour)
    const windowMs = timeWindow ? parseInt(timeWindow) * 1000 : 3600000;

    // Basic health check
    const healthCheck = await databaseHealthCheck({
      timeout: 5000,
      retries: 1
    });

    // Performance statistics
    const stats = getDatabaseStats(windowMs);

    // Comprehensive health report
    const healthReport = getDatabaseHealthReport(windowMs);

    // Test database connectivity with a simple query
    let connectivityTest;
    try {
      await withDatabase(async (db) => {
        await db.$queryRaw`SELECT 1 as test, NOW() as timestamp`;
      });
      connectivityTest = { status: 'success', message: 'Database connection successful' };
    } catch (error: any) {
      connectivityTest = { 
        status: 'error', 
        message: error.message,
        isPreparedStatementError: error.message.includes('prepared statement')
      };
    }

    // Return Prometheus metrics format
    if (format === 'prometheus') {
      const metrics = exportDatabaseMetrics('prometheus');
      return new NextResponse(metrics, {
        headers: {
          'Content-Type': 'text/plain; version=0.0.4; charset=utf-8',
        },
      });
    }

    // Basic response
    if (!detailed) {
      return NextResponse.json({
        status: healthReport.status,
        timestamp: new Date().toISOString(),
        database: {
          connectivity: connectivityTest.status,
          latency: healthCheck.latency,
        },
        metrics: {
          totalOperations: stats.totalOperations,
          errorRate: Math.round(stats.errorRate * 100) / 100,
          averageDuration: stats.averageDuration,
          preparedStatementErrors: stats.preparedStatementErrors,
        },
        issues: healthReport.issues,
      });
    }

    // Detailed response
    const detailedResponse = {
      status: healthReport.status,
      timestamp: new Date().toISOString(),
      environment: {
        isServerless: !!(
          process.env.VERCEL || 
          process.env.AWS_LAMBDA_FUNCTION_NAME || 
          process.env.NETLIFY
        ),
        platform: process.env.VERCEL ? 'vercel' : 
                 process.env.AWS_LAMBDA_FUNCTION_NAME ? 'aws-lambda' : 
                 process.env.NETLIFY ? 'netlify' : 'development',
        nodeEnv: process.env.NODE_ENV,
      },
      database: {
        connectivity: connectivityTest,
        health: healthCheck,
        connectionString: {
          configured: !!process.env.DATABASE_URL,
          host: process.env.DATABASE_URL ? new URL(process.env.DATABASE_URL).hostname : 'unknown',
          provider: 'postgresql',
        },
      },
      performance: {
        stats,
        timeWindow: `${windowMs / 1000}s`,
        healthReport,
      },
      serverlessConfiguration: {
        uniqueConnectionStrings: true,
        preparedStatementsDisabled: true,
        connectionPooling: false,
        automaticDisconnection: true,
        retryLogic: true,
      },
      monitoring: {
        metricsExported: exportDatabaseMetrics('json'),
      },
    };

    return NextResponse.json(detailedResponse);

  } catch (error: any) {
    console.error('Database health check failed:', error);
    
    return NextResponse.json(
      {
        status: 'error',
        timestamp: new Date().toISOString(),
        error: {
          message: error.message,
          isPreparedStatementError: error.message.includes('prepared statement'),
          isConnectionError: error.message.includes('connection') || error.message.includes('P1001'),
          isTimeoutError: error.message.includes('timeout') || error.message.includes('P1002'),
        },
        recommendations: [
          'Check DATABASE_URL environment variable',
          'Verify database server is running and accessible',
          'Check network connectivity',
          'Review database logs for errors',
        ],
      },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint to trigger manual health checks or reset metrics
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action = body.action;

    switch (action) {
      case 'reset-metrics':
        // Clear metrics history
        const { clearDatabaseMetrics } = await import('@/lib/database-monitor');
        clearDatabaseMetrics();
        
        return NextResponse.json({
          success: true,
          message: 'Database metrics cleared',
          timestamp: new Date().toISOString(),
        });

      case 'test-connection':
        // Perform comprehensive connection test
        const testResults = [];
        
        // Test 1: Basic connectivity
        try {
          await withDatabase(async (db) => {
            await db.$queryRaw`SELECT 1`;
          });
          testResults.push({ test: 'basic_connectivity', result: 'pass' });
        } catch (error: any) {
          testResults.push({ test: 'basic_connectivity', result: 'fail', error: error.message });
        }
        
        // Test 2: Multiple concurrent operations (prepared statement stress test)
        const concurrentPromises = [];
        for (let i = 0; i < 5; i++) {
          concurrentPromises.push(
            withDatabase(async (db) => {
              await db.$queryRaw`SELECT ${i} as test_id, NOW() as timestamp`;
            }).catch(error => ({ error: error.message, testId: i }))
          );
        }
        
        const concurrentResults = await Promise.allSettled(concurrentPromises);
        const concurrentPass = concurrentResults.every(r => r.status === 'fulfilled' && !('error' in r.value));
        
        testResults.push({
          test: 'concurrent_operations',
          result: concurrentPass ? 'pass' : 'fail',
          details: concurrentResults.map((r, i) => ({
            testId: i,
            status: r.status,
            error: r.status === 'rejected' ? r.reason.message : 
                   (r.status === 'fulfilled' && 'error' in r.value) ? r.value.error : null
          }))
        });
        
        return NextResponse.json({
          success: true,
          message: 'Connection tests completed',
          timestamp: new Date().toISOString(),
          testResults,
          overallResult: testResults.every(t => t.result === 'pass') ? 'pass' : 'fail'
        });

      default:
        return NextResponse.json(
          { error: 'Invalid action. Supported actions: reset-metrics, test-connection' },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('Database health POST request failed:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}