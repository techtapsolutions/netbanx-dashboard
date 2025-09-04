import { NextRequest, NextResponse } from 'next/server';
import { db, redis } from '@/lib/database';
import { QueueManager } from '@/lib/queue';

export async function GET(request: NextRequest) {
  const startTime = Date.now();
  
  try {
    // Check database connection
    const dbHealth = await checkDatabase();
    
    // Check Redis connection
    const redisHealth = await checkRedis();
    
    // Check queue status
    const queueHealth = await checkQueues();
    
    // System metrics
    const systemHealth = getSystemMetrics();
    
    const responseTime = Date.now() - startTime;
    const allHealthy = dbHealth.healthy && redisHealth.healthy && queueHealth.healthy;
    
    const response = {
      status: allHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      services: {
        database: dbHealth,
        redis: redisHealth,
        queues: queueHealth,
        system: systemHealth,
      },
      version: process.env.npm_package_version || '1.0.0',
    };
    
    return NextResponse.json(response, {
      status: allHealthy ? 200 : 503,
      headers: {
        'Cache-Control': 'no-cache',
      },
    });
    
  } catch (error) {
    const responseTime = Date.now() - startTime;
    
    return NextResponse.json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      responseTime: `${responseTime}ms`,
      error: error instanceof Error ? error.message : 'Unknown error',
    }, {
      status: 503,
      headers: {
        'Cache-Control': 'no-cache',
      },
    });
  }
}

async function checkDatabase() {
  try {
    const startTime = Date.now();
    await db.$queryRaw`SELECT 1`;
    const responseTime = Date.now() - startTime;
    
    return {
      healthy: true,
      responseTime: `${responseTime}ms`,
    };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Database connection failed',
    };
  }
}

async function checkRedis() {
  try {
    const startTime = Date.now();
    await redis.ping();
    const responseTime = Date.now() - startTime;
    
    return {
      healthy: true,
      responseTime: `${responseTime}ms`,
    };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Redis connection failed',
    };
  }
}

async function checkQueues() {
  try {
    const stats = await QueueManager.getQueueStats();
    
    return {
      healthy: true,
      stats,
    };
  } catch (error) {
    return {
      healthy: false,
      error: error instanceof Error ? error.message : 'Queue check failed',
    };
  }
}

function getSystemMetrics() {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  return {
    memory: {
      used: `${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`,
      total: `${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)}MB`,
    },
    cpu: {
      user: `${Math.round(cpuUsage.user / 1000)}ms`,
      system: `${Math.round(cpuUsage.system / 1000)}ms`,
    },
    uptime: `${Math.round(process.uptime())}s`,
    pid: process.pid,
    nodeVersion: process.version,
  };
}