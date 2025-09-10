import { NextRequest, NextResponse } from 'next/server';
import { webhookStorePersistent } from '@/lib/webhook-store-persistent';
import { WebhookQueueManager, webhookQueue } from '@/lib/webhook-queue';
import { withDatabase } from '@/lib/database';
import { redis } from '@/lib/database';

export async function GET(request: NextRequest) {
  console.log('=== DEBUG DATA FLOW DIAGNOSTIC ===');
  
  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    checks: {},
    errors: [],
    recommendations: []
  };

  try {
    // 1. Check Queue Status
    console.log('1. Checking webhook queue status...');
    try {
      const queueStats = await WebhookQueueManager.getQueueStats();
      diagnostics.checks.queueStatus = {
        status: 'checked',
        data: queueStats,
        healthy: queueStats.failed === 0
      };
      
      if (queueStats.waiting > 0) {
        diagnostics.recommendations.push(`There are ${queueStats.waiting} webhooks waiting to be processed`);
      }
      if (queueStats.failed > 0) {
        diagnostics.recommendations.push(`WARNING: ${queueStats.failed} webhooks failed processing`);
      }
    } catch (error) {
      diagnostics.checks.queueStatus = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      diagnostics.errors.push('Queue status check failed');
    }

    // 2. Check Database Connection
    console.log('2. Checking database connection...');
    try {
      const dbTest = await withDatabase(async (db) => {
        const count = await db.webhookEvent.count();
        const txCount = await db.transaction.count();
        const recentWebhooks = await db.webhookEvent.findMany({
          take: 5,
          orderBy: { timestamp: 'desc' },
          select: {
            id: true,
            timestamp: true,
            eventType: true,
            processed: true,
            error: true
          }
        });
        const recentTransactions = await db.transaction.findMany({
          take: 5,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            externalId: true,
            amount: true,
            status: true,
            createdAt: true
          }
        });
        return { 
          webhookCount: count, 
          transactionCount: txCount,
          recentWebhooks,
          recentTransactions
        };
      });
      
      diagnostics.checks.database = {
        status: 'connected',
        webhooksInDb: dbTest.webhookCount,
        transactionsInDb: dbTest.transactionCount,
        recentWebhooks: dbTest.recentWebhooks,
        recentTransactions: dbTest.recentTransactions,
        healthy: true
      };
      
      if (dbTest.webhookCount === 0) {
        diagnostics.recommendations.push('No webhooks in database - webhooks might not be persisting');
      }
      if (dbTest.transactionCount === 0) {
        diagnostics.recommendations.push('No transactions in database - payment webhooks might not be converting');
      }
    } catch (error) {
      diagnostics.checks.database = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        healthy: false
      };
      diagnostics.errors.push('Database connection failed');
    }

    // 3. Check Redis Cache
    console.log('3. Checking Redis cache...');
    try {
      // Check for cached data
      const cacheKeys = await redis.keys('webhook_events:*');
      const apiCacheKeys = await redis.keys('api:data:*');
      
      diagnostics.checks.cache = {
        status: 'connected',
        webhookCacheKeys: cacheKeys.length,
        apiCacheKeys: apiCacheKeys.length,
        sampleKeys: [...cacheKeys.slice(0, 3), ...apiCacheKeys.slice(0, 3)],
        healthy: true
      };
      
      // Check if recent events are cached
      const recentEventsCache = await redis.get('webhook_events:recent');
      if (recentEventsCache) {
        const events = JSON.parse(recentEventsCache);
        diagnostics.checks.cache.recentEventsCached = events.length;
      } else {
        diagnostics.checks.cache.recentEventsCached = 0;
        diagnostics.recommendations.push('No recent events in cache - cache might not be updating');
      }
    } catch (error) {
      diagnostics.checks.cache = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
        healthy: false
      };
      diagnostics.errors.push('Redis cache check failed');
    }

    // 4. Check Batch Processing Status
    console.log('4. Checking batch processing...');
    try {
      // Access the internal queues via reflection (for debugging)
      const storeInfo = {
        // We can't directly access private properties, but we can test the flow
        testEvent: webhookStorePersistent.generateMockWebhook('TEST_EVENT')
      };
      
      // Add a test event to see if it processes
      await webhookStorePersistent.addWebhookEvent(storeInfo.testEvent);
      
      diagnostics.checks.batchProcessing = {
        status: 'tested',
        testEventAdded: true,
        testEventId: storeInfo.testEvent.id,
        note: 'Added test event - check if it appears in database within 2 seconds'
      };
    } catch (error) {
      diagnostics.checks.batchProcessing = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      diagnostics.errors.push('Batch processing test failed');
    }

    // 5. Check Data API Response
    console.log('5. Testing data API endpoints...');
    try {
      const baseUrl = request.url.replace('/api/debug-data-flow', '');
      
      // Test transactions endpoint
      const txResponse = await fetch(`${baseUrl}/api/data?type=transactions&limit=10`);
      const txData = await txResponse.json();
      
      // Test webhooks endpoint
      const whResponse = await fetch(`${baseUrl}/api/data?type=webhooks&limit=10`);
      const whData = await whResponse.json();
      
      diagnostics.checks.dataApi = {
        status: 'tested',
        transactionsEndpoint: {
          status: txResponse.status,
          hasData: txData.transactions?.length > 0,
          count: txData.transactions?.length || 0,
          cached: txResponse.headers.get('X-Cache') === 'HIT'
        },
        webhooksEndpoint: {
          status: whResponse.status,
          hasData: whData.webhooks?.length > 0,
          count: whData.webhooks?.length || 0,
          cached: whResponse.headers.get('X-Cache') === 'HIT'
        }
      };
      
      if (!txData.transactions?.length) {
        diagnostics.recommendations.push('Data API returning empty transactions - check database queries');
      }
      if (!whData.webhooks?.length) {
        diagnostics.recommendations.push('Data API returning empty webhooks - check database queries');
      }
    } catch (error) {
      diagnostics.checks.dataApi = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
      diagnostics.errors.push('Data API test failed');
    }

    // 6. Force Process Batch (Debug Action)
    console.log('6. Forcing batch processing...');
    try {
      // Wait a moment to let any pending batches process
      await new Promise(resolve => setTimeout(resolve, 2100));
      
      // Check if test event was processed
      const testEventInDb = await withDatabase(async (db) => {
        return await db.webhookEvent.findFirst({
          where: { id: diagnostics.checks.batchProcessing?.testEventId },
          select: { id: true, processed: true, timestamp: true }
        });
      });
      
      diagnostics.checks.forcedBatchResult = {
        testEventProcessed: !!testEventInDb,
        testEventData: testEventInDb
      };
      
      if (!testEventInDb) {
        diagnostics.recommendations.push('CRITICAL: Test event not found in database after 2 seconds - batch processing might be broken');
      }
    } catch (error) {
      diagnostics.checks.forcedBatchResult = {
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }

    // Generate summary
    diagnostics.summary = {
      totalChecks: Object.keys(diagnostics.checks).length,
      errorsFound: diagnostics.errors.length,
      recommendationsCount: diagnostics.recommendations.length,
      criticalIssues: []
    };

    // Identify critical issues
    if (diagnostics.checks.database?.webhooksInDb === 0) {
      diagnostics.summary.criticalIssues.push('No webhooks in database');
    }
    if (diagnostics.checks.queueStatus?.data?.failed > 0) {
      diagnostics.summary.criticalIssues.push(`${diagnostics.checks.queueStatus.data.failed} failed webhook jobs`);
    }
    if (!diagnostics.checks.database?.healthy) {
      diagnostics.summary.criticalIssues.push('Database connection issue');
    }
    if (!diagnostics.checks.forcedBatchResult?.testEventProcessed) {
      diagnostics.summary.criticalIssues.push('Batch processing not working');
    }

    // Root cause analysis
    diagnostics.rootCauseAnalysis = analyzeRootCause(diagnostics);

    return NextResponse.json(diagnostics, { 
      status: diagnostics.summary.criticalIssues.length > 0 ? 500 : 200 
    });

  } catch (error) {
    return NextResponse.json({
      error: 'Diagnostic failed',
      message: error instanceof Error ? error.message : 'Unknown error',
      diagnostics
    }, { status: 500 });
  }
}

