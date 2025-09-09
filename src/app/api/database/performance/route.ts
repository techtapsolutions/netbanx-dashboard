import { NextRequest, NextResponse } from 'next/server';
import { withDatabase } from '@/lib/database';
import { PrismaClient } from '@prisma/client';

/**
 * Database Performance Monitoring Endpoint
 * 
 * Provides real-time database performance metrics, query statistics,
 * and health information for webhook processing optimization.
 */

interface PerformanceMetrics {
  connectionInfo: {
    activeConnections: number;
    maxConnections: number;
    connectionUtilization: number;
  };
  tableStats: {
    tableName: string;
    rowCount: number;
    tableSize: string;
    indexSize: string;
    totalSize: string;
  }[];
  queryPerformance: {
    avgResponseTime: number;
    slowQueries: number;
    activeQueries: number;
  };
  systemHealth: {
    diskUsage: number;
    cacheHitRatio: number;
    indexUsage: number;
  };
  maintenanceStatus: {
    lastVacuum: string;
    lastAnalyze: string;
    deadTuples: number;
  };
}

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const metrics = await withDatabase(async (db: PrismaClient) => {
      // Get database connection information
      const connectionInfo = await getConnectionInfo(db);
      
      // Get table statistics
      const tableStats = await getTableStats(db);
      
      // Get query performance metrics
      const queryPerformance = await getQueryPerformance(db);
      
      // Get system health metrics
      const systemHealth = await getSystemHealth(db);
      
      // Get maintenance status
      const maintenanceStatus = await getMaintenanceStatus(db);

      return {
        connectionInfo,
        tableStats,
        queryPerformance,
        systemHealth,
        maintenanceStatus,
      };
    });

    const responseTime = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      metrics,
      meta: {
        responseTime,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        serverless: !!process.env.VERCEL,
      },
    });

  } catch (error) {
    console.error('Database performance monitoring failed:', error);

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      metrics: null,
      meta: {
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
    }, { status: 500 });
  }
}

async function getConnectionInfo(db: PrismaClient) {
  try {
    const result = await db.$queryRaw<Array<{ 
      active_connections: number; 
      max_connections: number; 
    }>>`
      SELECT 
        COUNT(*) FILTER (WHERE state = 'active') as active_connections,
        (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections
      FROM pg_stat_activity
    `;

    const { active_connections, max_connections } = result[0];
    
    return {
      activeConnections: active_connections,
      maxConnections: max_connections,
      connectionUtilization: Math.round((active_connections / max_connections) * 100),
    };
  } catch (error) {
    console.warn('Failed to get connection info:', error);
    return {
      activeConnections: 0,
      maxConnections: 100,
      connectionUtilization: 0,
    };
  }
}

async function getTableStats(db: PrismaClient) {
  try {
    const result = await db.$queryRaw<Array<{
      table_name: string;
      row_count: bigint;
      table_size: string;
      index_size: string;
      total_size: string;
    }>>`
      SELECT 
        schemaname || '.' || tablename as table_name,
        n_tup_ins + n_tup_upd as row_count,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
        pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) as index_size
      FROM pg_stat_user_tables 
      WHERE tablename IN ('webhook_events', 'transactions', 'system_metrics', 'accounts')
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    `;

    return result.map(row => ({
      tableName: row.table_name,
      rowCount: Number(row.row_count),
      tableSize: row.table_size,
      indexSize: row.index_size,
      totalSize: row.total_size,
    }));
  } catch (error) {
    console.warn('Failed to get table stats:', error);
    return [];
  }
}

async function getQueryPerformance(db: PrismaClient) {
  try {
    // Basic query performance metrics
    const result = await db.$queryRaw<Array<{
      avg_response_time: number;
      slow_queries: number;
      active_queries: number;
    }>>`
      SELECT 
        COALESCE(AVG(EXTRACT(EPOCH FROM (clock_timestamp() - query_start)) * 1000), 0) as avg_response_time,
        COUNT(*) FILTER (WHERE EXTRACT(EPOCH FROM (clock_timestamp() - query_start)) > 1) as slow_queries,
        COUNT(*) FILTER (WHERE state = 'active') as active_queries
      FROM pg_stat_activity 
      WHERE datname = current_database() AND state IS NOT NULL
    `;

    const metrics = result[0];
    
    return {
      avgResponseTime: Math.round(metrics.avg_response_time || 0),
      slowQueries: Number(metrics.slow_queries || 0),
      activeQueries: Number(metrics.active_queries || 0),
    };
  } catch (error) {
    console.warn('Failed to get query performance:', error);
    return {
      avgResponseTime: 0,
      slowQueries: 0,
      activeQueries: 0,
    };
  }
}

