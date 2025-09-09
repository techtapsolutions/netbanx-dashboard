import { NextRequest, NextResponse } from 'next/server';
import { DatabasePerformanceMonitor } from '@/lib/database-performance-monitor';

/**
 * @swagger
 * /api/database/performance-monitor:
 *   get:
 *     summary: Get database performance statistics
 *     description: Retrieve real-time database performance metrics including query times, slow queries, and connection pool status
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, report]
 *           default: json
 *         description: Response format (json for API, report for human-readable)
 *     responses:
 *       200:
 *         description: Performance statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     averageQueryTime:
 *                       type: number
 *                       description: Average query execution time in milliseconds
 *                     slowQueries:
 *                       type: array
 *                       description: Recent slow queries exceeding threshold
 *                     queryCount:
 *                       type: integer
 *                       description: Total number of queries tracked
 *                     errorRate:
 *                       type: number
 *                       description: Error rate percentage
 *                     connectionPoolStats:
 *                       type: object
 *                       properties:
 *                         totalConnections:
 *                           type: integer
 *                         activeConnections:
 *                           type: integer
 *                         poolUtilization:
 *                           type: number
 *   post:
 *     summary: Record a database query performance metric
 *     description: Manually record a database operation for performance tracking
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *               - duration
 *             properties:
 *               query:
 *                 type: string
 *                 description: Query description or operation name
 *               duration:
 *                 type: number
 *                 description: Execution time in milliseconds
 *               success:
 *                 type: boolean
 *                 description: Whether the query succeeded
 *                 default: true
 *               error:
 *                 type: string
 *                 description: Error message if query failed
 *   delete:
 *     summary: Clear performance metrics
 *     description: Clear all stored performance metrics (for testing/maintenance)
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';
    
    if (format === 'report') {
      // Return human-readable performance report
      const report = await DatabasePerformanceMonitor.generateReport();
      
      return new NextResponse(report, {
        headers: {
          'Content-Type': 'text/plain',
        },
      });
    }
    
    // Return JSON performance statistics
    const stats = await DatabasePerformanceMonitor.getPerformanceStats();
    
    return NextResponse.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Performance monitoring API error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to retrieve performance statistics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, duration, success = true, error } = body;
    
    if (!query || typeof duration !== 'number') {
      return NextResponse.json(
        { 
          success: false,
          error: 'Missing required fields: query and duration'
        },
        { status: 400 }
      );
    }
    
    await DatabasePerformanceMonitor.recordQuery(query, duration, success, error);
    
    return NextResponse.json({
      success: true,
      message: 'Performance metric recorded successfully',
    });

  } catch (error) {
    console.error('Performance recording API error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to record performance metric',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await DatabasePerformanceMonitor.clearMetrics();
    
    return NextResponse.json({
      success: true,
      message: 'Performance metrics cleared successfully',
    });

  } catch (error) {
    console.error('Performance clearing API error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: 'Failed to clear performance metrics',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}