import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

declare global {
  var __db: PrismaClient | undefined;
  var __redis: Redis | undefined;
}

// Database singleton with connection pooling
export const db = global.__db || new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  datasources: {
    db: {
      // For Supabase, use direct connection instead of pooler to avoid prepared statement issues
      url: process.env.DATABASE_URL?.includes('pooler.supabase.com') 
        ? process.env.DIRECT_URL || process.env.DATABASE_URL?.replace('pooler.supabase.com:6543', 'db.yufxjpyesqstlmvuxtiy.supabase.co:5432')
        : process.env.DATABASE_URL,
    },
  },
});

if (process.env.NODE_ENV !== 'production') {
  global.__db = db;
}

// Redis singleton for caching and queues
export const redis = global.__redis || new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
  lazyConnect: true,
});

if (process.env.NODE_ENV !== 'production') {
  global.__redis = redis;
}

// Database utilities for high-performance operations
export class DatabaseService {
  // Batch insert webhook events for better performance
  static async batchInsertWebhookEvents(events: any[]) {
    if (events.length === 0) return [];
    
    try {
      const result = await db.webhookEvent.createMany({
        data: events,
        skipDuplicates: true,
      });
      
      return result;
    } catch (error) {
      console.error('Batch insert webhook events failed:', error);
      throw error;
    }
  }

  // Batch upsert transactions with conflict resolution
  static async batchUpsertTransactions(transactions: any[]) {
    if (transactions.length === 0) return [];
    
    const results = [];
    
    for (const transaction of transactions) {
      try {
        const result = await db.transaction.upsert({
          where: { externalId: transaction.externalId },
          update: {
            status: transaction.status,
            updatedAt: new Date(),
            metadata: transaction.metadata,
          },
          create: transaction,
        });
        results.push(result);
      } catch (error) {
        console.error(`Failed to upsert transaction ${transaction.externalId}:`, error);
      }
    }
    
    return results;
  }

  // Get transactions with pagination and caching
  static async getTransactionsPaginated(
    page: number = 1, 
    limit: number = 100,
    filters?: {
      status?: string;
      paymentMethod?: string;
      startDate?: Date;
      endDate?: Date;
      currency?: string;
    }
  ) {
    const cacheKey = `transactions:${page}:${limit}:${JSON.stringify(filters || {})}`;
    
    try {
      // Try cache first
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
      
      // Build where clause
      const where: any = {};
      if (filters?.status) where.status = filters.status;
      if (filters?.paymentMethod) where.paymentMethod = filters.paymentMethod;
      if (filters?.currency) where.currency = filters.currency;
      if (filters?.startDate || filters?.endDate) {
        where.transactionTime = {};
        if (filters.startDate) where.transactionTime.gte = filters.startDate;
        if (filters.endDate) where.transactionTime.lte = filters.endDate;
      }
      
      const [transactions, total] = await Promise.all([
        db.transaction.findMany({
          where,
          orderBy: { transactionTime: 'desc' },
          skip: (page - 1) * limit,
          take: limit,
        }),
        db.transaction.count({ where }),
      ]);
      
      const result = {
        transactions,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
      
      // Cache for 5 minutes
      await redis.setex(cacheKey, 300, JSON.stringify(result));
      
      return result;
    } catch (error) {
      console.error('Get transactions paginated failed:', error);
      throw error;
    }
  }

  // Get real-time analytics with caching
  static async getAnalytics(timeRange: 'hour' | 'day' | 'week' | 'month' = 'day') {
    const cacheKey = `analytics:${timeRange}`;
    
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }
      
      const now = new Date();
      let startDate: Date;
      
      switch (timeRange) {
        case 'hour':
          startDate = new Date(now.getTime() - 60 * 60 * 1000);
          break;
        case 'day':
          startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          break;
        case 'week':
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case 'month':
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }
      
      const [transactions, webhookEvents] = await Promise.all([
        db.transaction.findMany({
          where: {
            transactionTime: { gte: startDate },
          },
        }),
        db.webhookEvent.findMany({
          where: {
            timestamp: { gte: startDate },
          },
        }),
      ]);
      
      const analytics = {
        transactions: {
          total: transactions.length,
          completed: transactions.filter(t => t.status === 'COMPLETED').length,
          failed: transactions.filter(t => t.status === 'FAILED').length,
          pending: transactions.filter(t => t.status === 'PENDING').length,
          totalAmount: transactions.reduce((sum, t) => sum + t.amount, 0),
        },
        webhooks: {
          total: webhookEvents.length,
          processed: webhookEvents.filter(e => e.processed && !e.error).length,
          failed: webhookEvents.filter(e => e.error).length,
        },
        timeRange,
        generatedAt: now,
      };
      
      // Cache analytics based on time range
      const cacheTime = timeRange === 'hour' ? 300 : timeRange === 'day' ? 900 : 3600;
      await redis.setex(cacheKey, cacheTime, JSON.stringify(analytics));
      
      return analytics;
    } catch (error) {
      console.error('Get analytics failed:', error);
      throw error;
    }
  }

  // Clean up old data to prevent database bloat
  static async cleanupOldData(daysToKeep: number = 90) {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
    
    try {
      const [deletedWebhooks, deletedMetrics] = await Promise.all([
        db.webhookEvent.deleteMany({
          where: {
            timestamp: { lt: cutoffDate },
          },
        }),
        db.systemMetrics.deleteMany({
          where: {
            timestamp: { lt: cutoffDate },
          },
        }),
      ]);
      
      console.log(`Cleaned up ${deletedWebhooks.count} webhook events and ${deletedMetrics.count} system metrics`);
      
      return { deletedWebhooks: deletedWebhooks.count, deletedMetrics: deletedMetrics.count };
    } catch (error) {
      console.error('Cleanup old data failed:', error);
      throw error;
    }
  }

  // Record system metrics for monitoring
  static async recordSystemMetrics() {
    try {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      await db.systemMetrics.create({
        data: {
          webhooksReceived: await db.webhookEvent.count(),
          webhooksProcessed: await db.webhookEvent.count({ where: { processed: true } }),
          webhooksFailed: await db.webhookEvent.count({ where: { error: { not: null } } }),
          transactionsTotal: await db.transaction.count(),
          transactionsCompleted: await db.transaction.count({ where: { status: 'COMPLETED' } }),
          transactionsFailed: await db.transaction.count({ where: { status: 'FAILED' } }),
          transactionsPending: await db.transaction.count({ where: { status: 'PENDING' } }),
          memoryUsage: memUsage.heapUsed / 1024 / 1024, // MB
          cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000, // ms to seconds
        },
      });
    } catch (error) {
      console.error('Record system metrics failed:', error);
    }
  }

  // Create alert
  static async createAlert(type: 'ERROR' | 'WARNING' | 'INFO', title: string, message: string, metadata?: any) {
    try {
      return await db.alert.create({
        data: {
          type,
          title,
          message,
          metadata,
          source: 'webhook-dashboard',
        },
      });
    } catch (error) {
      console.error('Create alert failed:', error);
      throw error;
    }
  }
}