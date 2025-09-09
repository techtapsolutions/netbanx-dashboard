#!/usr/bin/env node

/**
 * Quick Performance Test for Database Optimizations
 * Tests the main API endpoints to measure performance improvements
 */

import fetch from 'node-fetch';

const API_BASE = 'http://localhost:3000';

interface TestResult {
  endpoint: string;
  time: number;
  cached: boolean;
  success: boolean;
}

async function testEndpoint(path: string, description: string): Promise<TestResult> {
  console.log(`\n🔍 Testing: ${description}`);
  const start = Date.now();
  
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      timeout: 30000 // 30 second timeout
    });
    
    const time = Date.now() - start;
    const cached = response.headers.get('X-Cache') === 'HIT';
    
    console.log(`  ⏱️  ${time}ms ${cached ? '(cached)' : '(uncached)'}`);
    console.log(`  📊 Status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.text();
      console.log(`  📦 Size: ${(data.length / 1024).toFixed(1)}KB`);
    }
    
    return {
      endpoint: path,
      time,
      cached,
      success: response.ok
    };
  } catch (error) {
    const time = Date.now() - start;
    console.log(`  ❌ Error: ${error instanceof Error ? error.message : 'Unknown'}`);
    
    return {
      endpoint: path,
      time,
      cached: false,
      success: false
    };
  }
}

async function runTests() {
  console.log('=========================================');
  console.log('🚀 DATABASE OPTIMIZATION PERFORMANCE TEST');
  console.log('=========================================\n');
  
  const results: TestResult[] = [];
  
  // Test transactions endpoint (primary bottleneck)
  results.push(await testEndpoint('/api/data?type=transactions', 'Transactions API (Cold)'));
  
  // Wait and test cached response
  await new Promise(resolve => setTimeout(resolve, 500));
  results.push(await testEndpoint('/api/data?type=transactions', 'Transactions API (Warm)'));
  
  // Test webhooks endpoint
  results.push(await testEndpoint('/api/data?type=webhooks&limit=50', 'Webhooks API (Cold)'));
  
  // Test stats endpoint (aggregations)
  results.push(await testEndpoint('/api/data?type=stats', 'Stats API (Cold)'));
  
  // Test parallel requests
  console.log('\n🔄 Testing Parallel Requests...');
  const parallelStart = Date.now();
  
  try {
    await Promise.all([
      fetch(`${API_BASE}/api/data?type=transactions`, { timeout: 15000 }),
      fetch(`${API_BASE}/api/data?type=webhooks`, { timeout: 15000 }),
      fetch(`${API_BASE}/api/data?type=stats`, { timeout: 15000 })
    ]);
    
    const parallelTime = Date.now() - parallelStart;
    console.log(`  ✅ Parallel execution: ${parallelTime}ms`);
    
  } catch (error) {
    console.log(`  ❌ Parallel test failed: ${error instanceof Error ? error.message : 'Unknown'}`);
  }
  
  // Summary
  console.log('\n=========================================');
  console.log('📊 PERFORMANCE SUMMARY');
  console.log('=========================================');
  
  const uncachedResults = results.filter(r => !r.cached && r.success);
  const cachedResults = results.filter(r => r.cached && r.success);
  
  if (uncachedResults.length > 0) {
    const avgUncached = uncachedResults.reduce((sum, r) => sum + r.time, 0) / uncachedResults.length;
    console.log(`\n⚡ Uncached Performance:`);
    console.log(`  Average: ${avgUncached.toFixed(0)}ms`);
    console.log(`  Target: <2000ms`);
    console.log(`  Status: ${avgUncached < 2000 ? '✅ PASS' : '❌ FAIL'}`);
    
    if (avgUncached < 1000) {
      console.log(`  🏆 EXCELLENT - Under 1 second!`);
    } else if (avgUncached < 2000) {
      console.log(`  🎯 GOOD - Meeting target`);
    } else if (avgUncached < 5000) {
      console.log(`  ⚠️  NEEDS IMPROVEMENT - Above target but under 5s`);
    } else {
      console.log(`  🚨 CRITICAL - Exceeds 5 seconds`);
    }
  }
  
  if (cachedResults.length > 0) {
    const avgCached = cachedResults.reduce((sum, r) => sum + r.time, 0) / cachedResults.length;
    console.log(`\n💾 Cached Performance:`);
    console.log(`  Average: ${avgCached.toFixed(0)}ms`);
    console.log(`  Cache speedup: ${uncachedResults.length > 0 ? `${(uncachedResults.reduce((sum, r) => sum + r.time, 0) / uncachedResults.length / avgCached).toFixed(1)}x` : 'N/A'}`);
  }
  
  // Individual results
  console.log(`\n📋 Individual Results:`);
  results.forEach(result => {
    const status = result.success ? '✅' : '❌';
    const cache = result.cached ? '💾' : '🔄';
    console.log(`  ${status} ${cache} ${result.endpoint}: ${result.time}ms`);
  });
  
  console.log('\n=========================================');
}

// Run the tests
runTests().catch(console.error);