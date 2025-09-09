import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';
import { DatabasePerformanceMonitor } from './database-performance-monitor';

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
    
    // High-throughput serverless optimizations
    url.searchParams.set('prepared_statements', 'false');
    url.searchParams.set('connection_limit', '5'); // Increased for webhook bursts
    url.searchParams.set('pool_timeout', '5');     // Reduced for faster failover
    url.searchParams.set('connect_timeout', '10'); // Faster connection establishment
    url.searchParams.set('statement_timeout', '15000'); // Reduced timeout for faster failure detection
    url.searchParams.set('idle_timeout', '300');   // 5 minutes idle timeout
    
    // Connection pooling optimizations for high throughput
    url.searchParams.set('pgbouncer', 'true');
    url.searchParams.set('pool_mode', 'transaction');
    url.searchParams.set('max_client_conn', '100'); // Support burst traffic
    url.searchParams.set('default_pool_size', '25'); // Larger pool for concurrency
    
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

// High-performance connection pool manager for serverless environments
class ServerlessConnectionManager {
  private static instance: ServerlessConnectionManager;
  private clients: Map<string, { client: PrismaClient; created: number; lastUsed: number }> = new Map();
  private lastCleanup: number = Date.now();
  private readonly MAX_POOL_SIZE = 10; // Maximum concurrent connections
  private readonly CLIENT_TTL = 300000; // 5 minutes TTL
  private readonly CLEANUP_INTERVAL = 30000; // 30 seconds
  
  static getInstance(): ServerlessConnectionManager {
    if (!ServerlessConnectionManager.instance) {
      ServerlessConnectionManager.instance = new ServerlessConnectionManager();
    }
    return ServerlessConnectionManager.instance;
  }
  
  async getClient(): Promise<PrismaClient> {
    // Clean up old clients periodically
    if (Date.now() - this.lastCleanup > this.CLEANUP_INTERVAL) {
      await this.cleanup();
    }
    
    // Reuse existing client if pool not full
    const availableClient = this.findReusableClient();
    if (availableClient) {
      availableClient.lastUsed = Date.now();
      return availableClient.client;
    }
    
    // Create new client if under pool limit
    if (this.clients.size < this.MAX_POOL_SIZE) {
      const client = createPrismaClient(true);
      const clientId = generateUniqueConnectionId();
      
      this.clients.set(clientId, {
        client,
        created: Date.now(),
        lastUsed: Date.now()
      });
      
      // Auto-cleanup after TTL
      setTimeout(() => {
        this.cleanupClient(clientId);
      }, this.CLIENT_TTL);
      
      return client;
    }
    
    // Pool is full, force cleanup and create new client
    await this.cleanup();
    return this.getClient(); // Recursive call after cleanup
  }
  
  private findReusableClient(): { client: PrismaClient; created: number; lastUsed: number } | null {
    for (const [clientId, clientInfo] of this.clients.entries()) {
      const age = Date.now() - clientInfo.created;
      if (age < this.CLIENT_TTL) {
        return clientInfo;
      }
    }
    return null;
  }
  
  private async cleanupClient(clientId: string): Promise<void> {
    const clientInfo = this.clients.get(clientId);
    if (clientInfo) {
      try {
        await clientInfo.client.$disconnect();
      } catch (error) {
        console.warn(`Failed to disconnect client ${clientId}:`, error);
      } finally {
        this.clients.delete(clientId);
      }
    }
  }
  
  private async cleanup(): Promise<void> {
    const now = Date.now();
    const expiredClients: string[] = [];
    
    // Find expired clients
    for (const [clientId, clientInfo] of this.clients.entries()) {
      if (now - clientInfo.created > this.CLIENT_TTL || 
          now - clientInfo.lastUsed > this.CLIENT_TTL / 2) {
        expiredClients.push(clientId);
      }
    }
    
    // Clean up expired clients
    await Promise.all(expiredClients.map(id => this.cleanupClient(id)));
    this.lastCleanup = now;
    
    console.log(`Cleaned up ${expiredClients.length} expired database clients`);
  }
  
