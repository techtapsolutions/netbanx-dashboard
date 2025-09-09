#!/usr/bin/env node

/**
 * Advanced Database Performance Analysis Tool
 * 
 * Analyzes database queries, identifies bottlenecks, and provides optimization recommendations
 * Run with: npx tsx scripts/analyze-database-performance.ts
 */

import { PrismaClient } from '@prisma/client';
import { withDatabase } from '../src/lib/database';

interface QueryAnalysis {
  query: string;
  calls: number;
  totalTime: number;
  meanTime: number;
  minTime: number;
  maxTime: number;
  rows: number;
  percentTime: number;
}

interface IndexAnalysis {
  tableName: string;
  indexName: string;
  isUnique: boolean;
  columns: string[];
  size: string;
  scanCount: number;
  tuplesRead: number;
  tuplesReturned: number;
  efficiency: number;
}

interface TableAnalysis {
  tableName: string;
  rowCount: number;
  size: string;
  indexSize: string;
  totalSize: string;
  sequentialScans: number;
  indexScans: number;
  insertions: number;
  updates: number;
  deletions: number;
  deadTuples: number;
  hotUpdates: number;
  scanEfficiency: number;
}

interface N1QueryDetection {
  suspiciousQueries: Array<{
    query: string;
    frequency: number;
    avgTime: number;
    pattern: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    recommendation: string;
  }>;
}

class DatabasePerformanceAnalyzer {
  
  async runCompleteAnalysis(): Promise<void> {
    console.log('===========================================');
    console.log('🔍 DATABASE PERFORMANCE ANALYSIS');
    console.log('===========================================');
    console.log(`Started at: ${new Date().toISOString()}\n`);

    try {
      // 1. Analyze slow queries
      console.log('📊 1. SLOW QUERY ANALYSIS');
      console.log('----------------------------------------');
      await this.analyzeSlowQueries();

      // 2. Analyze table performance
      console.log('\n📋 2. TABLE PERFORMANCE ANALYSIS');
      console.log('----------------------------------------');
      await this.analyzeTablePerformance();

      // 3. Analyze indexes
      console.log('\n🗂️  3. INDEX ANALYSIS');
      console.log('----------------------------------------');
      await this.analyzeIndexUsage();

      // 4. Detect N+1 queries
      console.log('\n🔄 4. N+1 QUERY DETECTION');
      console.log('----------------------------------------');
      await this.detectN1Queries();

      // 5. Connection analysis
      console.log('\n🔗 5. CONNECTION ANALYSIS');
      console.log('----------------------------------------');
      await this.analyzeConnections();

      // 6. Cache performance
      console.log('\n💾 6. CACHE PERFORMANCE ANALYSIS');
      console.log('----------------------------------------');
      await this.analyzeCachePerformance();

      // 7. Generate recommendations
      console.log('\n💡 7. OPTIMIZATION RECOMMENDATIONS');
      console.log('----------------------------------------');
      await this.generateRecommendations();

    } catch (error) {
      console.error('❌ Analysis failed:', error);
    }
  }

