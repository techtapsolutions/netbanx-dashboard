-- Database Optimizations for NetBanx Webhook Dashboard
-- High-Performance Transaction Log Persistence
--
-- This file contains performance optimizations, additional indexes, 
-- and retention policies for handling high-volume webhook processing.

-- =============================================================================
-- PERFORMANCE INDEXES FOR HIGH-VOLUME OPERATIONS
-- =============================================================================

-- Composite indexes for common query patterns in webhook processing
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_events_timestamp_type 
ON webhook_events (timestamp DESC, event_type) 
WHERE processed = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_events_source_timestamp 
ON webhook_events (source, timestamp DESC)
WHERE error IS NULL;

-- Partial indexes for error monitoring and debugging
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_events_errors 
ON webhook_events (timestamp DESC, event_type, error) 
WHERE error IS NOT NULL;

-- Transaction query optimization indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_status_time 
ON transactions (status, transaction_time DESC, amount)
WHERE status IN ('COMPLETED', 'FAILED', 'PENDING', 'CANCELLED');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_amount_currency 
ON transactions (currency, amount DESC, transaction_time DESC)
WHERE amount > 0;

-- Payment method analytics indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_method_status 
ON transactions (payment_method, status, transaction_time DESC);

-- Merchant reference lookup optimization
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_transactions_merchant_ref_time 
ON transactions (merchant_ref_num, transaction_time DESC);

-- =============================================================================
-- PERFORMANCE CONSTRAINTS AND CHECKS
-- =============================================================================

-- Ensure webhook events have valid timestamps
ALTER TABLE webhook_events 
ADD CONSTRAINT IF NOT EXISTS chk_webhook_events_timestamp_not_future 
CHECK (timestamp <= NOW() + INTERVAL '1 hour');

-- Ensure transaction amounts are reasonable
ALTER TABLE transactions 
ADD CONSTRAINT IF NOT EXISTS chk_transactions_amount_positive 
CHECK (amount >= 0 AND amount <= 1000000);

-- Ensure transaction times are reasonable
ALTER TABLE transactions 
ADD CONSTRAINT IF NOT EXISTS chk_transactions_time_reasonable 
CHECK (transaction_time >= '2020-01-01' AND transaction_time <= NOW() + INTERVAL '1 day');

-- =============================================================================
-- DATA RETENTION AND CLEANUP POLICIES
-- =============================================================================

-- Function to clean up old webhook events (keeps last 90 days by default)
CREATE OR REPLACE FUNCTION cleanup_old_webhook_events(days_to_keep INTEGER DEFAULT 90)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
    cutoff_date TIMESTAMP;
BEGIN
    cutoff_date := NOW() - (days_to_keep || ' days')::INTERVAL;
    
    -- Delete old webhook events in batches to avoid blocking
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
$$ LANGUAGE plpgsql;

-- Function to clean up old system metrics
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
$$ LANGUAGE plpgsql;

-- Function to archive old successful transactions (optional - keeps failed/pending)
CREATE OR REPLACE FUNCTION archive_old_completed_transactions(days_to_keep INTEGER DEFAULT 180)
RETURNS INTEGER AS $$
DECLARE
    archived_count INTEGER;
    cutoff_date TIMESTAMP;
BEGIN
    cutoff_date := NOW() - (days_to_keep || ' days')::INTERVAL;
    
    -- Create archive table if it doesn't exist
    CREATE TABLE IF NOT EXISTS transactions_archive (LIKE transactions INCLUDING ALL);
    
    -- Move old completed transactions to archive
    WITH moved_transactions AS (
        DELETE FROM transactions 
        WHERE status = 'COMPLETED' 
        AND transaction_time < cutoff_date
        AND id IN (
            SELECT id FROM transactions 
            WHERE status = 'COMPLETED' 
            AND transaction_time < cutoff_date
            ORDER BY transaction_time 
            LIMIT 5000
        )
        RETURNING *
    )
    INSERT INTO transactions_archive SELECT * FROM moved_transactions;
    
    GET DIAGNOSTICS archived_count = ROW_COUNT;
    
    RAISE NOTICE 'Archived % completed transactions older than %', archived_count, cutoff_date;
    RETURN archived_count;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- AUTOMATED MAINTENANCE JOBS
-- =============================================================================

