#!/usr/bin/env node
/**
 * Webhook Performance Testing Script
 * Tests webhook processing speed and event data display
 */

import { WebhookQueueManager } from '../lib/webhook-queue';
import { webhookStorePersistent } from '../lib/webhook-store-persistent';
import { v4 as uuidv4 } from 'uuid';

// Performance metrics
interface PerformanceMetrics {
  webhookAcceptTime: number;
  queueProcessingTime: number;
  databasePersistTime: number;
  eventDataRetrievalTime: number;
  payloadIntegrity: boolean;
  totalEndToEndTime: number;
}

async function generateTestWebhook() {
  return {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    eventType: 'PAYMENT_COMPLETED',
    source: 'netbanx',
    processed: false,
    payload: {
      id: `test_${Date.now()}`,
      eventType: 'PAYMENT_COMPLETED',
      eventData: {
        id: `pay_${Date.now()}`,
        merchantRefNum: `TEST_${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        amount: Math.floor(Math.random() * 10000) / 100,
        currencyCode: 'USD',
        status: 'COMPLETED',
        txnTime: new Date().toISOString(),
        card: {
          type: 'VISA',
          lastDigits: '4242',
          holderName: 'Test User',
        },
        // Rich payload data to test display
        metadata: {
          orderId: `order_${Date.now()}`,
          customerId: `cust_${Date.now()}`,
          description: 'Performance test transaction',
          tags: ['test', 'performance', 'webhook'],
        },
      },
    },
  };
}

async function testWebhookPerformance(): Promise<PerformanceMetrics> {
  console.log('🚀 Starting webhook performance test...\n');
  
  const metrics: PerformanceMetrics = {
    webhookAcceptTime: 0,
    queueProcessingTime: 0,
    databasePersistTime: 0,
    eventDataRetrievalTime: 0,
    payloadIntegrity: false,
    totalEndToEndTime: 0,
  };
  
  const startTime = Date.now();
  
  try {
    // Step 1: Generate test webhook
    const testWebhook = await generateTestWebhook();
    const rawBody = JSON.stringify(testWebhook.payload);
    console.log(`✅ Generated test webhook: ${testWebhook.id}`);
    console.log(`   Payload size: ${rawBody.length} bytes`);
    
    // Step 2: Add to queue (simulating webhook reception)
    const queueStartTime = Date.now();
    const jobId = await WebhookQueueManager.addWebhookJob(
      testWebhook,
      rawBody,
      'test-signature',
      { 'x-test': 'performance' }
    );
    metrics.webhookAcceptTime = Date.now() - queueStartTime;
    console.log(`✅ Added to queue in ${metrics.webhookAcceptTime}ms (Job ID: ${jobId})`);
    
    // Step 3: Wait for processing
    console.log('⏳ Waiting for queue processing...');
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second for processing
    
    // Step 4: Check queue stats
    const queueStats = await WebhookQueueManager.getQueueStats();
    console.log(`📊 Queue stats:`, queueStats);
    
    // Step 5: Retrieve webhook events to verify payload
    const retrievalStartTime = Date.now();
    const events = await webhookStorePersistent.getWebhookEvents(10);
    metrics.eventDataRetrievalTime = Date.now() - retrievalStartTime;
    
    // Step 6: Verify payload integrity
    const retrievedEvent = events.find(e => e.id === testWebhook.id);
    if (retrievedEvent) {
      console.log(`✅ Event retrieved in ${metrics.eventDataRetrievalTime}ms`);
      
      // Check if payload is not empty
      const hasPayload = retrievedEvent.payload && Object.keys(retrievedEvent.payload).length > 0;
      metrics.payloadIntegrity = hasPayload;
      
      if (hasPayload) {
        console.log(`✅ Payload integrity: PASSED (${Object.keys(retrievedEvent.payload).length} keys)`);
        console.log(`   Sample payload keys:`, Object.keys(retrievedEvent.payload).slice(0, 5));
      } else {
        console.log(`❌ Payload integrity: FAILED (payload is empty)`);
      }
    } else {
      console.log(`⚠️  Event not found in database yet`);
    }
    
    // Calculate total time
    metrics.totalEndToEndTime = Date.now() - startTime;
    
    // Step 7: Test bulk processing
    console.log('\n📈 Testing bulk webhook processing...');
    const bulkStartTime = Date.now();
    const bulkPromises = [];
    
    for (let i = 0; i < 10; i++) {
      const webhook = await generateTestWebhook();
      bulkPromises.push(
        WebhookQueueManager.addWebhookJob(
          webhook,
          JSON.stringify(webhook.payload),
          `sig-${i}`,
          {}
        )
      );
    }
    
    await Promise.all(bulkPromises);
    const bulkTime = Date.now() - bulkStartTime;
    console.log(`✅ Added 10 webhooks to queue in ${bulkTime}ms (${(bulkTime / 10).toFixed(1)}ms avg)`);
    
    // Wait for bulk processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Check final queue stats
    const finalStats = await WebhookQueueManager.getQueueStats();
    console.log(`📊 Final queue stats:`, finalStats);
    
  } catch (error) {
    console.error('❌ Performance test failed:', error);
  }
  
  return metrics;
}

async function runPerformanceBenchmark() {
  console.log('='.repeat(50));
  console.log('WEBHOOK PERFORMANCE BENCHMARK');
  console.log('='.repeat(50));
  
  const results: PerformanceMetrics[] = [];
  const iterations = 3;
  
  for (let i = 0; i < iterations; i++) {
    console.log(`\n🔄 Iteration ${i + 1}/${iterations}`);
    console.log('-'.repeat(30));
    const metrics = await testWebhookPerformance();
    results.push(metrics);
    
    if (i < iterations - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait between iterations
    }
  }
  
  // Calculate averages
  console.log('\n' + '='.repeat(50));
  console.log('PERFORMANCE SUMMARY');
  console.log('='.repeat(50));
  
  const avgMetrics = {
    webhookAcceptTime: results.reduce((sum, r) => sum + r.webhookAcceptTime, 0) / iterations,
    queueProcessingTime: results.reduce((sum, r) => sum + r.queueProcessingTime, 0) / iterations,
    eventDataRetrievalTime: results.reduce((sum, r) => sum + r.eventDataRetrievalTime, 0) / iterations,
    totalEndToEndTime: results.reduce((sum, r) => sum + r.totalEndToEndTime, 0) / iterations,
    payloadIntegrityRate: (results.filter(r => r.payloadIntegrity).length / iterations) * 100,
  };
  
  console.log(`\n📊 Average Metrics (${iterations} iterations):`);
  console.log(`   • Webhook Accept Time: ${avgMetrics.webhookAcceptTime.toFixed(2)}ms`);
  console.log(`   • Event Retrieval Time: ${avgMetrics.eventDataRetrievalTime.toFixed(2)}ms`);
  console.log(`   • Total End-to-End Time: ${avgMetrics.totalEndToEndTime.toFixed(2)}ms`);
  console.log(`   • Payload Integrity Rate: ${avgMetrics.payloadIntegrityRate.toFixed(0)}%`);
  
  // Performance targets
  console.log(`\n🎯 Performance Targets:`);
  console.log(`   • Webhook Accept: ${avgMetrics.webhookAcceptTime < 50 ? '✅' : '❌'} < 50ms (actual: ${avgMetrics.webhookAcceptTime.toFixed(2)}ms)`);
  console.log(`   • Event Retrieval: ${avgMetrics.eventDataRetrievalTime < 100 ? '✅' : '❌'} < 100ms (actual: ${avgMetrics.eventDataRetrievalTime.toFixed(2)}ms)`);
  console.log(`   • End-to-End: ${avgMetrics.totalEndToEndTime < 2000 ? '✅' : '❌'} < 2000ms (actual: ${avgMetrics.totalEndToEndTime.toFixed(2)}ms)`);
  console.log(`   • Payload Integrity: ${avgMetrics.payloadIntegrityRate === 100 ? '✅' : '❌'} 100% (actual: ${avgMetrics.payloadIntegrityRate.toFixed(0)}%)`);
  
  // Exit with appropriate code
  const allTargetsMet = 
    avgMetrics.webhookAcceptTime < 50 &&
    avgMetrics.eventDataRetrievalTime < 100 &&
    avgMetrics.totalEndToEndTime < 2000 &&
    avgMetrics.payloadIntegrityRate === 100;
  
  if (allTargetsMet) {
    console.log('\n✅ All performance targets met!');
    process.exit(0);
  } else {
    console.log('\n⚠️  Some performance targets not met. Review optimizations.');
    process.exit(1);
  }
}

// Run the benchmark
if (require.main === module) {
  runPerformanceBenchmark().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { testWebhookPerformance, runPerformanceBenchmark };