async function getSystemHealth(db: PrismaClient) {
  try {
    const result = await db.$queryRaw<Array<{
      cache_hit_ratio: number;
      index_usage: number;
      disk_usage: number;
    }>>`
      SELECT 
        ROUND(
          100.0 * SUM(heap_blks_hit) / NULLIF(SUM(heap_blks_hit + heap_blks_read), 0), 2
        ) as cache_hit_ratio,
        ROUND(
          100.0 * SUM(idx_blks_hit) / NULLIF(SUM(idx_blks_hit + idx_blks_read), 0), 2
        ) as index_usage,
        ROUND(
          100.0 * (SELECT SUM(pg_database_size(datname)) FROM pg_database WHERE datname = current_database()) / 
          (1024 * 1024 * 1024), 2
        ) as disk_usage
      FROM pg_statio_user_tables
      WHERE schemaname = 'public'
    `;

    const metrics = result[0];
    
    return {
      diskUsage: Number(metrics.disk_usage || 0),
      cacheHitRatio: Number(metrics.cache_hit_ratio || 0),
      indexUsage: Number(metrics.index_usage || 0),
    };
  } catch (error) {
    console.warn('Failed to get system health:', error);
    return {
      diskUsage: 0,
      cacheHitRatio: 0,
      indexUsage: 0,
    };
  }
}

async function getMaintenanceStatus(db: PrismaClient) {
  try {
    const result = await db.$queryRaw<Array<{
      table_name: string;
      last_vacuum: Date | null;
      last_analyze: Date | null;
      dead_tuples: number;
    }>>`
      SELECT 
        schemaname || '.' || relname as table_name,
        last_vacuum,
        last_analyze,
        n_dead_tup as dead_tuples
      FROM pg_stat_user_tables 
      WHERE relname IN ('webhook_events', 'transactions', 'system_metrics')
      ORDER BY n_dead_tup DESC
      LIMIT 1
    `;

    const maintenance = result[0];
    
    return {
      lastVacuum: maintenance?.last_vacuum?.toISOString() || 'Never',
      lastAnalyze: maintenance?.last_analyze?.toISOString() || 'Never',
      deadTuples: Number(maintenance?.dead_tuples || 0),
    };
  } catch (error) {
    console.warn('Failed to get maintenance status:', error);
    return {
      lastVacuum: 'Unknown',
      lastAnalyze: 'Unknown',
      deadTuples: 0,
    };
  }
}

/**
 * POST endpoint to run database maintenance tasks
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    const { action } = await request.json();
    
    let result;
    
    switch (action) {
      case 'vacuum':
        result = await runVacuum();
        break;
      case 'analyze':
        result = await runAnalyze();
        break;
      case 'cleanup':
        result = await runCleanup();
        break;
      default:
        return NextResponse.json({
          success: false,
          error: 'Invalid action. Use: vacuum, analyze, or cleanup',
        }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      action,
      result,
      meta: {
        responseTime: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
    });

  } catch (error) {
    console.error('Database maintenance failed:', error);

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

async function runVacuum() {
  return await withDatabase(async (db: PrismaClient) => {
    await db.$executeRaw`VACUUM ANALYZE webhook_events`;
    await db.$executeRaw`VACUUM ANALYZE transactions`;
    await db.$executeRaw`VACUUM ANALYZE system_metrics`;
    
    return 'VACUUM completed for main tables';
  });
}

async function runAnalyze() {
  return await withDatabase(async (db: PrismaClient) => {
    await db.$executeRaw`ANALYZE webhook_events`;
    await db.$executeRaw`ANALYZE transactions`;
    await db.$executeRaw`ANALYZE system_metrics`;
    
    return 'ANALYZE completed for main tables';
  });
}

async function runCleanup() {
  return await withDatabase(async (db: PrismaClient) => {
    // Clean up webhook events older than 90 days
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    
    const deletedEvents = await db.webhookEvent.deleteMany({
      where: {
        timestamp: {
          lt: cutoffDate,
        },
      },
    });

    // Clean up system metrics older than 30 days
    const metricsDate = new Date();
    metricsDate.setDate(metricsDate.getDate() - 30);
    
    const deletedMetrics = await db.systemMetrics.deleteMany({
      where: {
        timestamp: {
          lt: metricsDate,
        },
      },
    });

    return `Deleted ${deletedEvents.count} old events and ${deletedMetrics.count} old metrics`;
  });
}