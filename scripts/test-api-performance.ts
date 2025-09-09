#!/usr/bin/env node

/**
 * API Performance Testing Script
 * 
 * Tests the /api/data endpoint performance with various scenarios
 * Run with: npx tsx scripts/test-api-performance.ts
 */

import fetch from 'node-fetch';

const API_BASE_URL = process.env.API_URL || 'http://localhost:3000';

interface TestResult {
  endpoint: string;
  responseTime: number;
  cached: boolean;
  size: number;
  success: boolean;
  error?: string;
}

class PerformanceTester {
  private results: TestResult[] = [];

  async testEndpoint(path: string, description: string): Promise<TestResult> {
    console.log(`\n📊 Testing: ${description}`);
    const startTime = Date.now();
    
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        headers: {
          'Accept': 'application/json',
        }
      });
      
      const responseTime = Date.now() - startTime;
      const data = await response.text();
      const cached = response.headers.get('X-Cache') === 'HIT';
      
      const result: TestResult = {
        endpoint: path,
        responseTime,
        cached,
        size: data.length,
        success: response.ok,
        error: response.ok ? undefined : `Status: ${response.status}`
      };
      
      this.results.push(result);
      
      console.log(`  ✅ Response Time: ${responseTime}ms`);
      console.log(`  📦 Size: ${(data.length / 1024).toFixed(2)} KB`);
      console.log(`  💾 Cached: ${cached ? 'Yes' : 'No'}`);
      console.log(`  🔧 Response Header Time: ${response.headers.get('X-Response-Time') || 'N/A'}`);
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.log(`  ❌ Error: ${errorMessage}`);
      
      const result: TestResult = {
        endpoint: path,
        responseTime: Date.now() - startTime,
        cached: false,
        size: 0,
        success: false,
        error: errorMessage
      };
      
      this.results.push(result);
      return result;
    }
  }

  async runTests() {
    console.log('=================================');
    console.log('🚀 API Performance Test Suite');
    console.log('=================================');
    console.log(`Target: ${API_BASE_URL}`);
    console.log(`Time: ${new Date().toISOString()}`);
    
    // Test 1: Transactions endpoint (cold cache)
    await this.testEndpoint('/api/data?type=transactions', 'Transactions API (Cold Cache)');
    
    // Test 2: Transactions endpoint (warm cache)
    await new Promise(resolve => setTimeout(resolve, 100));
    await this.testEndpoint('/api/data?type=transactions', 'Transactions API (Warm Cache)');
    
    // Test 3: Webhooks endpoint (cold cache)
    await this.testEndpoint('/api/data?type=webhooks&limit=50', 'Webhooks API (Cold Cache)');
    
    // Test 4: Webhooks endpoint (warm cache)
    await new Promise(resolve => setTimeout(resolve, 100));
    await this.testEndpoint('/api/data?type=webhooks&limit=50', 'Webhooks API (Warm Cache)');
    
    // Test 5: Stats endpoint (cold cache)
    await this.testEndpoint('/api/data?type=stats', 'Stats API (Cold Cache)');
    
    // Test 6: Stats endpoint (warm cache)
    await new Promise(resolve => setTimeout(resolve, 100));
    await this.testEndpoint('/api/data?type=stats', 'Stats API (Warm Cache)');
    
    // Test 7: Parallel requests
    console.log('\n📊 Testing: Parallel Requests (3 concurrent)');
    const parallelStart = Date.now();
    const parallelResults = await Promise.all([
      fetch(`${API_BASE_URL}/api/data?type=transactions`),
      fetch(`${API_BASE_URL}/api/data?type=webhooks`),
      fetch(`${API_BASE_URL}/api/data?type=stats`)
    ]);
    const parallelTime = Date.now() - parallelStart;
    console.log(`  ✅ Total Time: ${parallelTime}ms`);
    console.log(`  📈 Average: ${(parallelTime / 3).toFixed(0)}ms per request`);
    
    this.printSummary();
  }

  printSummary() {
    console.log('\n=================================');
    console.log('📊 Performance Summary');
    console.log('=================================');
    
    // Calculate statistics
    const successfulTests = this.results.filter(r => r.success);
    const cachedTests = successfulTests.filter(r => r.cached);
    const uncachedTests = successfulTests.filter(r => !r.cached);
    
    if (successfulTests.length === 0) {
      console.log('❌ No successful tests');
      return;
    }
    
    const avgResponseTime = successfulTests.reduce((sum, r) => sum + r.responseTime, 0) / successfulTests.length;
    const avgCachedTime = cachedTests.length > 0 
      ? cachedTests.reduce((sum, r) => sum + r.responseTime, 0) / cachedTests.length
      : 0;
    const avgUncachedTime = uncachedTests.length > 0
      ? uncachedTests.reduce((sum, r) => sum + r.responseTime, 0) / uncachedTests.length
      : 0;
    
    const maxTime = Math.max(...successfulTests.map(r => r.responseTime));
    const minTime = Math.min(...successfulTests.map(r => r.responseTime));
    
    console.log(`\n📈 Response Times:`);
    console.log(`  Average: ${avgResponseTime.toFixed(0)}ms`);
    console.log(`  Cached Average: ${avgCachedTime.toFixed(0)}ms`);
    console.log(`  Uncached Average: ${avgUncachedTime.toFixed(0)}ms`);
    console.log(`  Min: ${minTime}ms`);
    console.log(`  Max: ${maxTime}ms`);
    
    console.log(`\n💾 Cache Performance:`);
    console.log(`  Cache Hit Rate: ${((cachedTests.length / successfulTests.length) * 100).toFixed(1)}%`);
    console.log(`  Cache Speedup: ${avgUncachedTime > 0 ? (avgUncachedTime / avgCachedTime).toFixed(1) : 'N/A'}x faster`);
    
    console.log(`\n🎯 Performance Goals:`);
    const meetsTarget = avgUncachedTime < 5000;
    console.log(`  Target: < 5000ms for uncached requests`);
    console.log(`  Status: ${meetsTarget ? '✅ PASS' : '❌ FAIL'}`);
    
    if (avgUncachedTime > 5000) {
      console.log(`\n⚠️  Performance Warning:`);
      console.log(`  Uncached requests averaging ${avgUncachedTime.toFixed(0)}ms`);
      console.log(`  This exceeds the 5-second target by ${(avgUncachedTime - 5000).toFixed(0)}ms`);
    }
    
    // Performance grade
    let grade = 'A+';
    if (avgUncachedTime > 10000) grade = 'F';
    else if (avgUncachedTime > 7000) grade = 'D';
    else if (avgUncachedTime > 5000) grade = 'C';
    else if (avgUncachedTime > 3000) grade = 'B';
    else if (avgUncachedTime > 1000) grade = 'A';
    
    console.log(`\n🏆 Performance Grade: ${grade}`);
  }
}

// Run tests
const tester = new PerformanceTester();
tester.runTests().catch(console.error);