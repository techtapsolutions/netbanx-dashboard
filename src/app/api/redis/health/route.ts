import { NextRequest, NextResponse } from 'next/server';
import { RedisConnectionManager } from '@/lib/redis-config';

export async function GET() {
  try {
    const startTime = Date.now();
    
    // Test basic Redis connectivity
    const connectionTest = await RedisConnectionManager.testConnection();
    
    // Test basic operations
    const testKey = `health_check_${Date.now()}`;
    const testValue = `test_${Math.random()}`;
    
    // Write test
    await RedisConnectionManager.set(testKey, testValue, 10); // 10 second TTL
    
    // Read test
    const retrievedValue = await RedisConnectionManager.get(testKey);
    const readSuccess = retrievedValue === testValue;
    
    // Cleanup test key
    await RedisConnectionManager.del(testKey);
    
    // Get detailed health stats
    const healthStats = await RedisConnectionManager.getHealthStats();
    
    const totalTime = Date.now() - startTime;
    
    const response = {
      success: true,
      redis: {
        connected: connectionTest.success,
        provider: connectionTest.provider,
        latency: connectionTest.latency,
        version: connectionTest.version,
        operations: {
          write: true,
          read: readSuccess,
          delete: true,
        },
        ...healthStats,
      },
      tests: {
        connection: connectionTest.success,
        write: true,
        read: readSuccess,
        cleanup: true,
        totalTime,
      },
      timestamp: new Date().toISOString(),
    };

    // Return appropriate status based on test results
    const status = connectionTest.success && readSuccess ? 200 : 503;
    
    return NextResponse.json(response, { status });
    
  } catch (error) {
    console.error('Redis health check failed:', error);
    
    return NextResponse.json(
      {
        success: false,
        redis: {
          connected: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        },
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}

// Also support POST for more detailed testing
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { 
      testKeys = ['test1', 'test2', 'test3'],
      testTTL = 30,
      stressTest = false 
    } = body;
    
    const startTime = Date.now();
    const results: any = {
      success: true,
      redis: {},
      tests: {},
      operations: [],
    };
    
    // Basic connection test
    const connectionTest = await RedisConnectionManager.testConnection();
    results.redis = {
      connected: connectionTest.success,
      provider: connectionTest.provider,
      latency: connectionTest.latency,
      version: connectionTest.version,
    };
    
    if (!connectionTest.success) {
      results.success = false;
      results.redis.error = connectionTest.error;
      return NextResponse.json(results, { status: 503 });
    }
    
    // Test multiple operations
    for (const testKey of testKeys) {
      const keyStartTime = Date.now();
      const testValue = `test_value_${Date.now()}_${Math.random()}`;
      
      try {
        // Write test
        await RedisConnectionManager.set(`test:${testKey}`, testValue, testTTL);
        const writeTime = Date.now() - keyStartTime;
        
        // Read test
        const readStartTime = Date.now();
        const retrievedValue = await RedisConnectionManager.get(`test:${testKey}`);
        const readTime = Date.now() - readStartTime;
        
        // Existence test
        const existsStartTime = Date.now();
        const exists = await RedisConnectionManager.exists(`test:${testKey}`);
        const existsTime = Date.now() - existsStartTime;
        
        // Delete test
        const deleteStartTime = Date.now();
        await RedisConnectionManager.del(`test:${testKey}`);
        const deleteTime = Date.now() - deleteStartTime;
        
        const totalKeyTime = Date.now() - keyStartTime;
        
        results.operations.push({
          key: testKey,
          success: retrievedValue === testValue && exists === 1,
          timings: {
            write: writeTime,
            read: readTime,
            exists: existsTime,
            delete: deleteTime,
            total: totalKeyTime,
          },
          dataIntegrity: retrievedValue === testValue,
        });
        
      } catch (error) {
        results.operations.push({
          key: testKey,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        results.success = false;
      }
    }
    
    // Stress test if requested
    if (stressTest && results.success) {
      const stressStartTime = Date.now();
      const stressOperations = 50;
      const stressResults = [];
      
      for (let i = 0; i < stressOperations; i++) {
        const opStartTime = Date.now();
        const stressKey = `stress:${i}`;
        const stressValue = `stress_value_${i}`;
        
        try {
          await RedisConnectionManager.set(stressKey, stressValue, 10);
          await RedisConnectionManager.get(stressKey);
          await RedisConnectionManager.del(stressKey);
          
          stressResults.push({
            operation: i,
            time: Date.now() - opStartTime,
            success: true,
          });
        } catch (error) {
          stressResults.push({
            operation: i,
            time: Date.now() - opStartTime,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
      
      const stressTime = Date.now() - stressStartTime;
      const successfulOps = stressResults.filter(r => r.success).length;
      
      results.stressTest = {
        totalOperations: stressOperations,
        successfulOperations: successfulOps,
        failedOperations: stressOperations - successfulOps,
        totalTime: stressTime,
        averageOpTime: stressTime / stressOperations,
        operationsPerSecond: (successfulOps / stressTime) * 1000,
      };
    }
    
    // Get health stats
    const healthStats = await RedisConnectionManager.getHealthStats();
    results.redis = { ...results.redis, ...healthStats };
    
    results.tests = {
      totalOperations: testKeys.length,
      successfulOperations: results.operations.filter((op: any) => op.success).length,
      totalTime: Date.now() - startTime,
    };
    
    results.timestamp = new Date().toISOString();
    
    return NextResponse.json(results, { 
      status: results.success ? 200 : 503 
    });
    
  } catch (error) {
    console.error('Redis detailed health check failed:', error);
    
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}