  private async analyzeSlowQueries(): Promise<void> {
    await withDatabase(async (db) => {
      try {
        // Enable pg_stat_statements if available
        const statStatementsAvailable = await this.checkPgStatStatements(db);
        
        if (statStatementsAvailable) {
          const slowQueries = await db.$queryRaw<QueryAnalysis[]>`
            SELECT 
              query,
              calls,
              total_exec_time as total_time,
              mean_exec_time as mean_time,
              min_exec_time as min_time,
              max_exec_time as max_time,
              rows,
              100.0 * total_exec_time / sum(total_exec_time) over() as percent_time
            FROM pg_stat_statements
            WHERE calls > 5 AND mean_exec_time > 10
            ORDER BY mean_exec_time DESC
            LIMIT 20
          `;

          console.log(`Found ${slowQueries.length} slow queries:`);
          slowQueries.forEach((query, i) => {
            console.log(`\n${i + 1}. Query: ${this.truncateQuery(query.query)}`);
            console.log(`   Calls: ${query.calls}`);
            console.log(`   Mean Time: ${query.meanTime.toFixed(2)}ms`);
            console.log(`   Total Time: ${query.totalTime.toFixed(2)}ms`);
            console.log(`   % of Total Time: ${query.percentTime.toFixed(2)}%`);
          });
        } else {
          // Fallback to pg_stat_activity for current queries
          const activeQueries = await db.$queryRaw<Array<{
            query: string;
            state: string;
            duration: number;
          }>>`
            SELECT 
              query,
              state,
              EXTRACT(EPOCH FROM (clock_timestamp() - query_start)) * 1000 as duration
            FROM pg_stat_activity
            WHERE datname = current_database() 
              AND state IS NOT NULL 
              AND query != '<IDLE>'
              AND query NOT LIKE '%pg_stat_activity%'
            ORDER BY duration DESC
          `;

          console.log(`Current active queries: ${activeQueries.length}`);
          activeQueries.slice(0, 10).forEach((query, i) => {
            console.log(`\n${i + 1}. ${this.truncateQuery(query.query)}`);
            console.log(`   State: ${query.state}`);
            console.log(`   Duration: ${query.duration.toFixed(2)}ms`);
          });
        }
      } catch (error) {
        console.error('Error analyzing slow queries:', error);
      }
    });
  }

  private async analyzeTablePerformance(): Promise<void> {
    await withDatabase(async (db) => {
      try {
        const tables = await db.$queryRaw<TableAnalysis[]>`
          SELECT 
            schemaname || '.' || relname as table_name,
            n_tup_ins + n_tup_upd as row_count,
            pg_size_pretty(pg_relation_size(schemaname||'.'||relname)) as size,
            pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname) - pg_relation_size(schemaname||'.'||relname)) as index_size,
            pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname)) as total_size,
            seq_scan as sequential_scans,
            idx_scan as index_scans,
            n_tup_ins as insertions,
            n_tup_upd as updates,
            n_tup_del as deletions,
            n_dead_tup as dead_tuples,
            n_tup_hot_upd as hot_updates,
            CASE 
              WHEN seq_scan + idx_scan > 0 
              THEN round(100.0 * idx_scan / (seq_scan + idx_scan), 2)
              ELSE 0 
            END as scan_efficiency
          FROM pg_stat_user_tables
          WHERE relname IN ('webhook_events', 'transactions', 'system_metrics', 'accounts', 'companies', 'users')
          ORDER BY pg_total_relation_size(schemaname||'.'||relname) DESC
        `;

        console.log('Table Performance Analysis:');
        console.log('----------------------------');

        tables.forEach(table => {
          console.log(`\n📊 ${table.tableName}`);
          console.log(`   Size: ${table.totalSize} (Data: ${table.size}, Indexes: ${table.indexSize})`);
          console.log(`   Rows: ${table.rowCount.toLocaleString()}`);
          console.log(`   Scans: ${table.sequentialScans} seq, ${table.indexScans} idx (${table.scanEfficiency}% indexed)`);
          console.log(`   Activity: ${table.insertions} ins, ${table.updates} upd, ${table.deletions} del`);
          console.log(`   Dead Tuples: ${table.deadTuples} (${table.hotUpdates} hot updates)`);
          
          // Performance warnings
          if (table.scanEfficiency < 95 && table.sequentialScans > 1000) {
            console.log(`   ⚠️  HIGH sequential scans detected - consider adding indexes`);
          }
          if (table.deadTuples > table.rowCount * 0.1) {
            console.log(`   ⚠️  HIGH dead tuples - consider VACUUM`);
          }
        });
      } catch (error) {
        console.error('Error analyzing table performance:', error);
      }
    });
  }

