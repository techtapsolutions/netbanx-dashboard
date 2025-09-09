import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';
import { DatabasePerformanceMonitor } from '@/lib/database-performance-monitor';

/**
 * ULTRA-OPTIMIZED DASHBOARD API
 * 
 * Demonstrates query batching and transaction optimization
 * - Single database transaction for all queries
 * - Parallel execution within transaction
 * - Raw SQL for maximum performance
 * - Minimal data transfer
 * - Ultimate optimization level
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    console.log('🚀 Ultra-optimized dashboard API called');
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get('companyId');
    const limit = parseInt(searchParams.get('limit') || '500');
    const timeRange = (searchParams.get('timeRange') || 'day') as 'hour' | 'day' | 'week' | 'month';

    console.log('📊 Dashboard request:', { companyId, limit, timeRange });

    // Execute the ultra-optimized query batching
    const dashboardData = await DatabaseService.getDashboardDataOptimized({
      companyId: companyId || undefined,
      limit,
      timeRange,
    });

    const totalDuration = Date.now() - startTime;
    console.log(`⚡ Ultra-optimized dashboard data loaded in ${totalDuration}ms`);

    // Record performance metrics
    await DatabasePerformanceMonitor.recordQuery(
      'api_dashboard_optimized',
      totalDuration,
      true
    );

    const response = {
      success: true,
      data: dashboardData,
      performance: {
        responseTime: totalDuration,
        target: '<2000ms',
        achieved: totalDuration < 2000,
        optimizationLevel: 'ULTIMATE',
        improvements: [
          'Single database transaction for all queries',
          'Parallel execution within transaction',
          'Raw SQL aggregations',
          'Minimal field selection',
          'Advanced query batching',
        ],
      },
      metadata: {
        apiVersion: 'v2-optimized',
        timestamp: new Date().toISOString(),
        filters: { companyId, limit, timeRange },
      },
    };

    return NextResponse.json(response, {
      headers: {
        'X-Response-Time': `${totalDuration}ms`,
        'X-Optimization-Level': 'ULTIMATE',
        'X-Database-Roundtrips': '1',
        'X-Queries-Executed': '6',
        'X-Performance-Target': '<2000ms',
        'X-Performance-Achieved': totalDuration < 2000 ? 'TRUE' : 'FALSE',
      },
    });

  } catch (error) {
    const errorDuration = Date.now() - startTime;
    console.error('❌ Ultra-optimized dashboard API error:', error);

    // Record error metrics
    await DatabasePerformanceMonitor.recordQuery(
      'api_dashboard_optimized',
      errorDuration,
      false,
      error instanceof Error ? error.message : 'Unknown error'
    );

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to fetch optimized dashboard data',
        details: error instanceof Error ? error.message : 'Unknown error',
        performance: {
          responseTime: errorDuration,
          target: '<2000ms',
          achieved: false,
        },
      },
      { status: 500 }
    );
  }
}

/**
 * POST endpoint for bulk webhook processing demonstration
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    console.log('🔄 Bulk webhook processing API called');
    const webhooks = await request.json();

    if (!Array.isArray(webhooks) || webhooks.length === 0) {
      return NextResponse.json(
        { error: 'Invalid or empty webhooks array' },
        { status: 400 }
      );
    }

    console.log(`📦 Processing ${webhooks.length} webhooks in batch`);

    // Process all webhooks in a single optimized transaction
    const result = await DatabaseService.batchProcessWebhooks(webhooks);

    const totalDuration = Date.now() - startTime;
    console.log(`⚡ Batch processed ${webhooks.length} webhooks in ${totalDuration}ms`);

    // Record performance metrics
    await DatabasePerformanceMonitor.recordQuery(
      'api_batch_webhook_processing',
      totalDuration,
      true
    );

    const response = {
      success: true,
      result,
      performance: {
        responseTime: totalDuration,
        webhooksProcessed: webhooks.length,
        avgTimePerWebhook: Number((totalDuration / webhooks.length).toFixed(2)),
        optimizationLevel: 'BATCH_TRANSACTION',
        improvements: [
          'Single database transaction',
          'Batch insert operations',
          'Raw SQL upserts',
          'Parallel processing',
        ],
      },
      metadata: {
        timestamp: new Date().toISOString(),
        webhookCount: webhooks.length,
      },
    };

    return NextResponse.json(response, {
      headers: {
        'X-Response-Time': `${totalDuration}ms`,
        'X-Webhooks-Processed': webhooks.length.toString(),
        'X-Avg-Time-Per-Webhook': `${(totalDuration / webhooks.length).toFixed(2)}ms`,
        'X-Optimization-Level': 'BATCH_TRANSACTION',
      },
    });

  } catch (error) {
    const errorDuration = Date.now() - startTime;
    console.error('❌ Bulk webhook processing error:', error);

    await DatabasePerformanceMonitor.recordQuery(
      'api_batch_webhook_processing',
      errorDuration,
      false,
      error instanceof Error ? error.message : 'Unknown error'
    );

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to process webhooks in batch',
        details: error instanceof Error ? error.message : 'Unknown error',
        performance: {
          responseTime: errorDuration,
        },
      },
      { status: 500 }
    );
  }
}