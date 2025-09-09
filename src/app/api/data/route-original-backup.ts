import { NextRequest, NextResponse } from 'next/server';
import { Transaction } from '@/types/paysafe';
import { WebhookEvent } from '@/types/webhook';
import { redis, withDatabase } from '@/lib/database';
import { DatabasePerformanceMonitor } from '@/lib/database-performance-monitor';

// OPTIMIZED cache configuration for production performance
const CACHE_TTL = {
  transactions: 120,   // 2 minutes (increased for stability)
  webhooks: 60,        // 1 minute (increased for stability) 
  stats: 180,          // 3 minutes (increased for stability)
};

const QUERY_TIMEOUT = 6000; // 6 seconds (slight increase for complex queries)

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    console.log('📊 Data API called');
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'transactions';
    const companyId = searchParams.get('companyId');
    console.log('📋 Data type requested:', type);
    
    // Generate cache key
    const cacheKey = `api:data:${type}:${companyId || 'all'}`;
    
    // Try cache first for faster response
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        console.log(`✅ Cache hit for ${type}`);
        const duration = Date.now() - startTime;
        await DatabasePerformanceMonitor.recordQuery(`cache_hit_${type}`, duration, true);
        
        return NextResponse.json(JSON.parse(cached), {
          headers: {
            'X-Cache': 'HIT',
            'X-Response-Time': `${duration}ms`,
            'Cache-Control': `private, max-age=${CACHE_TTL[type as keyof typeof CACHE_TTL] || 60}`,
          }
        });
      }
    } catch (cacheError) {
      console.warn('Cache read failed:', cacheError);
    }
    
    switch (type) {
      case 'transactions':
        try {
          console.log('💳 Fetching transactions from database...');
          
          // HIGHLY OPTIMIZED database query with minimal data transfer
          const result = await withDatabase(async (db) => {
            const where = companyId ? { companyId } : {};
            
            // Execute queries in parallel with optimized limits
            const [transactions, statusCounts] = await Promise.all([
              // Get transactions with minimal fields and recent data only
              db.transaction.findMany({
                where,
                orderBy: { transactionTime: 'desc' },
                take: 500, // Reduced from 1000 for faster response
                select: {
                  externalId: true,
                  merchantRefNum: true,
                  amount: true,
                  currency: true,
                  status: true,
                  transactionType: true,
                  paymentMethod: true,
                  description: true,
                  createdAt: true,
                  updatedAt: true,
                  // Removed unnecessary fields
                }
              }),
              
              // Optimized aggregation with better indexing
              db.transaction.groupBy({
                by: ['status'],
                where,
                _count: { id: true },
                _sum: { amount: true },
              })
            ]);
            
            return { transactions, statusCounts };
          }, { 
            timeout: QUERY_TIMEOUT, 
            operationName: 'get_transactions_optimized',
            retries: 1 // Fast failure for better UX
          });
          
          // Process status counts for summary
          const summary = {
            totalTransactions: 0,
            totalAmount: 0,
            successfulTransactions: 0,
            failedTransactions: 0,
            pendingTransactions: 0,
            currency: 'USD',
            period: 'Real-time data (last 1000)',
          };
          
          result.statusCounts.forEach(stat => {
            summary.totalTransactions += stat._count.id;
            summary.totalAmount += stat._sum.amount || 0;
            
            switch (stat.status) {
              case 'COMPLETED':
                summary.successfulTransactions = stat._count.id;
                break;
              case 'FAILED':
                summary.failedTransactions = stat._count.id;
                break;
              case 'PENDING':
                summary.pendingTransactions = stat._count.id;
                break;
            }
          });
          
          // Transform transactions to expected format
          const transactions: Transaction[] = result.transactions.map(t => ({
            id: t.externalId,
            merchantRefNum: t.merchantRefNum,
            amount: t.amount,
            currency: t.currency,
            status: t.status as any,
            transactionType: t.transactionType,
            paymentMethod: t.paymentMethod,
            createdAt: t.createdAt.toISOString(),
            updatedAt: t.updatedAt.toISOString(),
            description: t.description || undefined,
          }));
          
          console.log('✅ Transactions fetched:', transactions.length);
          
          const response = {
            success: true,
            transactions,
            summary,
          };
          
          // Cache the successful response
          await redis.setex(cacheKey, CACHE_TTL.transactions, JSON.stringify(response)).catch(err => 
            console.warn('Cache write failed:', err)
          );
          
          const totalDuration = Date.now() - startTime;
          await DatabasePerformanceMonitor.recordQuery('api_data_transactions', totalDuration, true);
          
          return NextResponse.json(response, {
            headers: {
              'X-Cache': 'MISS',
              'X-Response-Time': `${totalDuration}ms`,
              'Cache-Control': `private, max-age=${CACHE_TTL.transactions}`,
            }
          });
        } catch (dbError) {
          console.warn('⚠️ Database error, returning empty transactions:', dbError);
          // Fallback to empty data if database fails
          const emptyTransactions: Transaction[] = [];
          const emptySummary = {
            totalTransactions: 0,
            totalAmount: 0,
            successfulTransactions: 0,
            failedTransactions: 0,
            pendingTransactions: 0,
            currency: 'USD',
            period: 'No data available (database initializing)',
          };
          
          return NextResponse.json({
            success: true,
            transactions: emptyTransactions,
            summary: emptySummary,
            warning: 'Database is initializing, showing empty data',
          });
        }
        
      case 'webhooks':
        try {
          console.log('🔄 Fetching webhooks from database...');
          const limit = parseInt(searchParams.get('limit') || '50');
          
          // HIGHLY OPTIMIZED webhook query with minimal data transfer
          const result = await withDatabase(async (db) => {
            const where = companyId ? { companyId } : {};
            
            // Execute queries in parallel with reduced limits
            const [events, totalCount, processedCount, failedCount, lastProcessed] = await Promise.all([
              // Get webhook events with minimal fields and smaller limit
              db.webhookEvent.findMany({
                where,
                orderBy: { timestamp: 'desc' },
                take: Math.min(limit, 50), // Reduced from 100 for better performance
                select: {
                  id: true,
                  timestamp: true,
                  eventType: true,
                  source: true,
                  processed: true,
                  error: true,
                  // Removed payload to reduce data transfer
                }
              }),
              
              // Get aggregated counts in parallel
              db.webhookEvent.count({ where }),
              db.webhookEvent.count({ where: { ...where, processed: true } }),
              db.webhookEvent.count({ where: { ...where, error: { not: null } } }),
              db.webhookEvent.findFirst({
                where: { ...where, processed: true },
                orderBy: { timestamp: 'desc' },
                select: { timestamp: true }
              })
            ]);
            
            return { events, totalCount, processedCount, failedCount, lastProcessed };
          }, { 
            timeout: QUERY_TIMEOUT, 
            operationName: 'get_webhooks_optimized',
            retries: 1
          });
          
          // Transform events (optimized without payload for performance)
          const events: WebhookEvent[] = result.events.map(event => ({
            id: event.id,
            timestamp: event.timestamp.toISOString(),
            eventType: event.eventType,
            source: event.source,
            payload: {}, // Empty payload for performance
            processed: event.processed,
            error: event.error || undefined,
          }));
          
          const stats = {
            totalReceived: result.totalCount,
            totalProcessed: result.processedCount,
            totalFailed: result.failedCount,
            avgProcessingTime: 0, // Would need separate calculation
            lastProcessed: result.lastProcessed?.timestamp.toISOString() || null,
          };
          
          console.log('✅ Webhooks fetched:', events.length);
          
          const response = {
            success: true,
            events,
            stats,
          };
          
          // Cache the successful response
          await redis.setex(cacheKey, CACHE_TTL.webhooks, JSON.stringify(response)).catch(err => 
            console.warn('Cache write failed:', err)
          );
          
          const totalDuration = Date.now() - startTime;
          await DatabasePerformanceMonitor.recordQuery('api_data_webhooks', totalDuration, true);
          
          return NextResponse.json(response, {
            headers: {
              'X-Cache': 'MISS',
              'X-Response-Time': `${totalDuration}ms`,
              'Cache-Control': `private, max-age=${CACHE_TTL.webhooks}`,
            }
          });
        } catch (dbError) {
          console.warn('⚠️ Database error, returning empty webhooks:', dbError);
          // Fallback to empty data if database fails
          return NextResponse.json({
            success: true,
            events: [],
            stats: {
              totalReceived: 0,
              totalProcessed: 0,
              totalFailed: 0,
              avgProcessingTime: 0,
              lastProcessed: null,
            },
            warning: 'Database is initializing, showing empty data',
          });
        }
        
      case 'stats':
        try {
          console.log('📈 Fetching stats from database...');
          
          // Optimized stats with parallel aggregation queries
          const result = await withDatabase(async (db) => {
            const where = companyId ? { companyId } : {};
            const webhookWhere = companyId ? { companyId } : {};
            
            // Run all aggregations in parallel for maximum performance
            const [
              transactionStats,
              webhookProcessedCount,
              webhookFailedCount,
              totalWebhooks,
              lastProcessedWebhook
            ] = await Promise.all([
              // Transaction statistics
              db.transaction.groupBy({
                by: ['status'],
                where,
                _count: { id: true },
                _sum: { amount: true },
              }),
              
              // Webhook statistics (split for performance)
              db.webhookEvent.count({ where: { ...webhookWhere, processed: true } }),
              db.webhookEvent.count({ where: { ...webhookWhere, error: { not: null } } }),
              db.webhookEvent.count({ where: webhookWhere }),
              db.webhookEvent.findFirst({
                where: { ...webhookWhere, processed: true },
                orderBy: { timestamp: 'desc' },
                select: { timestamp: true }
              })
            ]);
            
            // Process transaction stats
            let totalTransactions = 0;
            let totalAmount = 0;
            const transactionsByStatus: Record<string, number> = {};
            
            transactionStats.forEach(stat => {
              totalTransactions += stat._count.id;
              totalAmount += stat._sum.amount || 0;
              transactionsByStatus[stat.status] = stat._count.id;
            });
            
            return {
              transactions: {
                total: totalTransactions,
                completed: transactionsByStatus['COMPLETED'] || 0,
                failed: transactionsByStatus['FAILED'] || 0,
                pending: transactionsByStatus['PENDING'] || 0,
                totalAmount,
              },
              webhooks: {
                totalReceived: totalWebhooks,
                totalProcessed: webhookProcessedCount,
                totalFailed: webhookFailedCount,
                lastProcessed: lastProcessedWebhook?.timestamp.toISOString() || null,
              }
            };
          }, { 
            timeout: QUERY_TIMEOUT, 
            operationName: 'get_stats_optimized',
            retries: 1
          });
          
          const response = {
            success: true,
            stats: {
              ...result.webhooks,
              transactions: result.transactions,
              generatedAt: new Date().toISOString(),
            }
          };
          
          // Cache the successful response
          await redis.setex(cacheKey, CACHE_TTL.stats, JSON.stringify(response)).catch(err => 
            console.warn('Cache write failed:', err)
          );
          
          const totalDuration = Date.now() - startTime;
          await DatabasePerformanceMonitor.recordQuery('api_data_stats', totalDuration, true);
          
          return NextResponse.json(response, {
            headers: {
              'X-Cache': 'MISS',
              'X-Response-Time': `${totalDuration}ms`,
              'Cache-Control': `private, max-age=${CACHE_TTL.stats}`,
            }
          });
        } catch (dbError) {
          console.warn('⚠️ Database error, returning empty stats:', dbError);
          return NextResponse.json({
            success: true,
            stats: {
              totalReceived: 0,
              totalProcessed: 0,
              totalFailed: 0,
              avgProcessingTime: 0,
              lastProcessed: null,
            },
            warning: 'Database is initializing, showing empty data',
          });
        }
        
      default:
        return NextResponse.json(
          { error: 'Invalid data type. Use: transactions, webhooks, or stats' },
          { status: 400 }
        );
    }
    
  } catch (error) {
    console.error('❌ Critical error in data API:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json(
      { 
        error: 'Failed to fetch data', 
        details: errorMessage,
        success: false 
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    // Clear all caches first
    const cachePatterns = [
      'api:data:*',
      'webhooks:*',
      'transactions:*',
      'analytics:*',
      'webhook_events:*'
    ];
    
    for (const pattern of cachePatterns) {
      const keys = await redis.keys(pattern);
      if (keys.length > 0 && keys.length < 1000) { // Safety limit
        await redis.del(...keys);
      }
    }
    
    // Clear database data
    await withDatabase(async (db) => {
      await db.$transaction([
        db.webhookEvent.deleteMany(),
        db.transaction.deleteMany(),
      ]);
    }, { timeout: 10000, operationName: 'clear_all_data' });
    
    return NextResponse.json({
      success: true,
      message: 'All data and caches cleared',
    });
    
  } catch (error) {
    console.error('Error clearing data:', error);
    return NextResponse.json(
      { error: 'Failed to clear data' },
      { status: 500 }
    );
  }
}