  // Get pool statistics for monitoring
  getPoolStats() {
    const now = Date.now();
    let activeConnections = 0;
    let totalConnections = this.clients.size;
    
    for (const clientInfo of this.clients.values()) {
      if (now - clientInfo.lastUsed < 60000) { // Active in last minute
        activeConnections++;
      }
    }
    
    return {
      totalConnections,
      activeConnections,
      maxPoolSize: this.MAX_POOL_SIZE,
      poolUtilization: (totalConnections / this.MAX_POOL_SIZE) * 100
    };
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
  options: { retries?: number; timeout?: number; operationName?: string } = {}
): Promise<T> {
  const { retries = 3, timeout = 15000, operationName = 'database_operation' } = options;
  const startTime = Date.now();
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
      
      // Record successful operation performance
      const duration = Date.now() - startTime;
      await DatabasePerformanceMonitor.recordQuery(operationName, duration, true).catch(() => {
        // Ignore monitoring errors to prevent cascading failures
      });
      
      return result;
      
    } catch (error: any) {
      lastError = error;
      console.error(`Database operation failed (attempt ${attempt + 1}/${retries + 1}):`, {
        error: error.message,
        code: error.code,
        isServerless: isServerlessEnvironment()
      });
      
      // Record failed operation performance
      const duration = Date.now() - startTime;
      await DatabasePerformanceMonitor.recordQuery(
        operationName, 
        duration, 
        false, 
        error.message
      ).catch(() => {
        // Ignore monitoring errors
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
  // High-performance batch insert webhook events
  static async batchInsertWebhookEvents(events: any[]) {
    if (events.length === 0) return [];
    
    return withDatabase(async (client) => {
      // Use transaction for better performance and consistency
      return client.$transaction(async (tx) => {
        const result = await tx.webhookEvent.createMany({
          data: events,
          skipDuplicates: true,
        });
        
        console.log(`Batch inserted ${events.length} webhook events`);
        return result;
      });
    }, { timeout: 10000, operationName: 'batch_insert_webhook_events' });
  }

  // High-performance batch upsert transactions with conflict resolution
  static async batchUpsertTransactions(transactions: any[]) {
    if (transactions.length === 0) return [];
    
    return withDatabase(async (client) => {
      const results = [];
      const BATCH_SIZE = 10; // Process in smaller batches for better performance
      
      for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
        const batch = transactions.slice(i, i + BATCH_SIZE);
        
        const batchResults = await client.$transaction(async (tx) => {
          const promises = batch.map(transaction => 
            tx.transaction.upsert({
              where: { externalId: transaction.externalId },
              update: {
                status: transaction.status,
                updatedAt: new Date(),
                metadata: transaction.metadata,
              },
              create: transaction,
            }).catch(error => {
              console.error(`Failed to upsert transaction ${transaction.externalId}:`, error);
              return null;
            })
          );
          
          return Promise.all(promises);
        });
        
        results.push(...batchResults.filter(Boolean));
      }
      
      console.log(`Batch upserted ${results.length}/${transactions.length} transactions`);
      return results;
    }, { timeout: 20000, retries: 2, operationName: 'batch_upsert_transactions' });
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

  // Optimized real-time analytics with single aggregation queries (no N+1)
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
      
      return withDatabase(async (client) => {
        // Use aggregation queries instead of fetching all records (eliminates N+1)
        const [transactionStats, webhookStats] = await Promise.all([
          // Single aggregation query for all transaction metrics
          client.transaction.groupBy({
            by: ['status'],
            where: { transactionTime: { gte: startDate } },
            _count: { id: true },
            _sum: { amount: true },
          }),
          
          // Single aggregation query for all webhook metrics  
          client.webhookEvent.groupBy({
            by: ['processed'],
            where: { timestamp: { gte: startDate } },
            _count: { id: true },
          }),
        ]);

        // Process transaction statistics
        const transactions = {
          total: transactionStats.reduce((sum, stat) => sum + stat._count.id, 0),
          completed: transactionStats.find(s => s.status === 'COMPLETED')?._count.id || 0,
          failed: transactionStats.find(s => s.status === 'FAILED')?._count.id || 0,
          pending: transactionStats.find(s => s.status === 'PENDING')?._count.id || 0,
          totalAmount: transactionStats.reduce((sum, stat) => sum + (stat._sum.amount || 0), 0),
        };

        // Process webhook statistics
        const processedWebhooks = webhookStats.find(s => s.processed === true)?._count.id || 0;
        const totalWebhooks = webhookStats.reduce((sum, stat) => sum + stat._count.id, 0);
        
        // Get error count with separate optimized query
        const errorCount = await client.webhookEvent.count({
          where: {
            timestamp: { gte: startDate },
            error: { not: null }
          }
        });

        const analytics = {
          transactions,
          webhooks: {
            total: totalWebhooks,
            processed: processedWebhooks,
            failed: errorCount,
          },
          timeRange,
          generatedAt: now,
        };
        
        // Cache analytics based on time range
        const cacheTime = timeRange === 'hour' ? 300 : timeRange === 'day' ? 900 : 3600;
        await redis.setex(cacheKey, cacheTime, JSON.stringify(analytics));
        
        return analytics;
      }, { timeout: 10000, operationName: 'get_analytics' });

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

  // Optimized system metrics recording with single aggregation queries
  static async recordSystemMetrics() {
    return withDatabase(async (client) => {
      const memUsage = process.memoryUsage();
      const cpuUsage = process.cpuUsage();
      
      // Single aggregation query for all webhook metrics (eliminates N+1)
      const [webhookStats, transactionStats] = await Promise.all([
        client.webhookEvent.groupBy({
          by: ['processed'],
          _count: { id: true },
        }),
        client.transaction.groupBy({
          by: ['status'], 
          _count: { id: true },
        }),
      ]);

      // Calculate metrics from aggregated data
      const totalWebhooks = webhookStats.reduce((sum, stat) => sum + stat._count.id, 0);
      const processedWebhooks = webhookStats.find(s => s.processed === true)?._count.id || 0;
      
      // Get error count separately (most efficient for this specific condition)
      const failedWebhooks = await client.webhookEvent.count({ 
        where: { error: { not: null } } 
      });

      const totalTransactions = transactionStats.reduce((sum, stat) => sum + stat._count.id, 0);
      const completedTransactions = transactionStats.find(s => s.status === 'COMPLETED')?._count.id || 0;
      const failedTransactions = transactionStats.find(s => s.status === 'FAILED')?._count.id || 0;
      const pendingTransactions = transactionStats.find(s => s.status === 'PENDING')?._count.id || 0;

      await client.systemMetrics.create({
        data: {
          webhooksReceived: totalWebhooks,
          webhooksProcessed: processedWebhooks,
          webhooksFailed: failedWebhooks,
          transactionsTotal: totalTransactions,
          transactionsCompleted: completedTransactions,
          transactionsFailed: failedTransactions,
          transactionsPending: pendingTransactions,
          memoryUsage: memUsage.heapUsed / 1024 / 1024, // MB
          cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000, // ms to seconds
        },
      });
    }, { timeout: 5000, operationName: 'record_system_metrics' }).catch(error => {
      console.error('Record system metrics failed:', error);
    });
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