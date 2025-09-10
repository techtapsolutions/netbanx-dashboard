import { NextRequest, NextResponse } from 'next/server';
import { withDatabase } from '@/lib/database';
import { redis } from '@/lib/database';

export async function GET(request: NextRequest) {
  console.log('=== SIMPLE DEBUG DIAGNOSTIC ===');
  
  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    checks: {},
    errors: [],
    recommendations: [],
    rootCause: null
  };

  try {
    // 1. Check Database for existing data
    console.log('1. Checking database for existing data...');
    try {
      const dbCheck = await withDatabase(async (db) => {
        const [webhookCount, txCount, recentWebhooks, recentTx] = await Promise.all([
          db.webhookEvent.count(),
          db.transaction.count(),
          db.webhookEvent.findMany({
            take: 5,
            orderBy: { timestamp: 'desc' },
            select: {
              id: true,
              timestamp: true,
              eventType: true,
              processed: true,
              error: true,
              source: true
            }
          }),
          db.transaction.findMany({
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              externalId: true,
              amount: true,
              status: true,
              createdAt: true,
              merchantRefNum: true
            }
          })
        ]);
        
        return { webhookCount, txCount, recentWebhooks, recentTx };
      });
      
      diagnostics.checks.database = {
        status: 'connected',
        webhooksInDb: dbCheck.webhookCount,
        transactionsInDb: dbCheck.txCount,
        recentWebhooks: dbCheck.recentWebhooks,
        recentTransactions: dbCheck.recentTx,
        healthy: true
      };
      
      if (dbCheck.webhookCount === 0) {
        diagnostics.errors.push('NO_WEBHOOKS_IN_DB');
        diagnostics.recommendations.push('No webhooks found in database - webhooks are not being persisted');
      }
      
      if (dbCheck.txCount === 0 && dbCheck.webhookCount > 0) {
        diagnostics.errors.push('NO_TRANSACTIONS_CONVERTED');
        diagnostics.recommendations.push('Webhooks exist but no transactions - payment conversion not working');
      }
      
    } catch (error) {
      diagnostics.checks.database = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        healthy: false
      };
      diagnostics.errors.push('DATABASE_CONNECTION_FAILED');
    }

    // 2. Check Redis Cache
    console.log('2. Checking Redis cache...');
    try {
      const [webhookKeys, apiKeys, recentCache] = await Promise.all([
        redis.keys('webhook_events:*'),
        redis.keys('api:data:*'),
        redis.get('webhook_events:recent')
      ]);
      
      diagnostics.checks.cache = {
        status: 'connected',
        webhookCacheKeys: webhookKeys.length,
        apiCacheKeys: apiKeys.length,
        recentEventsCached: recentCache ? JSON.parse(recentCache).length : 0,
        healthy: true
      };
      
      if (webhookKeys.length === 0 && diagnostics.checks.database?.webhooksInDb > 0) {
        diagnostics.recommendations.push('Database has data but cache is empty - cache invalidation might be too aggressive');
      }
      
    } catch (error) {
      diagnostics.checks.cache = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        healthy: false
      };
      diagnostics.errors.push('REDIS_CONNECTION_FAILED');
    }

    // 3. Check Bull Queue (via Redis keys)
    console.log('3. Checking Bull queue status via Redis...');
    try {
      const bullKeys = await redis.keys('bull:webhook processing:*');
      const queueInfo: any = {
        totalKeys: bullKeys.length,
        keyTypes: {}
      };
      
      // Count different types of Bull keys
      for (const key of bullKeys) {
        if (key.includes(':completed')) queueInfo.keyTypes.completed = (queueInfo.keyTypes.completed || 0) + 1;
        else if (key.includes(':failed')) queueInfo.keyTypes.failed = (queueInfo.keyTypes.failed || 0) + 1;
        else if (key.includes(':waiting')) queueInfo.keyTypes.waiting = (queueInfo.keyTypes.waiting || 0) + 1;
        else if (key.includes(':active')) queueInfo.keyTypes.active = (queueInfo.keyTypes.active || 0) + 1;
        else if (key.includes(':stalled')) queueInfo.keyTypes.stalled = (queueInfo.keyTypes.stalled || 0) + 1;
      }
      
      // Check for job IDs
      const jobIds = await redis.zrange('bull:webhook processing:completed', 0, -1);
      const failedJobIds = await redis.zrange('bull:webhook processing:failed', 0, -1);
      
      diagnostics.checks.bullQueue = {
        status: 'checked',
        bullKeysFound: bullKeys.length,
        keyTypes: queueInfo.keyTypes,
        completedJobs: jobIds.length,
        failedJobs: failedJobIds.length,
        sampleKeys: bullKeys.slice(0, 5)
      };
      
      if (bullKeys.length === 0) {
        diagnostics.errors.push('BULL_QUEUE_NOT_INITIALIZED');
        diagnostics.recommendations.push('CRITICAL: Bull queue is not initialized - webhook processing is completely broken!');
      }
      
      if (failedJobIds.length > 0) {
        diagnostics.errors.push('FAILED_WEBHOOK_JOBS');
        diagnostics.recommendations.push(`Found ${failedJobIds.length} failed webhook jobs - check logs for errors`);
      }
      
    } catch (error) {
      diagnostics.checks.bullQueue = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // 4. Test Data API endpoints
    console.log('4. Testing data API endpoints...');
    try {
      const baseUrl = request.url.replace('/api/debug-simple', '');
      
      const [txResponse, whResponse] = await Promise.all([
        fetch(`${baseUrl}/api/data?type=transactions&limit=10`).catch(e => null),
        fetch(`${baseUrl}/api/data?type=webhooks&limit=10`).catch(e => null)
      ]);
      
      diagnostics.checks.dataApi = {
        transactions: {
          status: txResponse?.status || 'failed',
          hasData: false
        },
        webhooks: {
          status: whResponse?.status || 'failed',
          hasData: false
        }
      };
      
      if (txResponse && txResponse.ok) {
        const txData = await txResponse.json();
        diagnostics.checks.dataApi.transactions.hasData = txData.transactions?.length > 0;
        diagnostics.checks.dataApi.transactions.count = txData.transactions?.length || 0;
      }
      
      if (whResponse && whResponse.ok) {
        const whData = await whResponse.json();
        diagnostics.checks.dataApi.webhooks.hasData = whData.webhooks?.length > 0;
        diagnostics.checks.dataApi.webhooks.count = whData.webhooks?.length || 0;
      }
      
    } catch (error) {
      diagnostics.checks.dataApi = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // 5. Check for batch processing evidence
    console.log('5. Checking for batch processing evidence...');
    try {
      // Look for signs that batch processing is working
      const batchKeys = await redis.keys('webhook_dedup:*');
      
      diagnostics.checks.batchProcessing = {
        dedupKeysFound: batchKeys.length,
        sampleDedupKeys: batchKeys.slice(0, 3)
      };
      
      if (batchKeys.length === 0) {
        diagnostics.recommendations.push('No deduplication keys found - webhook processing might not be running');
      }
      
    } catch (error) {
      diagnostics.checks.batchProcessing = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Root Cause Analysis
    const bullNotWorking = diagnostics.checks.bullQueue?.bullKeysFound === 0;
    const noWebhooksInDb = diagnostics.checks.database?.webhooksInDb === 0;
    const noTransactionsInDb = diagnostics.checks.database?.transactionsInDb === 0;
    
    if (bullNotWorking) {
      diagnostics.rootCause = {
        issue: 'BULL_QUEUE_NOT_WORKING',
        severity: 'CRITICAL',
        explanation: 'Bull.js queue processor is not running. This is likely due to Turbopack incompatibility with Bull\'s process forking.',
        impact: 'Webhooks are being accepted but never processed or stored in the database.',
        solution: 'Switch from Turbopack to Webpack (remove --turbopack flag) or implement a different queue processing solution.'
      };
    } else if (noWebhooksInDb) {
      diagnostics.rootCause = {
        issue: 'NO_DATA_PERSISTENCE',
        severity: 'CRITICAL',
        explanation: 'Webhooks are not being saved to the database despite queue processing.',
        impact: 'Dashboard shows no data because nothing is stored.',
        solution: 'Check batch processing logic in webhook-store-persistent.ts'
      };
    } else if (noTransactionsInDb && !noWebhooksInDb) {
      diagnostics.rootCause = {
        issue: 'TRANSACTION_CONVERSION_FAILURE',
        severity: 'HIGH',
        explanation: 'Webhooks are saved but not converting to transactions.',
        impact: 'Payment data not available in dashboard.',
        solution: 'Check isPaymentEvent() and convertToTransaction() methods'
      };
    } else {
      diagnostics.rootCause = {
        issue: 'UNKNOWN',
        severity: 'MEDIUM',
        explanation: 'Data exists but may not be displaying correctly.',
        impact: 'Dashboard might have caching or display issues.',
        solution: 'Clear caches and check frontend data fetching'
      };
    }

    // Summary
    diagnostics.summary = {
      totalErrors: diagnostics.errors.length,
      criticalIssues: diagnostics.errors.filter(e => 
        e.includes('BULL_QUEUE') || e.includes('NO_WEBHOOKS')
      ),
      healthy: diagnostics.errors.length === 0
    };

    return NextResponse.json(diagnostics, { 
      status: diagnostics.summary.healthy ? 200 : 500,
      headers: {
        'Content-Type': 'application/json'
      }
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Diagnostic failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      diagnostics
    }, { status: 500 });
  }
}