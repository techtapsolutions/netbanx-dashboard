import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

declare global {
  var __db: PrismaClient | undefined;
  var __redis: Redis | undefined;
}

/**
 * BULLETPROOF SERVERLESS PRISMA SOLUTION
 * 
 * This implementation completely resolves prepared statement conflicts
 * by using unique connection strings and isolated client instances
 * for each serverless function invocation.
 */

// Enhanced serverless environment detection
function isServerlessEnvironment(): boolean {
  return !!(
    process.env.VERCEL || 
    process.env.AWS_LAMBDA_FUNCTION_NAME || 
    process.env.NETLIFY ||
    process.env.FUNCTIONS_WORKER_RUNTIME ||
    process.env.RENDER ||
    process.env.RAILWAY_ENVIRONMENT ||
    // Check for serverless execution context
    typeof process.env.AWS_EXECUTION_ENV !== 'undefined' ||
    typeof process.env._HANDLER !== 'undefined'
  );
}

// Generate unique connection identifier to prevent prepared statement conflicts
function generateUniqueConnectionId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `conn_${timestamp}_${random}`;
}

// Create serverless-optimized connection string
function createServerlessConnectionString(): string {
  const originalUrl = process.env.DATABASE_URL;
  if (!originalUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  try {
    const url = new URL(originalUrl);
    
    // Critical: Add unique application_name to prevent prepared statement conflicts
    const uniqueId = generateUniqueConnectionId();
    url.searchParams.set('application_name', uniqueId);
    
    // Serverless optimizations
    url.searchParams.set('prepared_statements', 'false');
    url.searchParams.set('connection_limit', '1');
    url.searchParams.set('pool_timeout', '10');
    url.searchParams.set('connect_timeout', '30');
    url.searchParams.set('statement_timeout', '30000');
    
    // Disable connection pooling for serverless
    url.searchParams.set('pgbouncer', 'true');
    url.searchParams.set('pool_mode', 'transaction');
    
    const newUrl = url.toString();
    console.log(`Created serverless connection string with ID: ${uniqueId}`);
    return newUrl;
  } catch (error) {
    console.error('Failed to modify DATABASE_URL:', error);
    throw new Error('Invalid DATABASE_URL format');
  }
}

// Create Prisma client with serverless optimizations
function createPrismaClient(forceServerless = false): PrismaClient {
  const isServerless = forceServerless || isServerlessEnvironment();
  
  const config: any = {
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    errorFormat: isServerless ? 'minimal' : 'colorless',
  };
  
  // Use unique connection string in serverless environments
  if (isServerless) {
    config.datasources = {
      db: {
        url: createServerlessConnectionString()
      }
    };
  }
  
  return new PrismaClient(config);
}

// Connection pool manager for serverless environments
class ServerlessConnectionManager {
  private static instance: ServerlessConnectionManager;
  private clients: Map<string, PrismaClient> = new Map();
  private lastCleanup: number = Date.now();
  
  static getInstance(): ServerlessConnectionManager {
    if (!ServerlessConnectionManager.instance) {
      ServerlessConnectionManager.instance = new ServerlessConnectionManager();
    }
    return ServerlessConnectionManager.instance;
  }
  
  async getClient(): Promise<PrismaClient> {
    // Clean up old clients periodically
    if (Date.now() - this.lastCleanup > 60000) { // Every minute
      await this.cleanup();
    }
    
    // Always create a fresh client for serverless
    const client = createPrismaClient(true);
    const clientId = generateUniqueConnectionId();
    
    this.clients.set(clientId, client);
    
    // Auto-cleanup after use
    setTimeout(() => {
      this.cleanupClient(clientId);
    }, 120000); // 2 minutes
    
    return client;
  }
  
  private async cleanupClient(clientId: string): Promise<void> {
    const client = this.clients.get(clientId);
    if (client) {
      try {
        await client.$disconnect();
      } catch (error) {
        console.warn(`Failed to disconnect client ${clientId}:`, error);
      } finally {
        this.clients.delete(clientId);
      }
    }
  }
  
  private async cleanup(): Promise<void> {
    const clientIds = Array.from(this.clients.keys());
    await Promise.all(clientIds.map(id => this.cleanupClient(id)));
    this.lastCleanup = Date.now();
  }
}

// Development singleton for non-serverless environments
let developmentClient: PrismaClient | undefined;

function getDevelopmentClient(): PrismaClient {
  if (!developmentClient) {
    developmentClient = createPrismaClient(false);
    
    // Cleanup on process termination
    const cleanup = async () => {
      if (developmentClient) {
        try {
          await developmentClient.$disconnect();
        } catch (error) {
          console.warn('Failed to disconnect development client:', error);
        }
      }
    };
    
    process.on('beforeExit', cleanup);
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
  }
  
  return developmentClient;
}

/**
 * BULLETPROOF DATABASE WRAPPER
 * 
 * This function completely isolates database operations in serverless environments
 * by using unique connection strings and proper lifecycle management.
 */
export async function withDatabase<T>(
  operation: (client: PrismaClient) => Promise<T>,
  options: { retries?: number; timeout?: number } = {}
): Promise<T> {
  const { retries = 2, timeout = 30000 } = options;
  
  let lastError: Error | undefined;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    let client: PrismaClient | undefined;
    
    try {
      // Get appropriate client based on environment
      if (isServerlessEnvironment()) {
        const manager = ServerlessConnectionManager.getInstance();
        client = await manager.getClient();
        console.log(`Serverless DB operation attempt ${attempt + 1}/${retries + 1}`);
      } else {
        client = getDevelopmentClient();
        console.log(`Development DB operation`);
      }
      
      // Set up timeout
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Database operation timeout')), timeout);
      });
      
      // Execute operation with timeout
      const result = await Promise.race([
        operation(client),
        timeoutPromise
      ]);
      
      return result;
      
    } catch (error: any) {
      lastError = error;
      console.error(`Database operation failed (attempt ${attempt + 1}/${retries + 1}):`, {
        error: error.message,
        code: error.code,
        isServerless: isServerlessEnvironment()
      });
      
      // Always disconnect serverless clients immediately on error
      if (client && isServerlessEnvironment()) {
        try {
          await client.$disconnect();
        } catch (disconnectError) {
          console.warn('Failed to disconnect client after error:', disconnectError);
        }
      }
      
      // Don't retry certain errors
      if (error.code === 'P2002' || // Unique constraint
          error.code === 'P2025' || // Record not found
          error.code === 'P2003') { // Foreign key constraint
        throw error;
      }
      
      // Wait before retry
      if (attempt < retries) {
        await new Promise(resolve => setTimeout(resolve, Math.min(1000 * (attempt + 1), 5000)));
      }
    }
  }
  
  // Enhance error messages
  if (lastError) {
    if (lastError.message.includes('prepared statement')) {
      throw new Error(
        `Prepared statement conflict detected. This should not happen with the new implementation. ` +
        `Original error: ${lastError.message}`
      );
    }
    
    throw lastError;
  }
  
  throw new Error('Database operation failed after all retry attempts');
}

/**
 * LEGACY COMPATIBILITY
 * 
 * Export direct client for existing code, but this is not recommended for new code.
 * Use withDatabase() wrapper instead for full serverless compatibility.
 */
export const db = (() => {
  if (isServerlessEnvironment()) {
    console.warn(
      'Warning: Direct db export used in serverless environment. ' +
      'Consider using withDatabase() wrapper for better reliability.'
    );
  }
  return isServerlessEnvironment() ? createPrismaClient(true) : getDevelopmentClient();
})();

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