  private async analyzeIndexUsage(): Promise<void> {
    await withDatabase(async (db) => {
      try {
        const indexes = await db.$queryRaw<IndexAnalysis[]>`
          SELECT 
            t.relname as table_name,
            i.relname as index_name,
            ix.indisunique as is_unique,
            array_to_string(array_agg(a.attname), ', ') as columns,
            pg_size_pretty(pg_relation_size(i.oid)) as size,
            COALESCE(s.idx_scan, 0) as scan_count,
            COALESCE(s.idx_tup_read, 0) as tuples_read,
            COALESCE(s.idx_tup_fetch, 0) as tuples_returned,
            CASE 
              WHEN s.idx_tup_read > 0 
              THEN round(100.0 * s.idx_tup_fetch / s.idx_tup_read, 2)
              ELSE 0 
            END as efficiency
          FROM pg_class t
          JOIN pg_index ix ON t.oid = ix.indrelid
          JOIN pg_class i ON i.oid = ix.indexrelid
          JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
          LEFT JOIN pg_stat_user_indexes s ON s.indexrelid = i.oid
          WHERE t.relname IN ('webhook_events', 'transactions', 'system_metrics', 'accounts', 'companies', 'users')
          GROUP BY t.relname, i.relname, ix.indisunique, i.oid, s.idx_scan, s.idx_tup_read, s.idx_tup_fetch
          ORDER BY scan_count DESC, table_name, index_name
        `;

        console.log('Index Usage Analysis:');
        console.log('---------------------');

        const indexesByTable = indexes.reduce((acc, index) => {
          if (!acc[index.tableName]) acc[index.tableName] = [];
          acc[index.tableName].push(index);
          return acc;
        }, {} as Record<string, IndexAnalysis[]>);

        Object.entries(indexesByTable).forEach(([tableName, tableIndexes]) => {
          console.log(`\n🗂️  ${tableName}:`);
          tableIndexes.forEach(index => {
            console.log(`   ${index.indexName} (${index.columns})`);
            console.log(`     Scans: ${index.scanCount.toLocaleString()}, Size: ${index.size}`);
            console.log(`     Efficiency: ${index.efficiency}%, Unique: ${index.isUnique}`);
            
            // Index warnings
            if (index.scanCount === 0 && !index.indexName.includes('pkey')) {
              console.log(`     ⚠️  UNUSED INDEX - consider dropping`);
            }
            if (index.efficiency < 50 && index.scanCount > 100) {
              console.log(`     ⚠️  LOW EFFICIENCY - index may need optimization`);
            }
          });
        });
      } catch (error) {
        console.error('Error analyzing index usage:', error);
      }
    });
  }

  private async detectN1Queries(): Promise<void> {
    await withDatabase(async (db) => {
      try {
        const statStatementsAvailable = await this.checkPgStatStatements(db);
        
        if (statStatementsAvailable) {
          // Look for queries that are called very frequently (potential N+1)
          const suspiciousQueries = await db.$queryRaw<Array<{
            query: string;
            calls: number;
            mean_time: number;
          }>>`
            SELECT 
              query,
              calls,
              mean_exec_time as mean_time
            FROM pg_stat_statements
            WHERE calls > 100
              AND query LIKE '%WHERE%'
              AND (query LIKE '%SELECT%' OR query LIKE '%UPDATE%' OR query LIKE '%DELETE%')
            ORDER BY calls DESC
            LIMIT 15
          `;

          console.log('Suspicious Query Patterns (Potential N+1):');
          console.log('------------------------------------------');

          suspiciousQueries.forEach((query, i) => {
            const pattern = this.identifyQueryPattern(query.query);
            const severity = this.assessN1Severity(query.calls, query.mean_time);
            
            console.log(`\n${i + 1}. ${this.truncateQuery(query.query)}`);
            console.log(`   Calls: ${query.calls.toLocaleString()}`);
            console.log(`   Mean Time: ${query.mean_time.toFixed(2)}ms`);
            console.log(`   Pattern: ${pattern}`);
            console.log(`   Severity: ${severity}`);
            console.log(`   Recommendation: ${this.getN1Recommendation(pattern, severity)}`);
          });
        } else {
          console.log('pg_stat_statements not available - cannot detect N+1 queries');
          console.log('Manual N+1 detection suggestions:');
          console.log('- Check for loops calling database queries');
          console.log('- Look for repeated single-row SELECT statements');
          console.log('- Review Prisma queries without proper includes');
        }
      } catch (error) {
        console.error('Error detecting N+1 queries:', error);
      }
    });
  }

