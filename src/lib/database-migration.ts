import { withDatabase } from '@/lib/database';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

/**
 * Database Migration Helper for NetBanx Webhook Dashboard
 * 
 * This utility applies performance optimizations, indexes, and 
 * maintenance functions to the database for high-volume webhook processing.
 */

interface MigrationResult {
  success: boolean;
  operation: string;
  message: string;
  duration: number;
  error?: string;
}

export class DatabaseMigrator {
  private static migrationHistory: Map<string, Date> = new Map();
  
  /**
   * Apply all database optimizations
   */
  static async applyOptimizations(): Promise<MigrationResult[]> {
    console.log('Starting database optimizations for NetBanx webhook processing...');
    
    const results: MigrationResult[] = [];
    
    // List of migrations to apply
    const migrations = [
      { name: 'performance_indexes', fn: this.createPerformanceIndexes },
      { name: 'constraints', fn: this.addConstraints },
      { name: 'maintenance_functions', fn: this.createMaintenanceFunctions },
      { name: 'monitoring_views', fn: this.createMonitoringViews },
      { name: 'initial_cleanup', fn: this.runInitialCleanup },
    ];

    for (const migration of migrations) {
      const startTime = Date.now();
      
      try {
        console.log(`Applying migration: ${migration.name}...`);
        
        await migration.fn();
        
        const duration = Date.now() - startTime;
        this.migrationHistory.set(migration.name, new Date());
        
        results.push({
          success: true,
          operation: migration.name,
          message: `Migration ${migration.name} completed successfully`,
          duration,
        });
        
        console.log(`✓ ${migration.name} completed in ${duration}ms`);
        
      } catch (error) {
        const duration = Date.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        
        results.push({
          success: false,
          operation: migration.name,
          message: `Migration ${migration.name} failed`,
          duration,
          error: errorMessage,
        });
        
        console.error(`✗ ${migration.name} failed:`, errorMessage);
        
        // Continue with other migrations even if one fails
      }
    }
    
    console.log('Database optimizations completed');
    return results;
  }

  /**
   * Create performance indexes for high-volume operations
   */
  private static async createPerformanceIndexes(): Promise<void> {
    await withDatabase(async (db: PrismaClient) => {
      const indexes = [
        // Composite indexes for common query patterns
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_events_timestamp_type 
         ON webhook_events (timestamp DESC, event_type) 
         WHERE processed = true`,
        
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_events_source_timestamp 
         ON webhook_events (source, timestamp DESC)
         WHERE error IS NULL`,
        
        // Partial indexes for error monitoring
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_events_errors 
         ON webhook_events (timestamp DESC, event_type, error) 
         WHERE error IS NOT NULL`,
        
        // Transaction optimization indexes
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_status_time 
         ON transactions (status, transaction_time DESC, amount)
         WHERE status IN ('COMPLETED', 'FAILED', 'PENDING', 'CANCELLED')`,
        
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_amount_currency 
         ON transactions (currency, amount DESC, transaction_time DESC)
         WHERE amount > 0`,
        
        // Payment method analytics indexes
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_method_status 
         ON transactions (payment_method, status, transaction_time DESC)`,
        
        // Merchant reference lookup optimization
        `CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_merchant_ref_time 
         ON transactions (merchant_ref_num, transaction_time DESC)`,
      ];

      for (const indexSql of indexes) {
        try {
          await db.$executeRawUnsafe(indexSql);
        } catch (error) {
          // Index might already exist, continue
          console.warn('Index creation warning:', error);
        }
      }
    });
  }

