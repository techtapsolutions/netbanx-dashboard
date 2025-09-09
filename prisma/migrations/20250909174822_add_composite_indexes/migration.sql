-- Add composite indexes for webhook_events table to optimize high-frequency queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_webhook_events_time_type_processed" ON "webhook_events" ("timestamp" DESC, "eventType", "processed");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_webhook_events_company_time" ON "webhook_events" ("companyId", "timestamp" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_webhook_events_processed_time" ON "webhook_events" ("processed", "timestamp" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_webhook_events_type_time" ON "webhook_events" ("eventType", "timestamp" DESC);

-- Drop old single-column indexes that are now covered by composite indexes
DROP INDEX IF EXISTS "webhook_events_timestamp_idx";
DROP INDEX IF EXISTS "webhook_events_eventType_idx";
DROP INDEX IF EXISTS "webhook_events_processed_idx";

-- Recreate optimized single-column indexes with explicit names
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_webhook_events_timestamp" ON "webhook_events" ("timestamp" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_webhook_events_source" ON "webhook_events" ("source");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_webhook_events_company" ON "webhook_events" ("companyId");

-- Add composite indexes for transactions table to optimize transaction queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_transactions_status_time_company" ON "transactions" ("status", "transactionTime" DESC, "companyId");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_transactions_company_time" ON "transactions" ("companyId", "transactionTime" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_transactions_time_status" ON "transactions" ("transactionTime" DESC, "status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_transactions_status_method_currency" ON "transactions" ("status", "paymentMethod", "currency");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_transactions_merchant_company" ON "transactions" ("merchantRefNum", "companyId");

-- Drop old single-column transaction indexes
DROP INDEX IF EXISTS "transactions_status_idx";
DROP INDEX IF EXISTS "transactions_transactionType_idx";
DROP INDEX IF EXISTS "transactions_paymentMethod_idx";
DROP INDEX IF EXISTS "transactions_currency_idx";
DROP INDEX IF EXISTS "transactions_createdAt_idx";
DROP INDEX IF EXISTS "transactions_transactionTime_idx";
DROP INDEX IF EXISTS "transactions_merchantRefNum_idx";
DROP INDEX IF EXISTS "transactions_companyId_idx";

-- Recreate optimized single-column indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_transactions_status" ON "transactions" ("status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_transactions_type" ON "transactions" ("transactionType");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_transactions_merchant_ref" ON "transactions" ("merchantRefNum");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_transactions_company" ON "transactions" ("companyId");

-- Add composite indexes for sessions table to optimize session management
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sessions_user_expires" ON "sessions" ("userId", "expiresAt" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sessions_expires_user" ON "sessions" ("expiresAt" ASC, "userId");

-- Drop old session indexes
DROP INDEX IF EXISTS "sessions_token_idx";
DROP INDEX IF EXISTS "sessions_userId_idx";
DROP INDEX IF EXISTS "sessions_expiresAt_idx";

-- Recreate optimized single-column session indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sessions_token" ON "sessions" ("token");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sessions_user" ON "sessions" ("userId");

-- Optimize alert indexes for better alert management queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_alerts_resolved_timestamp" ON "alerts" ("resolved", "timestamp" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_alerts_type_timestamp" ON "alerts" ("type", "timestamp" DESC);

-- Drop old alert indexes
DROP INDEX IF EXISTS "alerts_timestamp_idx";
DROP INDEX IF EXISTS "alerts_type_idx";
DROP INDEX IF EXISTS "alerts_resolved_idx";

-- Recreate optimized single-column alert indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_alerts_timestamp" ON "alerts" ("timestamp" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_alerts_type" ON "alerts" ("type");

-- Rename system metrics index for consistency
DROP INDEX IF EXISTS "system_metrics_timestamp_idx";
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_system_metrics_timestamp" ON "system_metrics" ("timestamp" DESC);

-- Performance optimization: Add partial indexes for frequently filtered data
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_webhook_events_unprocessed" ON "webhook_events" ("timestamp" DESC) WHERE "processed" = false;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_webhook_events_errors" ON "webhook_events" ("timestamp" DESC) WHERE "error" IS NOT NULL;
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_transactions_active" ON "transactions" ("transactionTime" DESC) WHERE "status" IN ('PENDING', 'COMPLETED');
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_sessions_active" ON "sessions" ("userId") WHERE "expiresAt" > NOW();
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_alerts_unresolved" ON "alerts" ("timestamp" DESC) WHERE "resolved" = false;

-- Add index for JSON path queries on webhook payload
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_webhook_events_payload_event_id" ON "webhook_events" USING GIN ((payload->'eventData'->>'id'));
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_webhook_events_payload_merchant_ref" ON "webhook_events" USING GIN ((payload->'eventData'->>'merchantRefNum'));

-- Performance statistics update
ANALYZE "webhook_events";
ANALYZE "transactions";
ANALYZE "sessions";
ANALYZE "alerts";
ANALYZE "system_metrics";