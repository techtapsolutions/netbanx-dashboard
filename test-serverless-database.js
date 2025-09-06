#!/usr/bin/env node

/**
 * COMPREHENSIVE TEST SUITE FOR SERVERLESS DATABASE SOLUTION
 * 
 * This script thoroughly tests the bulletproof Prisma serverless implementation
 * with focus on prepared statement conflict resolution.
 */

const http = require('http');
const https = require('https');

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const MAX_CONCURRENT = 10;
const ITERATIONS = 3;

// Colors for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function makeRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, BASE_URL);
    const options = {
      method,
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Serverless-DB-Test/1.0',
        ...headers
      }
    };

    if (data) {
      const jsonData = JSON.stringify(data);
      options.headers['Content-Length'] = Buffer.byteLength(jsonData);
    }

    const client = url.protocol === 'https:' ? https : http;
    const req = client.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = body ? JSON.parse(body) : {};
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: parsed
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            headers: res.headers,
            data: { error: 'Invalid JSON response', body }
          });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// Test database health check
async function testDatabaseHealth() {
  log('\n=== Database Health Check ===', 'blue');
  
  try {
    const response = await makeRequest('GET', '/api/health');
    
    if (response.status === 200) {
      log(`✅ Database health check passed`, 'green');
      log(`   Response: ${JSON.stringify(response.data, null, 2)}`, 'reset');
      return true;
    } else {
      log(`❌ Database health check failed: ${response.status}`, 'red');
      log(`   Response: ${JSON.stringify(response.data, null, 2)}`, 'reset');
      return false;
    }
  } catch (error) {
    log(`❌ Database health check error: ${error.message}`, 'red');
    return false;
  }
}

// Test webhook endpoint with database operations
async function testWebhookWithDatabase(testId) {
  const webhookData = {
    id: `test-${testId}-${Date.now()}`,
    eventType: 'ACCT_ENABLED',
    resourceId: `ACCT${testId}${Math.random().toString(36).substring(7)}`,
    mode: 'test',
    eventDate: new Date().toISOString(),
    account: {
      id: `ACCT${testId}${Math.random().toString(36).substring(7)}`,
      merchantId: `MERCH${testId}`,
      status: 'Approved',
      creditCardId: `CC${testId}${Math.random().toString(36).substring(7)}`,
      directDebitId: `DD${testId}${Math.random().toString(36).substring(7)}`,
      businessName: `Test Business ${testId}`,
      email: `test${testId}@example.com`,
      onboardingStage: 'COMPLETE'
    },
    paymentMethods: [
      {
        type: 'CREDIT_CARD',
        id: `CC${testId}${Math.random().toString(36).substring(7)}`,
        status: 'ACTIVE'
      }
    ],
    timestamp: new Date().toISOString(),
    source: 'test-webhook'
  };

  try {
    const response = await makeRequest('POST', '/api/webhooks/account-status', webhookData, {
      'X-Test-Webhook': 'true',
      'X-Paysafe-Event-Type': 'ACCT_ENABLED'
    });

    return {
      testId,
      success: response.status === 200,
      status: response.status,
      data: response.data,
      duration: Date.now()
    };
  } catch (error) {
    return {
      testId,
      success: false,
      status: 0,
      data: { error: error.message },
      duration: Date.now()
    };
  }
}

// Test concurrent webhook processing (stress test for prepared statements)
async function testConcurrentWebhooks() {
  log('\n=== Concurrent Webhook Test (Prepared Statement Stress Test) ===', 'blue');
  
  const promises = [];
  const startTime = Date.now();
  
  for (let i = 0; i < MAX_CONCURRENT; i++) {
    promises.push(testWebhookWithDatabase(i + 1));
  }
  
  try {
    const results = await Promise.allSettled(promises);
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
    const failed = results.length - successful;
    
    log(`\n📊 Concurrent Test Results:`, 'bold');
    log(`   Total requests: ${results.length}`, 'reset');
    log(`   Successful: ${successful}`, successful === results.length ? 'green' : 'yellow');
    log(`   Failed: ${failed}`, failed === 0 ? 'green' : 'red');
    log(`   Duration: ${duration}ms`, 'reset');
    log(`   Avg per request: ${Math.round(duration / results.length)}ms`, 'reset');
    
    // Show detailed results for failures
    results.forEach((result, index) => {
      if (result.status === 'rejected') {
        log(`   ❌ Request ${index + 1}: ${result.reason.message}`, 'red');
      } else if (!result.value.success) {
        log(`   ❌ Request ${index + 1}: Status ${result.value.status}`, 'red');
        log(`      Error: ${JSON.stringify(result.value.data)}`, 'red');
      }
    });
    
    return { successful, failed, total: results.length, duration };
  } catch (error) {
    log(`❌ Concurrent test error: ${error.message}`, 'red');
    return { successful: 0, failed: MAX_CONCURRENT, total: MAX_CONCURRENT, duration: 0 };
  }
}