  /**
   * Add database constraints for data integrity
   */
  private static async addConstraints(): Promise<void> {
    await withDatabase(async (db: PrismaClient) => {
      const constraints = [
        // Webhook events timestamp validation
        `ALTER TABLE webhook_events 
         ADD CONSTRAINT IF NOT EXISTS chk_webhook_events_timestamp_not_future 
         CHECK (timestamp <= NOW() + INTERVAL '1 hour')`,
        
        // Transaction amount validation
        `ALTER TABLE transactions 
         ADD CONSTRAINT IF NOT EXISTS chk_transactions_amount_positive 
         CHECK (amount >= 0 AND amount <= 1000000)`,
        
        // Transaction time validation
        `ALTER TABLE transactions 
         ADD CONSTRAINT IF NOT EXISTS chk_transactions_time_reasonable 
         CHECK (transaction_time >= '2020-01-01' AND transaction_time <= NOW() + INTERVAL '1 day')`,
      ];

      for (const constraintSql of constraints) {
        try {
          await db.$executeRawUnsafe(constraintSql);
        } catch (error) {
          // Constraint might already exist, continue
          console.warn('Constraint creation warning:', error);
        }
      }
    });
  }

  /**
   * Create maintenance functions for automated cleanup
   */
  private static async createMaintenanceFunctions(): Promise<void> {
    await withDatabase(async (db: PrismaClient) => {
      // Create maintenance log table
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS maintenance_log (
          id SERIAL PRIMARY KEY,
          operation VARCHAR(100) NOT NULL,
          records_affected INTEGER NOT NULL DEFAULT 0,
          execution_time_ms INTEGER NOT NULL DEFAULT 0,
          error_message TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      await db.$executeRawUnsafe(`
        CREATE INDEX IF NOT EXISTS idx_maintenance_log_operation_created 
        ON maintenance_log (operation, created_at DESC)
      `);

      // Cleanup function for old webhook events
      await db.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION cleanup_old_webhook_events(days_to_keep INTEGER DEFAULT 90)
        RETURNS INTEGER AS $$
        DECLARE
          deleted_count INTEGER;
          cutoff_date TIMESTAMP;
        BEGIN
          cutoff_date := NOW() - (days_to_keep || ' days')::INTERVAL;
          
          DELETE FROM webhook_events 
          WHERE timestamp < cutoff_date 
          AND id IN (
            SELECT id FROM webhook_events 
            WHERE timestamp < cutoff_date 
            ORDER BY timestamp 
            LIMIT 10000
          );
          
          GET DIAGNOSTICS deleted_count = ROW_COUNT;
          
          RAISE NOTICE 'Cleaned up % old webhook events older than %', deleted_count, cutoff_date;
          RETURN deleted_count;
        END;
        $$ LANGUAGE plpgsql
      `);

      // Cleanup function for system metrics
      await db.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION cleanup_old_system_metrics(days_to_keep INTEGER DEFAULT 30)
        RETURNS INTEGER AS $$
        DECLARE
          deleted_count INTEGER;
          cutoff_date TIMESTAMP;
        BEGIN
          cutoff_date := NOW() - (days_to_keep || ' days')::INTERVAL;
          
          DELETE FROM system_metrics 
          WHERE timestamp < cutoff_date;
          
          GET DIAGNOSTICS deleted_count = ROW_COUNT;
          
          RAISE NOTICE 'Cleaned up % old system metrics older than %', deleted_count, cutoff_date;
          RETURN deleted_count;
        END;
        $$ LANGUAGE plpgsql
      `);

      // Main maintenance runner function
      await db.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION run_maintenance_tasks()
        RETURNS TABLE(operation TEXT, records_affected INTEGER, execution_time_ms INTEGER, success BOOLEAN) AS $$
        DECLARE
          start_time TIMESTAMP;
          end_time TIMESTAMP;
          duration_ms INTEGER;
          affected_records INTEGER;
          error_msg TEXT;
        BEGIN
          -- Clean up old webhook events
          BEGIN
            start_time := clock_timestamp();
            SELECT cleanup_old_webhook_events(90) INTO affected_records;
            end_time := clock_timestamp();
            duration_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
            
            INSERT INTO maintenance_log (operation, records_affected, execution_time_ms)
            VALUES ('cleanup_webhook_events', affected_records, duration_ms);
            
            RETURN QUERY SELECT 'cleanup_webhook_events'::TEXT, affected_records, duration_ms, true;
          EXCEPTION WHEN OTHERS THEN
            error_msg := SQLERRM;
            INSERT INTO maintenance_log (operation, records_affected, execution_time_ms, error_message)
            VALUES ('cleanup_webhook_events', 0, 0, error_msg);
            
            RETURN QUERY SELECT 'cleanup_webhook_events'::TEXT, 0, 0, false;
          END;
          
          -- Clean up old system metrics
          BEGIN
            start_time := clock_timestamp();
            SELECT cleanup_old_system_metrics(30) INTO affected_records;
            end_time := clock_timestamp();
            duration_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
            
            INSERT INTO maintenance_log (operation, records_affected, execution_time_ms)
            VALUES ('cleanup_system_metrics', affected_records, duration_ms);
            
            RETURN QUERY SELECT 'cleanup_system_metrics'::TEXT, affected_records, duration_ms, true;
          EXCEPTION WHEN OTHERS THEN
            error_msg := SQLERRM;
            INSERT INTO maintenance_log (operation, records_affected, execution_time_ms, error_message)
            VALUES ('cleanup_system_metrics', 0, 0, error_msg);
            
            RETURN QUERY SELECT 'cleanup_system_metrics'::TEXT, 0, 0, false;
          END;
          
          -- Update table statistics
          BEGIN
            start_time := clock_timestamp();
            ANALYZE webhook_events;
            ANALYZE transactions;
            ANALYZE system_metrics;
            end_time := clock_timestamp();
            duration_ms := EXTRACT(EPOCH FROM (end_time - start_time)) * 1000;
            
            INSERT INTO maintenance_log (operation, records_affected, execution_time_ms)
            VALUES ('analyze_tables', 3, duration_ms);
            
            RETURN QUERY SELECT 'analyze_tables'::TEXT, 3, duration_ms, true;
          EXCEPTION WHEN OTHERS THEN
            error_msg := SQLERRM;
            INSERT INTO maintenance_log (operation, records_affected, execution_time_ms, error_message)
            VALUES ('analyze_tables', 0, 0, error_msg);
            
            RETURN QUERY SELECT 'analyze_tables'::TEXT, 0, 0, false;
          END;
          
          RETURN;
        END;
        $$ LANGUAGE plpgsql
      `);
    });
  }

  /**
   * Create monitoring views for performance tracking
   */
  private static async createMonitoringViews(): Promise<void> {
    await withDatabase(async (db: PrismaClient) => {
      // Webhook performance metrics view
      await db.$executeRawUnsafe(`
        CREATE OR REPLACE VIEW webhook_performance_metrics AS
        SELECT 
          DATE_TRUNC('hour', timestamp) as hour,
          source,
          COUNT(*) as total_webhooks,
          COUNT(*) FILTER (WHERE processed = true AND error IS NULL) as successful_webhooks,
          COUNT(*) FILTER (WHERE error IS NOT NULL) as failed_webhooks,
          AVG(CASE 
            WHEN processed = true AND error IS NULL 
            THEN EXTRACT(EPOCH FROM (updated_at - timestamp)) * 1000 
          END) as avg_processing_time_ms,
          COUNT(DISTINCT event_type) as unique_event_types
        FROM webhook_events 
        WHERE timestamp >= NOW() - INTERVAL '7 days'
        GROUP BY DATE_TRUNC('hour', timestamp), source
        ORDER BY hour DESC, source
      `);

      // Transaction analytics view
      await db.$executeRawUnsafe(`
        CREATE OR REPLACE VIEW transaction_analytics AS
        SELECT 
          DATE_TRUNC('day', transaction_time) as day,
          status,
          currency,
          payment_method,
          COUNT(*) as transaction_count,
          SUM(amount) as total_amount,
          AVG(amount) as average_amount,
          MIN(amount) as min_amount,
          MAX(amount) as max_amount,
          PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY amount) as median_amount
        FROM transactions 
        WHERE transaction_time >= NOW() - INTERVAL '30 days'
        GROUP BY DATE_TRUNC('day', transaction_time), status, currency, payment_method
        ORDER BY day DESC, status, currency, payment_method
      `);

      // System health summary view
      await db.$executeRawUnsafe(`
        CREATE OR REPLACE VIEW system_health_summary AS
        SELECT 
          'webhook_events' as table_name,
          COUNT(*) as total_records,
          COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '1 hour') as last_hour,
          COUNT(*) FILTER (WHERE timestamp >= NOW() - INTERVAL '24 hours') as last_24_hours,
          COUNT(*) FILTER (WHERE error IS NOT NULL AND timestamp >= NOW() - INTERVAL '1 hour') as errors_last_hour,
          MAX(timestamp) as latest_record
        FROM webhook_events
        UNION ALL
        SELECT 
          'transactions' as table_name,
          COUNT(*) as total_records,
          COUNT(*) FILTER (WHERE transaction_time >= NOW() - INTERVAL '1 hour') as last_hour,
          COUNT(*) FILTER (WHERE transaction_time >= NOW() - INTERVAL '24 hours') as last_24_hours,
          COUNT(*) FILTER (WHERE status = 'FAILED' AND transaction_time >= NOW() - INTERVAL '1 hour') as errors_last_hour,
          MAX(transaction_time) as latest_record
        FROM transactions
      `);
    });
  }

  /**
   * Run initial cleanup to optimize existing data
   */
  private static async runInitialCleanup(): Promise<void> {
    await withDatabase(async (db: PrismaClient) => {
      // Update table statistics for optimal query planning
      await db.$executeRaw`ANALYZE webhook_events`;
      await db.$executeRaw`ANALYZE transactions`;
      await db.$executeRaw`ANALYZE system_metrics`;
      
      // Run initial vacuum if tables have significant dead tuples
      try {
        await db.$executeRaw`VACUUM (ANALYZE, VERBOSE) webhook_events`;
        await db.$executeRaw`VACUUM (ANALYZE, VERBOSE) transactions`;
      } catch (error) {
        console.warn('VACUUM warning (may be running in transaction):', error);
      }
    });
  }

  /**
   * Check if migrations have been applied
   */
  static async checkMigrationStatus(): Promise<{
    applied: string[];
    pending: string[];
    lastRun: Date | null;
  }> {
    try {
      const applied: string[] = [];
      const pending = ['performance_indexes', 'constraints', 'maintenance_functions', 'monitoring_views'];
      
      await withDatabase(async (db: PrismaClient) => {
        // Check if maintenance_log table exists
        const tableExists = await db.$queryRaw<Array<{ exists: boolean }>>`
          SELECT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = 'maintenance_log'
          ) as exists
        `;

        if (tableExists[0]?.exists) {
          applied.push('maintenance_functions');
          
          // Check for recent maintenance runs
          const recentRuns = await db.$queryRaw<Array<{ created_at: Date }>>`
            SELECT created_at FROM maintenance_log 
            ORDER BY created_at DESC LIMIT 1
          `;
          
          return {
            applied,
            pending: pending.filter(p => !applied.includes(p)),
            lastRun: recentRuns[0]?.created_at || null,
          };
        }
      });

      return {
        applied,
        pending: pending.filter(p => !applied.includes(p)),
        lastRun: null,
      };
    } catch (error) {
      console.error('Failed to check migration status:', error);
      return {
        applied: [],
        pending: ['performance_indexes', 'constraints', 'maintenance_functions', 'monitoring_views'],
        lastRun: null,
      };
    }
  }

  /**
   * Run database maintenance tasks manually
   */
  static async runMaintenance(): Promise<Array<{
    operation: string;
    records_affected: number;
    execution_time_ms: number;
    success: boolean;
  }>> {
    return await withDatabase(async (db: PrismaClient) => {
      const results = await db.$queryRaw<Array<{
        operation: string;
        records_affected: number;
        execution_time_ms: number;
        success: boolean;
      }>>`SELECT * FROM run_maintenance_tasks()`;
      
      return results;
    });
  }

  /**
   * Get maintenance history
   */
  static async getMaintenanceHistory(limit: number = 50): Promise<Array<{
    id: number;
    operation: string;
    records_affected: number;
    execution_time_ms: number;
    error_message: string | null;
    created_at: Date;
  }>> {
    return await withDatabase(async (db: PrismaClient) => {
      return await db.$queryRaw`
        SELECT * FROM maintenance_log 
        ORDER BY created_at DESC 
        LIMIT ${limit}
      `;
    });
  }
}