-- Create a maintenance log table
CREATE TABLE IF NOT EXISTS maintenance_log (
    id SERIAL PRIMARY KEY,
    operation VARCHAR(100) NOT NULL,
    records_affected INTEGER NOT NULL DEFAULT 0,
    execution_time_ms INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_log_operation_created 
ON maintenance_log (operation, created_at DESC);

-- Function to run all maintenance tasks
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
    
    -- Update table statistics for query optimization
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
$$ LANGUAGE plpgsql;

-- =============================================================================
-- PERFORMANCE MONITORING VIEWS
-- =============================================================================

-- View for webhook processing performance metrics
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
ORDER BY hour DESC, source;

-- View for transaction analytics
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
ORDER BY day DESC, status, currency, payment_method;

-- View for system health monitoring
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
FROM transactions;

-- =============================================================================
-- PERFORMANCE TUNING QUERIES
-- =============================================================================

-- Query to find slow queries (requires pg_stat_statements extension)
CREATE OR REPLACE VIEW slow_queries AS
SELECT 
    query,
    calls,
    total_time,
    mean_time,
    rows,
    100.0 * shared_blks_hit / nullif(shared_blks_hit + shared_blks_read, 0) AS hit_percent
FROM pg_stat_statements 
WHERE query LIKE '%webhook_events%' OR query LIKE '%transactions%'
ORDER BY total_time DESC
LIMIT 20;

-- Query to monitor index usage
CREATE OR REPLACE VIEW index_usage AS
SELECT 
    schemaname,
    tablename,
    indexname,
    idx_tup_read,
    idx_tup_fetch,
    idx_scan,
    CASE 
        WHEN idx_scan = 0 THEN 'Unused'
        WHEN idx_scan < 100 THEN 'Low Usage'
        ELSE 'Active'
    END as usage_status
FROM pg_stat_user_indexes 
WHERE tablename IN ('webhook_events', 'transactions', 'system_metrics')
ORDER BY idx_scan DESC;

-- =============================================================================
-- BACKUP AND RECOVERY HELPERS
-- =============================================================================

-- Function to create a backup of critical webhook data
CREATE OR REPLACE FUNCTION backup_webhook_data(backup_days INTEGER DEFAULT 7)
RETURNS TEXT AS $$
DECLARE
    backup_table_name TEXT;
    backup_count INTEGER;
    cutoff_date TIMESTAMP;
BEGIN
    cutoff_date := NOW() - (backup_days || ' days')::INTERVAL;
    backup_table_name := 'webhook_backup_' || TO_CHAR(NOW(), 'YYYY_MM_DD_HH24_MI_SS');
    
    -- Create backup table with recent webhook data
    EXECUTE format('CREATE TABLE %I AS 
                   SELECT * FROM webhook_events 
                   WHERE timestamp >= %L 
                   ORDER BY timestamp DESC', 
                   backup_table_name, cutoff_date);
    
    -- Get count of backed up records
    EXECUTE format('SELECT COUNT(*) FROM %I', backup_table_name) INTO backup_count;
    
    -- Log the backup
    INSERT INTO maintenance_log (operation, records_affected, execution_time_ms)
    VALUES ('backup_webhook_data', backup_count, 0);
    
    RETURN format('Created backup table %s with %s records', backup_table_name, backup_count);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- COMMENTS FOR DOCUMENTATION
-- =============================================================================

COMMENT ON FUNCTION cleanup_old_webhook_events(INTEGER) IS 'Removes webhook events older than specified days to prevent database bloat';
COMMENT ON FUNCTION cleanup_old_system_metrics(INTEGER) IS 'Removes system metrics older than specified days';
COMMENT ON FUNCTION run_maintenance_tasks() IS 'Runs all automated maintenance tasks and logs results';
COMMENT ON VIEW webhook_performance_metrics IS 'Hourly webhook processing performance metrics for monitoring';
COMMENT ON VIEW transaction_analytics IS 'Daily transaction analytics with amounts and payment methods';
COMMENT ON VIEW system_health_summary IS 'Overall system health metrics for monitoring dashboards';

-- =============================================================================
-- RECOMMENDED POSTGRESQL SETTINGS FOR HIGH-VOLUME WEBHOOK PROCESSING
-- =============================================================================

/*
For optimal performance with high-volume webhook processing, consider these PostgreSQL settings:

shared_buffers = 256MB                    # 25% of total RAM for dedicated DB servers
effective_cache_size = 1GB                # Estimate of OS disk cache
work_mem = 4MB                            # Memory for sort operations
maintenance_work_mem = 64MB               # Memory for VACUUM, CREATE INDEX, etc.
checkpoint_completion_target = 0.9       # Spread checkpoints over 90% of checkpoint interval
wal_buffers = 16MB                        # WAL buffer size
max_wal_size = 1GB                        # Maximum WAL size between checkpoints
min_wal_size = 80MB                       # Minimum WAL size
random_page_cost = 1.1                    # Lower for SSDs
effective_io_concurrency = 200            # Higher for SSDs

# Connection pooling (use external pooler like PgBouncer for better performance)
max_connections = 100                     # Keep relatively low, use connection pooling

# Logging for performance monitoring
log_min_duration_statement = 1000        # Log queries taking longer than 1 second
log_checkpoints = on                      # Log checkpoint activity
log_connections = on                      # Log connections for monitoring
log_disconnections = on                   # Log disconnections
log_lock_waits = on                       # Log lock waits

# Auto-vacuum tuning for high-volume inserts
autovacuum = on
autovacuum_max_workers = 3
autovacuum_naptime = 20s
autovacuum_vacuum_threshold = 100
autovacuum_analyze_threshold = 50
autovacuum_vacuum_scale_factor = 0.05
autovacuum_analyze_scale_factor = 0.02
*/