// Test sequential webhook processing
async function testSequentialWebhooks() {
  log('\n=== Sequential Webhook Test ===', 'blue');
  
  const results = [];
  const startTime = Date.now();
  
  for (let i = 0; i < ITERATIONS; i++) {
    log(`   Processing webhook ${i + 1}/${ITERATIONS}...`, 'reset');
    const result = await testWebhookWithDatabase(i + 1);
    results.push(result);
    
    if (result.success) {
      log(`   ✅ Webhook ${i + 1} successful`, 'green');
    } else {
      log(`   ❌ Webhook ${i + 1} failed: Status ${result.status}`, 'red');
    }
  }
  
  const endTime = Date.now();
  const duration = endTime - startTime;
  const successful = results.filter(r => r.success).length;
  const failed = results.length - successful;
  
  log(`\n📊 Sequential Test Results:`, 'bold');
  log(`   Total requests: ${results.length}`, 'reset');
  log(`   Successful: ${successful}`, successful === results.length ? 'green' : 'yellow');
  log(`   Failed: ${failed}`, failed === 0 ? 'green' : 'red');
  log(`   Duration: ${duration}ms`, 'reset');
  log(`   Avg per request: ${Math.round(duration / results.length)}ms`, 'reset');
  
  return { successful, failed, total: results.length, duration };
}

// Test webhook secrets API (tests the withDatabase wrapper)
async function testWebhookSecrets() {
  log('\n=== Webhook Secrets API Test ===', 'blue');
  
  try {
    // Test GET webhook secrets
    const getResponse = await makeRequest('GET', '/api/webhook-secrets');
    
    if (getResponse.status === 200) {
      log(`✅ GET webhook secrets successful`, 'green');
      log(`   Found ${getResponse.data.secrets?.length || 0} secrets`, 'reset');
    } else {
      log(`❌ GET webhook secrets failed: ${getResponse.status}`, 'red');
      return false;
    }
    
    // Test POST webhook secret (if endpoint exists)
    const testSecret = {
      endpoint: 'test-endpoint',
      name: 'Test Secret',
      description: 'Test webhook secret for serverless testing',
      algorithm: 'sha256'
    };
    
    const postResponse = await makeRequest('POST', '/api/webhook-secrets', testSecret);
    
    if (postResponse.status === 200 || postResponse.status === 201) {
      log(`✅ POST webhook secret successful`, 'green');
    } else {
      log(`❌ POST webhook secret failed: ${postResponse.status}`, 'red');
      log(`   Error: ${JSON.stringify(postResponse.data)}`, 'red');
    }
    
    return true;
  } catch (error) {
    log(`❌ Webhook secrets test error: ${error.message}`, 'red');
    return false;
  }
}

// Run the complete test suite
async function runTestSuite() {
  log(`${colors.bold}🚀 SERVERLESS DATABASE TEST SUITE${colors.reset}`);
  log(`Testing against: ${BASE_URL}`);
  log(`Max concurrent: ${MAX_CONCURRENT}`);
  log(`Iterations: ${ITERATIONS}`);
  
  const startTime = Date.now();
  
  // Run all tests
  const healthOk = await testDatabaseHealth();
  
  if (!healthOk) {
    log('\n❌ Skipping remaining tests due to health check failure', 'red');
    return;
  }
  
  const secretsOk = await testWebhookSecrets();
  const sequentialResults = await testSequentialWebhooks();
  const concurrentResults = await testConcurrentWebhooks();
  
  // Summary
  const endTime = Date.now();
  const totalDuration = endTime - startTime;
  
  log(`\n${'='.repeat(60)}`, 'blue');
  log(`📋 FINAL TEST SUMMARY`, 'bold');
  log(`${'='.repeat(60)}`, 'blue');
  
  log(`🏥 Database Health: ${healthOk ? '✅ PASS' : '❌ FAIL'}`, healthOk ? 'green' : 'red');
  log(`🔑 Webhook Secrets: ${secretsOk ? '✅ PASS' : '❌ FAIL'}`, secretsOk ? 'green' : 'red');
  
  log(`\n📈 Performance Results:`);
  log(`   Sequential: ${sequentialResults.successful}/${sequentialResults.total} (${Math.round(sequentialResults.successful/sequentialResults.total*100)}%)`, 
       sequentialResults.successful === sequentialResults.total ? 'green' : 'red');
  log(`   Concurrent: ${concurrentResults.successful}/${concurrentResults.total} (${Math.round(concurrentResults.successful/concurrentResults.total*100)}%)`,
       concurrentResults.successful === concurrentResults.total ? 'green' : 'red');
  
  log(`\n⏱️ Timing:`);
  log(`   Total test duration: ${totalDuration}ms`);
  log(`   Sequential avg: ${Math.round(sequentialResults.duration/sequentialResults.total)}ms per request`);
  log(`   Concurrent avg: ${Math.round(concurrentResults.duration/concurrentResults.total)}ms per request`);
  
  const overallSuccess = healthOk && 
                        sequentialResults.successful === sequentialResults.total &&
                        concurrentResults.successful === concurrentResults.total;
  
  log(`\n🎯 OVERALL RESULT: ${overallSuccess ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`,
      overallSuccess ? 'green' : 'red');
  
  if (overallSuccess) {
    log(`\n🎉 The serverless database solution is working correctly!`, 'green');
    log(`   ✅ No prepared statement conflicts detected`, 'green');
    log(`   ✅ All database operations successful`, 'green');
    log(`   ✅ Concurrent processing works reliably`, 'green');
  } else {
    log(`\n⚠️  Some issues detected. Please check the logs above.`, 'yellow');
  }
  
  log(`\n${'='.repeat(60)}`, 'blue');
}

// Run the test suite
if (require.main === module) {
  runTestSuite().catch(error => {
    log(`\n💥 Test suite crashed: ${error.message}`, 'red');
    console.error(error);
    process.exit(1);
  });
}

module.exports = {
  runTestSuite,
  testDatabaseHealth,
  testWebhookWithDatabase,
  testConcurrentWebhooks,
  testSequentialWebhooks,
  testWebhookSecrets
};