function analyzeRootCause(diagnostics: any): any {
  const analysis = {
    likelyIssue: 'Unknown',
    confidence: 0,
    explanation: '',
    suggestedFix: ''
  };

  // Analyze patterns
  const hasWebhooksInQueue = diagnostics.checks.queueStatus?.data?.waiting > 0 || 
                             diagnostics.checks.queueStatus?.data?.completed > 0;
  const hasWebhooksInDb = diagnostics.checks.database?.webhooksInDb > 0;
  const hasTransactionsInDb = diagnostics.checks.database?.transactionsInDb > 0;
  const batchProcessingWorks = diagnostics.checks.forcedBatchResult?.testEventProcessed;
  const hasFailedJobs = diagnostics.checks.queueStatus?.data?.failed > 0;

  if (!hasWebhooksInDb && !hasWebhooksInQueue) {
    analysis.likelyIssue = 'Webhooks not reaching the system';
    analysis.confidence = 90;
    analysis.explanation = 'No webhooks found in queue or database. Webhooks are returning 200 but data is not being received.';
    analysis.suggestedFix = 'Check webhook endpoint URL configuration in Netbanx and verify webhook signatures are valid.';
  } else if (hasWebhooksInQueue && !hasWebhooksInDb) {
    analysis.likelyIssue = 'Queue processing failure';
    analysis.confidence = 85;
    analysis.explanation = 'Webhooks are in queue but not reaching database. Queue processor might be failing.';
    analysis.suggestedFix = 'Check Bull queue processor logs and Redis connection. Restart queue workers.';
  } else if (!batchProcessingWorks) {
    analysis.likelyIssue = 'Batch processing broken';
    analysis.confidence = 95;
    analysis.explanation = 'Test event was not persisted to database. Batch processor is not running or failing.';
    analysis.suggestedFix = 'Check batch processor initialization and database write permissions.';
  } else if (hasFailedJobs) {
    analysis.likelyIssue = 'Webhook validation failures';
    analysis.confidence = 80;
    analysis.explanation = `${hasFailedJobs} webhook jobs failed processing, likely due to signature validation.`;
    analysis.suggestedFix = 'Check webhook secret configuration and signature validation logic.';
  } else if (hasWebhooksInDb && !hasTransactionsInDb) {
    analysis.likelyIssue = 'Transaction conversion failure';
    analysis.confidence = 75;
    analysis.explanation = 'Webhooks are stored but not converting to transactions. Payment event detection might be broken.';
    analysis.suggestedFix = 'Check isPaymentEvent() and convertToTransaction() methods in webhook store.';
  } else if (hasWebhooksInDb && hasTransactionsInDb) {
    analysis.likelyIssue = 'Dashboard display issue';
    analysis.confidence = 70;
    analysis.explanation = 'Data exists in database but not showing in dashboard. Could be a caching or frontend issue.';
    analysis.suggestedFix = 'Clear Redis cache, check data API responses, and verify frontend is fetching from correct endpoints.';
  }

  return analysis;
}