  private async analyzeConnections(): Promise<void> {
    await withDatabase(async (db) => {
      try {
        const connectionStats = await db.$queryRaw<Array<{
          total_connections: number;
          active_connections: number;
          idle_connections: number;
          max_connections: number;
          longest_running_query: number;
          avg_connection_age: number;
        }>>`
          SELECT 
            COUNT(*) as total_connections,
            COUNT(*) FILTER (WHERE state = 'active') as active_connections,
            COUNT(*) FILTER (WHERE state = 'idle') as idle_connections,
            (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections,
            COALESCE(MAX(EXTRACT(EPOCH FROM (clock_timestamp() - query_start))), 0) as longest_running_query,
            COALESCE(AVG(EXTRACT(EPOCH FROM (clock_timestamp() - backend_start))), 0) as avg_connection_age
          FROM pg_stat_activity
          WHERE datname = current_database()
        `;

        const stats = connectionStats[0];
        
        console.log('Connection Analysis:');
        console.log('-------------------');
        console.log(`Total Connections: ${stats.total_connections}`);
        console.log(`Active Connections: ${stats.active_connections}`);
        console.log(`Idle Connections: ${stats.idle_connections}`);
        console.log(`Max Connections: ${stats.max_connections}`);
        console.log(`Connection Utilization: ${((stats.total_connections / stats.max_connections) * 100).toFixed(1)}%`);
        console.log(`Longest Running Query: ${stats.longest_running_query.toFixed(2)}s`);
        console.log(`Avg Connection Age: ${(stats.avg_connection_age / 60).toFixed(1)} minutes`);

        // Connection warnings
        if ((stats.total_connections / stats.max_connections) > 0.8) {
          console.log('⚠️  HIGH connection utilization - consider connection pooling optimization');
        }
        if (stats.longest_running_query > 30) {
          console.log('⚠️  LONG-RUNNING query detected - check for lock contention');
        }
        if (stats.avg_connection_age > 3600) { // 1 hour
          console.log('⚠️  OLD connections detected - review connection lifecycle');
        }
      } catch (error) {
        console.error('Error analyzing connections:', error);
      }
    });
  }

  private async analyzeCachePerformance(): Promise<void> {
    await withDatabase(async (db) => {
      try {
        const cacheStats = await db.$queryRaw<Array<{
          buffer_cache_hit_ratio: number;
          index_cache_hit_ratio: number;
          shared_buffers_used: number;
          total_buffers: number;
        }>>`
          SELECT 
            round(100.0 * sum(heap_blks_hit) / nullif(sum(heap_blks_hit + heap_blks_read), 0), 2) as buffer_cache_hit_ratio,
            round(100.0 * sum(idx_blks_hit) / nullif(sum(idx_blks_hit + idx_blks_read), 0), 2) as index_cache_hit_ratio,
            (SELECT count(*) FROM pg_buffercache WHERE reldatabase = (SELECT oid FROM pg_database WHERE datname = current_database())) as shared_buffers_used,
            (SELECT setting::int FROM pg_settings WHERE name = 'shared_buffers') / 8192 as total_buffers
          FROM pg_statio_user_tables
        `;

        const stats = cacheStats[0];
        
        console.log('Cache Performance Analysis:');
        console.log('---------------------------');
        console.log(`Buffer Cache Hit Ratio: ${stats.buffer_cache_hit_ratio || 0}%`);
        console.log(`Index Cache Hit Ratio: ${stats.index_cache_hit_ratio || 0}%`);
        
        if (stats.shared_buffers_used && stats.total_buffers) {
          console.log(`Shared Buffers Used: ${stats.shared_buffers_used}/${stats.total_buffers} (${((stats.shared_buffers_used / stats.total_buffers) * 100).toFixed(1)}%)`);
        }

        // Cache performance warnings
        if ((stats.buffer_cache_hit_ratio || 0) < 95) {
          console.log('⚠️  LOW buffer cache hit ratio - consider increasing shared_buffers');
        }
        if ((stats.index_cache_hit_ratio || 0) < 99) {
          console.log('⚠️  LOW index cache hit ratio - consider increasing effective_cache_size');
        }
      } catch (error) {
        console.error('Error analyzing cache performance:', error);
      }
    });
  }

