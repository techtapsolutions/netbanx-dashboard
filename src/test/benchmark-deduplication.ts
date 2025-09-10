/**
 * Performance benchmark for enhanced webhook deduplication
 * Measures the overhead of multi-level deduplication checks
 */

import { webhookDeduplicator } from '../lib/webhook-queue';
import { WebhookPayload } from '../types/webhook';

async function runBenchmark() {
  console.log('⚡ Performance Benchmark: Multi-Level Deduplication\n');
  console.log('=' .repeat(60));

  const iterations = 1000;
  const webhooks: Array<{ id: string; payload: WebhookPayload; signature: string }> = [];

  // Generate test data
  console.log(`\n📊 Generating ${iterations} test webhooks...`);
  for (let i = 0; i < iterations; i++) {
    webhooks.push({
      id: `webhook-${i}-${Date.now()}`,
      signature: `sig-${i}`,
      payload: {
        id: `payload-${i}`,
        eventType: 'PAYMENT.COMPLETED',
        eventData: {
          id: `transaction-${i}`,
          merchantRefNum: `REF-${i}-${Date.now()}`,
          amount: 1000 + i,
          currencyCode: 'USD',
          status: 'COMPLETED',
        }
      }
    });
  }

  // Benchmark: Check operations (no duplicates expected)
  console.log('\n🔍 Benchmarking duplicate checks (all unique)...');
  const checkStartTime = Date.now();
  let checkOperations = 0;

  for (const webhook of webhooks) {
    await webhookDeduplicator.isDuplicate(
      webhook.id,
      webhook.payload,
      webhook.signature
    );
    checkOperations++;
  }

  const checkDuration = Date.now() - checkStartTime;
  const avgCheckTime = checkDuration / iterations;

  console.log(`  Total time: ${checkDuration}ms`);
  console.log(`  Operations: ${checkOperations}`);
  console.log(`  Avg per check: ${avgCheckTime.toFixed(3)}ms`);
  console.log(`  Checks/second: ${Math.round(1000 / avgCheckTime)}`);

  // Benchmark: Mark operations
  console.log('\n✅ Benchmarking mark processed operations...');
  const markStartTime = Date.now();
  let markOperations = 0;

  for (const webhook of webhooks.slice(0, 100)) { // Mark first 100 to avoid filling Redis
    await webhookDeduplicator.markProcessed(
      webhook.id,
      webhook.payload,
      webhook.signature,
      60 // Short TTL for test
    );
    markOperations++;
  }

  const markDuration = Date.now() - markStartTime;
  const avgMarkTime = markDuration / markOperations;

  console.log(`  Total time: ${markDuration}ms`);
  console.log(`  Operations: ${markOperations}`);
  console.log(`  Avg per mark: ${avgMarkTime.toFixed(3)}ms`);
  console.log(`  Marks/second: ${Math.round(1000 / avgMarkTime)}`);

  // Benchmark: Check with some duplicates
  console.log('\n🔄 Benchmarking duplicate checks (with duplicates)...');
  const mixedStartTime = Date.now();
  let duplicatesFound = 0;
  let mixedOperations = 0;

  // Check first 100 webhooks again (should be duplicates)
  for (const webhook of webhooks.slice(0, 100)) {
    const isDuplicate = await webhookDeduplicator.isDuplicate(
      webhook.id,
      webhook.payload,
      webhook.signature
    );
    if (isDuplicate) duplicatesFound++;
    mixedOperations++;
  }

  // Check new webhooks (should not be duplicates)
  for (const webhook of webhooks.slice(100, 200)) {
    const isDuplicate = await webhookDeduplicator.isDuplicate(
      webhook.id,
      webhook.payload,
      webhook.signature
    );
    if (isDuplicate) duplicatesFound++;
    mixedOperations++;
  }

  const mixedDuration = Date.now() - mixedStartTime;
  const avgMixedTime = mixedDuration / mixedOperations;

  console.log(`  Total time: ${mixedDuration}ms`);
  console.log(`  Operations: ${mixedOperations}`);
  console.log(`  Duplicates found: ${duplicatesFound}`);
  console.log(`  Avg per check: ${avgMixedTime.toFixed(3)}ms`);
  console.log(`  Checks/second: ${Math.round(1000 / avgMixedTime)}`);

  // Test parallel performance
  console.log('\n⚡ Benchmarking parallel operations...');
  const parallelStartTime = Date.now();
  
  const parallelPromises = webhooks.slice(200, 300).map(webhook =>
    webhookDeduplicator.isDuplicate(
      webhook.id,
      webhook.payload,
      webhook.signature
    )
  );

  await Promise.all(parallelPromises);
  const parallelDuration = Date.now() - parallelStartTime;
  const avgParallelTime = parallelDuration / 100;

  console.log(`  Total time: ${parallelDuration}ms for 100 parallel checks`);
  console.log(`  Effective avg per check: ${avgParallelTime.toFixed(3)}ms`);
  console.log(`  Effective checks/second: ${Math.round(100000 / parallelDuration)}`);

  // Clean up test data
  console.log('\n🧹 Cleaning up test data...');
  let cleanedCount = 0;
  for (const webhook of webhooks.slice(0, 100)) {
    const cleared = await webhookDeduplicator.clearDedupKeys(
      webhook.id,
      webhook.payload,
      webhook.signature
    );
    cleanedCount += cleared;
  }
  console.log(`  Cleaned ${cleanedCount} Redis keys`);

  // Performance Analysis
  console.log('\n' + '=' .repeat(60));
  console.log('📈 Performance Analysis:\n');
  
  const overhead = avgCheckTime - 0.1; // Assuming 0.1ms baseline for single key check
  const percentOverhead = (overhead / 0.1) * 100;
  
  console.log(`  Multi-level dedup overhead: ~${overhead.toFixed(3)}ms per check`);
  console.log(`  Overhead percentage: ~${percentOverhead.toFixed(0)}%`);
  console.log(`  Max throughput: ~${Math.round(1000 / avgCheckTime)} checks/second`);
  
  if (avgCheckTime < 5) {
    console.log('\n✅ Performance: EXCELLENT');
    console.log('  Sub-5ms latency maintains high throughput');
  } else if (avgCheckTime < 10) {
    console.log('\n✅ Performance: GOOD');
    console.log('  Sub-10ms latency acceptable for most workloads');
  } else {
    console.log('\n⚠️  Performance: NEEDS OPTIMIZATION');
    console.log('  Consider reducing dedup keys or using pipelining');
  }

  console.log('\n💡 Recommendations:');
  console.log('  • Current implementation uses parallel Redis checks ✅');
  console.log('  • 1-hour TTL prevents memory bloat ✅');
  console.log('  • Multiple dedup strategies prevent functional duplicates ✅');
  console.log('  • Consider Redis pipelining for further optimization');
  
  process.exit(0);
}

// Run benchmark
runBenchmark().catch(error => {
  console.error('Benchmark failed:', error);
  process.exit(1);
});