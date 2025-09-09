import { Transaction } from '@/types/paysafe';
import { WebhookEvent, WebhookStats } from '@/types/webhook';
import { v4 as uuidv4 } from 'uuid';
import { withDatabase, DatabaseService, redis } from '@/lib/database';

interface BatchProcessingOptions {
  batchSize: number;
  maxBatchTime: number;
  maxRetries: number;
}

class PersistentWebhookStore {
  private eventQueue: WebhookEvent[] = [];
  private transactionQueue: Transaction[] = [];
  private processingBatch = false;
  private batchTimeout: NodeJS.Timeout | null = null;
  
  private options: BatchProcessingOptions = {
    batchSize: 25,
    maxBatchTime: 2000, // 2 seconds
    maxRetries: 3,
  };

  constructor() {
    this.startBatchProcessor();
  }

  /**
   * Add webhook event with automatic database persistence
   * Non-blocking operation that queues events for batch processing
   */
  async addWebhookEvent(event: WebhookEvent): Promise<void> {
    try {
      // Add to queue for batch processing
      this.eventQueue.push(event);
      
      // Convert to transaction if it's a payment event
      if (this.isPaymentEvent(event)) {
        const transaction = this.convertToTransaction(event);
        this.transactionQueue.push(transaction);
      }

      // Trigger batch processing if queue is full
      if (this.eventQueue.length >= this.options.batchSize) {
        this.processBatch();
      }

      // Also store in cache for immediate access
      const cacheKey = `webhook_events:recent`;
      try {
        const recentEvents = await this.getCachedEvents();
        recentEvents.unshift(event);
        // Keep only last 100 in cache
        const trimmed = recentEvents.slice(0, 100);
        await redis.setex(cacheKey, 300, JSON.stringify(trimmed)); // 5 min cache
      } catch (cacheError) {
        console.warn('Cache operation failed:', cacheError);
      }

    } catch (error) {
      console.error('Error adding webhook event:', error);
      
      // Create alert for failed webhook processing
      try {
        await DatabaseService.createAlert(
          'ERROR',
          'Webhook Processing Failed',
          `Failed to process webhook event: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { webhookId: event.id, eventType: event.eventType }
        );
      } catch (alertError) {
        console.error('Failed to create alert:', alertError);
      }
      
      throw error;
    }
  }

  /**
   * Get webhook events with database persistence and caching
   */
  async getWebhookEvents(limit: number = 100): Promise<WebhookEvent[]> {
    try {
      // Try cache first for better performance
      const cacheKey = `webhook_events:${limit}`;
      const cached = await redis.get(cacheKey);
      
      if (cached) {
        return JSON.parse(cached);
      }

      // Fallback to database
      const events = await withDatabase(async (db) => {
        return await db.webhookEvent.findMany({
          orderBy: { timestamp: 'desc' },
          take: limit,
        });
      });

      // Transform database format to expected format
      const transformedEvents: WebhookEvent[] = events.map(event => ({
        id: event.id,
        timestamp: event.timestamp.toISOString(),
        eventType: event.eventType,
        source: event.source,
        payload: event.payload as any,
        processed: event.processed,
        error: event.error || undefined,
      }));

      // Cache the results
      await redis.setex(cacheKey, 300, JSON.stringify(transformedEvents));
      
      return transformedEvents;
    } catch (error) {
      console.error('Error getting webhook events:', error);
      
      // Return empty array as fallback
      return [];
    }
  }

  /**
   * Get transactions with database persistence and caching
   */
  async getTransactions(): Promise<Transaction[]> {
    try {
      const result = await DatabaseService.getTransactionsPaginated(1, 1000);
      
      // Transform database format to expected format
      return result.transactions.map(t => ({
        id: t.externalId,
        merchantRefNum: t.merchantRefNum,
        amount: t.amount,
        currency: t.currency,
        status: t.status as any,
        transactionType: t.transactionType,
        paymentMethod: t.paymentMethod,
        createdAt: t.createdAt.toISOString(),
        updatedAt: t.updatedAt.toISOString(),
        description: t.description || undefined,
      }));
    } catch (error) {
      console.error('Error getting transactions:', error);
      return [];
    }
  }

  /**
   * Get webhook statistics with real-time database queries
   */
  async getWebhookStats(): Promise<WebhookStats> {
    try {
      const analytics = await DatabaseService.getAnalytics('day');
      
      return {
        totalReceived: analytics.webhooks.total,
        successfullyProcessed: analytics.webhooks.processed,
        failed: analytics.webhooks.failed,
        lastReceived: analytics.generatedAt.toISOString(),
      };
    } catch (error) {
      console.error('Error getting webhook stats:', error);
      
      // Return default stats as fallback
      return {
        totalReceived: 0,
        successfullyProcessed: 0,
        failed: 0,
        lastReceived: undefined,
      };
    }
  }

  /**
   * Clear all data (for testing/development)
   */
  async clearData(): Promise<void> {
    try {
      await withDatabase(async (db) => {
        await Promise.all([
          db.webhookEvent.deleteMany(),
          db.transaction.deleteMany(),
        ]);
      });

      // Clear caches
      const keys = await redis.keys('webhook_events:*');
      if (keys.length > 0) {
        await redis.del(...keys);
      }
      
      // Clear queues
      this.eventQueue = [];
      this.transactionQueue = [];
      
      console.log('All webhook data cleared');
    } catch (error) {
      console.error('Error clearing data:', error);
      throw error;
    }
  }

  /**
   * Generate mock webhook for testing
   */
  generateMockWebhook(eventType: string = 'PAYMENT_COMPLETED'): WebhookEvent {
    const mockEvent: WebhookEvent = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      eventType,
      source: 'netbanx',
      processed: true,
      payload: {
        id: `pay_${Date.now()}`,
        eventType,
        eventData: {
          id: `pay_${Date.now()}`,
          merchantRefNum: `ORDER_${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          amount: Math.floor(Math.random() * 50000) / 100, // Random amount between 0-500
          currencyCode: 'USD',
          status: eventType.includes('COMPLETED') ? 'COMPLETED' : 
                  eventType.includes('FAILED') ? 'FAILED' : 'PENDING',
          txnTime: new Date().toISOString(),
          card: {
            type: ['VISA', 'MASTERCARD', 'AMEX'][Math.floor(Math.random() * 3)],
            lastDigits: Math.floor(Math.random() * 9999).toString().padStart(4, '0'),
            holderName: 'John Doe',
          },
        },
      },
    };

    return mockEvent;
  }

  // Private methods

  private async getCachedEvents(): Promise<WebhookEvent[]> {
    try {
      const cached = await redis.get('webhook_events:recent');
      return cached ? JSON.parse(cached) : [];
    } catch (error) {
      console.warn('Failed to get cached events:', error);
      return [];
    }
  }

  private startBatchProcessor(): void {
    // Process batches periodically
    setInterval(() => {
      if (this.eventQueue.length > 0 || this.transactionQueue.length > 0) {
        this.processBatch();
      }
    }, this.options.maxBatchTime);
  }

  private async processBatch(): Promise<void> {
    if (this.processingBatch || (this.eventQueue.length === 0 && this.transactionQueue.length === 0)) {
      return;
    }

    this.processingBatch = true;

    try {
      const eventsToProcess = this.eventQueue.splice(0, this.options.batchSize);
      const transactionsToProcess = this.transactionQueue.splice(0, this.options.batchSize);

      if (eventsToProcess.length > 0) {
        await this.persistWebhookEvents(eventsToProcess);
      }

      if (transactionsToProcess.length > 0) {
        await this.persistTransactions(transactionsToProcess);
      }

      // Clear cache keys to force refresh on next request
      const cacheKeys = await redis.keys('webhook_events:*');
      if (cacheKeys.length > 0) {
        await redis.del(...cacheKeys);
      }

    } catch (error) {
      console.error('Batch processing failed:', error);
      
      // Create alert
      try {
        await DatabaseService.createAlert(
          'ERROR',
          'Batch Processing Failed',
          `Failed to process webhook batch: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { eventCount: this.eventQueue.length, transactionCount: this.transactionQueue.length }
        );
      } catch (alertError) {
        console.error('Failed to create batch processing alert:', alertError);
      }
    } finally {
      this.processingBatch = false;
    }
  }

  private async persistWebhookEvents(events: WebhookEvent[]): Promise<void> {
    try {
      const dbEvents = events.map(event => ({
        id: event.id,
        timestamp: new Date(event.timestamp),
        eventType: event.eventType,
        source: event.source,
        processed: event.processed,
        error: event.error || null,
        payload: event.payload,
        ipAddress: null,
        userAgent: null,
        signature: null,
        companyId: null,
      }));

      await withDatabase(async (db) => {
        await db.webhookEvent.createMany({
          data: dbEvents,
          skipDuplicates: true,
        });
      });

      console.log(`Persisted ${events.length} webhook events to database`);
    } catch (error) {
      console.error('Failed to persist webhook events:', error);
      throw error;
    }
  }

  private async persistTransactions(transactions: Transaction[]): Promise<void> {
    try {
      const dbTransactions = transactions.map(t => ({
        id: uuidv4(),
        externalId: t.id,
        merchantRefNum: t.merchantRefNum,
        amount: t.amount,
        currency: t.currency,
        status: t.status,
        transactionType: t.transactionType,
        paymentMethod: t.paymentMethod,
        description: t.description || null,
        transactionTime: new Date(t.createdAt),
        metadata: null,
        webhookEventId: null,
        companyId: null,
      }));

      await DatabaseService.batchUpsertTransactions(dbTransactions);

      console.log(`Persisted ${transactions.length} transactions to database`);
    } catch (error) {
      console.error('Failed to persist transactions:', error);
      throw error;
    }
  }

  private isPaymentEvent(event: WebhookEvent): boolean {
    const paymentEvents = [
      'PAYMENT_COMPLETED',
      'PAYMENT_FAILED', 
      'PAYMENT_PENDING',
      'PAYMENT_CANCELLED',
      'PAYMENT_AUTHORIZED',
      'PAYMENT_CAPTURED',
      'PAYMENT_REFUNDED'
    ];
    return paymentEvents.some(type => event.eventType.includes(type) || event.eventType.includes('PAYMENT'));
  }

  private convertToTransaction(event: WebhookEvent): Transaction {
    const eventData = event.payload.eventData || {};
    
    return {
      id: eventData.id || event.payload.id || `webhook-${event.id}`,
      merchantRefNum: eventData.merchantRefNum || `REF-${event.id.substring(0, 8).toUpperCase()}`,
      amount: eventData.amount || 0,
      currency: eventData.currencyCode || 'USD',
      status: this.mapStatus(eventData.status || event.eventType),
      transactionType: 'PAYMENT',
      paymentMethod: eventData.card?.type || 'UNKNOWN',
      createdAt: eventData.txnTime || event.timestamp,
      updatedAt: eventData.updatedTime || event.timestamp,
      description: `Webhook: ${event.eventType}`,
    };
  }

  private mapStatus(status: string): 'COMPLETED' | 'PENDING' | 'FAILED' | 'CANCELLED' {
    const upperStatus = status.toUpperCase();
    if (upperStatus.includes('COMPLETED') || upperStatus.includes('CAPTURED') || upperStatus.includes('SUCCESS')) {
      return 'COMPLETED';
    }
    if (upperStatus.includes('PENDING') || upperStatus.includes('AUTHORIZED')) {
      return 'PENDING';
    }
    if (upperStatus.includes('FAILED') || upperStatus.includes('DECLINED') || upperStatus.includes('ERROR')) {
      return 'FAILED';
    }
    if (upperStatus.includes('CANCELLED') || upperStatus.includes('VOID')) {
      return 'CANCELLED';
    }
    return 'PENDING'; // Default fallback
  }
}

export const persistentWebhookStore = new PersistentWebhookStore();
export const webhookStorePersistent = persistentWebhookStore; // Alias for compatibility