  private async generateRecommendations(): Promise<void> {
    console.log('Database Optimization Recommendations:');
    console.log('======================================');

    console.log('\n🚀 IMMEDIATE ACTIONS:');
    console.log('1. Run ANALYZE on all tables to update query planner statistics');
    console.log('2. Review and remove unused indexes identified above');
    console.log('3. Consider VACUUM on tables with high dead tuple counts');

    console.log('\n⚡ QUERY OPTIMIZATIONS:');
    console.log('1. Add proper SELECT field lists instead of SELECT *');
    console.log('2. Use Prisma includes/select for related data loading');
    console.log('3. Implement batching for high-frequency queries');
    console.log('4. Add missing indexes for frequently filtered columns');

    console.log('\n🔧 CONNECTION POOL TUNING:');
    console.log('1. Optimize connection pool size for serverless environment');
    console.log('2. Implement connection pooling with transaction-level pooling');
    console.log('3. Add connection timeout and retry configurations');

    console.log('\n💾 CACHING STRATEGY:');
    console.log('1. Implement intelligent Redis caching for expensive queries');
    console.log('2. Add cache warming for frequently accessed data');
    console.log('3. Optimize cache TTL based on data update patterns');

    console.log('\n📊 MONITORING:');
    console.log('1. Enable pg_stat_statements for detailed query analysis');
    console.log('2. Set up automated performance monitoring and alerting');
    console.log('3. Implement query execution time tracking');
  }

  // Helper methods
  private async checkPgStatStatements(db: PrismaClient): Promise<boolean> {
    try {
      await db.$queryRaw`SELECT * FROM pg_stat_statements LIMIT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private truncateQuery(query: string): string {
    return query.replace(/\s+/g, ' ').trim().substring(0, 100) + (query.length > 100 ? '...' : '');
  }

  private identifyQueryPattern(query: string): string {
    const upperQuery = query.toUpperCase();
    
    if (upperQuery.includes('WHERE') && upperQuery.includes('=') && !upperQuery.includes('JOIN')) {
      return 'Single record lookup';
    }
    if (upperQuery.includes('ORDER BY') && upperQuery.includes('LIMIT')) {
      return 'Paginated query';
    }
    if (upperQuery.includes('GROUP BY') || upperQuery.includes('COUNT(')) {
      return 'Aggregation query';
    }
    if (upperQuery.includes('UPDATE') && upperQuery.includes('WHERE')) {
      return 'Single record update';
    }
    
    return 'Complex query';
  }

  private assessN1Severity(calls: number, meanTime: number): 'HIGH' | 'MEDIUM' | 'LOW' {
    if (calls > 1000 && meanTime > 10) return 'HIGH';
    if (calls > 500 || meanTime > 20) return 'MEDIUM';
    return 'LOW';
  }

  private getN1Recommendation(pattern: string, severity: string): string {
    if (pattern === 'Single record lookup' && severity === 'HIGH') {
      return 'Use Prisma include/select to fetch related data in single query';
    }
    if (pattern === 'Single record update') {
      return 'Consider batching updates or using bulk operations';
    }
    return 'Review query pattern and consider optimization';
  }
}

// Run analysis
const analyzer = new DatabasePerformanceAnalyzer();
analyzer.runCompleteAnalysis().catch(console.error);