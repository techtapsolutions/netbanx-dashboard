import { NextRequest, NextResponse } from 'next/server';
import { DatabaseMigrator } from '@/lib/database-migration';

/**
 * Database Migration API Endpoint
 * 
 * Applies database optimizations and performance improvements
 * for high-volume webhook processing.
 * 
 * GET /api/database/migrate - Check migration status
 * POST /api/database/migrate - Run migrations
 */

export async function GET(request: NextRequest) {
  try {
    const status = await DatabaseMigrator.checkMigrationStatus();
    const history = await DatabaseMigrator.getMaintenanceHistory(10);

    return NextResponse.json({
      success: true,
      migrationStatus: status,
      maintenanceHistory: history,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Failed to check migration status:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const { action, force } = await request.json().catch(() => ({ action: 'migrate' }));

    let results;

    switch (action) {
      case 'migrate':
        console.log('Starting database migrations for webhook persistence optimization...');
        results = await DatabaseMigrator.applyOptimizations();
        break;

      case 'maintenance':
        console.log('Running database maintenance tasks...');
        results = await DatabaseMigrator.runMaintenance();
        break;

      case 'status':
        console.log('Checking migration status...');
        const status = await DatabaseMigrator.checkMigrationStatus();
        return NextResponse.json({
          success: true,
          status,
          meta: {
            responseTime: Date.now() - startTime,
            timestamp: new Date().toISOString(),
          },
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Use: migrate, maintenance, or status',
        }, { status: 400 });
    }

    // Count successful and failed operations
    const successful = Array.isArray(results) 
      ? results.filter(r => r.success || r.success !== false).length
      : 0;
    const failed = Array.isArray(results) 
      ? results.filter(r => r.success === false).length
      : 0;

    const response = {
      success: failed === 0,
      action,
      results,
      summary: {
        successful,
        failed,
        total: Array.isArray(results) ? results.length : 0,
      },
      meta: {
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
      },
    };

    if (failed > 0) {
      console.warn(`Database ${action} completed with ${failed} failures`);
      return NextResponse.json(response, { status: 207 }); // Multi-status
    }

    console.log(`Database ${action} completed successfully`);
    return NextResponse.json(response);

  } catch (error) {
    console.error('Database operation failed:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      meta: {
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
    }, { status: 500 });
  }
}

/**
 * PUT endpoint for advanced migration operations
 */
export async function PUT(request: NextRequest) {
  try {
    const { operation, parameters } = await request.json();

    switch (operation) {
      case 'cleanup':
        const days = parameters?.days || 90;
        console.log(`Running cleanup for data older than ${days} days...`);
        
        // This would be implemented in the DatabaseMigrator
        const cleanupResult = await DatabaseMigrator.runMaintenance();
        
        return NextResponse.json({
          success: true,
          operation: 'cleanup',
          parameters: { days },
          result: cleanupResult,
          timestamp: new Date().toISOString(),
        });

      case 'reindex':
        console.log('Running database reindexing...');
        
        // Force recreation of indexes
        const reindexResult = await DatabaseMigrator.applyOptimizations();
        
        return NextResponse.json({
          success: true,
          operation: 'reindex',
          result: reindexResult,
          timestamp: new Date().toISOString(),
        });

      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid operation. Use: cleanup, reindex',
        }, { status: 400 });
    }

  } catch (error) {
    console.error('Advanced migration operation failed:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}