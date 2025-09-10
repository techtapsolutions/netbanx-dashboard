import Queue from 'bull';
import { WebhookEvent } from '@/types/webhook';
import { webhookStorePersistent } from '@/lib/webhook-store-persistent';
import { redis, redisForBull } from '@/lib/database';
import { RedisConnectionManager } from '@/lib/redis-config';
import crypto from 'crypto';
import { optimizedWebhookSecretStore } from '@/lib/webhook-secret-store-optimized';
import { CacheInvalidator } from '@/lib/api-cache';

// Define job data interfaces
interface WebhookJobData {
  webhookEvent: WebhookEvent;
  rawBody: string;
  signature?: string;
  headers: Record<string, string>;
  timestamp: string;
}

interface WebhookProcessResult {
  success: boolean;
  webhookId: string;
  processingTime: number;
  error?: string;
}

// Create webhook processing queue with OPTIMIZED production Redis connection
export const webhookQueue = new Queue<WebhookJobData>('webhook processing', {
  redis: redisForBull, // Use IORedis instance for Bull.js compatibility
  defaultJobOptions: {
    removeOnComplete: 500,  // Keep more completed jobs for debugging
    removeOnFail: 100,      // Keep more failed jobs for analysis
    attempts: 3,            // Retry failed jobs 3 times
    backoff: {
      type: 'exponential',
      delay: 500,           // Reduced from 2000ms - Start with 500ms delay for faster retries
    },
    delay: 0,               // Process immediately
  },
  settings: {
    stalledInterval: 10000,     // Reduced from 30s - Check for stalled jobs every 10 seconds
    maxStalledCount: 2,         // Increased tolerance for stalled jobs
    lockDuration: 30000,        // 30 second lock duration
    lockRenewTime: 15000,       // Renew lock every 15 seconds
  },
});

// Enhanced webhook deduplication using multiple identifiers
class WebhookDeduplicator {
  private readonly DEDUP_KEY_PREFIX = 'webhook_dedup:';
  private readonly DEFAULT_TTL = 3600; // 1 hour

  /**
   * Check if webhook is duplicate using multi-level deduplication strategy
   * Checks: webhook ID, transaction ID, payload ID, and merchant reference
   */
  async isDuplicate(
    webhookId: string, 
    payload?: WebhookPayload,
    signature?: string
  ): Promise<boolean> {
    try {
      // Create all possible deduplication keys
      const dedupKeys = this.createAllDedupKeys(webhookId, payload, signature);
      
      // Check all keys in parallel for better performance
      const existsPromises = dedupKeys.map(key => 
        RedisConnectionManager.exists(key).catch(() => 0)
      );
      
      const results = await Promise.all(existsPromises);
      
      // If ANY deduplication key exists, it's a duplicate
      const isDuplicate = results.some(exists => exists === 1);
      
      if (isDuplicate) {
        console.log(`Duplicate detected for webhook ${webhookId}`, {
          webhookId,
          payloadId: payload?.id,
          transactionId: payload?.eventData?.id,
          merchantRef: payload?.eventData?.merchantRefNum,
          dedupKeys: dedupKeys.filter((key, index) => results[index] === 1)
        });
      }
      
      return isDuplicate;
    } catch (error) {
      console.warn('Deduplication check failed:', error);
      return false; // Allow processing if dedup check fails
    }
  }

  /**
   * Mark webhook as processed using all identifiers
   */
  async markProcessed(
    webhookId: string,
    payload?: WebhookPayload, 
    signature?: string, 
    ttlSeconds = this.DEFAULT_TTL
  ): Promise<void> {
    try {
      const dedupKeys = this.createAllDedupKeys(webhookId, payload, signature);
      const timestamp = Date.now().toString();
      
      // Mark all deduplication keys in parallel
      const setPromises = dedupKeys.map(key =>
        RedisConnectionManager.setex(key, ttlSeconds, timestamp).catch(error => {
          console.warn(`Failed to set dedup key ${key}:`, error);
        })
      );
      
      await Promise.all(setPromises);
      
      console.log(`Marked webhook ${webhookId} as processed with ${dedupKeys.length} dedup keys`);
    } catch (error) {
      console.warn('Failed to mark webhook as processed:', error);
    }
  }

  /**
   * Create all deduplication keys for multi-level checking
   */
  private createAllDedupKeys(
    webhookId: string,
    payload?: WebhookPayload,
    signature?: string
  ): string[] {
    const keys: string[] = [];
    
    // Primary: webhook ID + signature (original logic)
    keys.push(this.createDedupKey('webhook', webhookId, signature));
    
    if (payload) {
      // Secondary: transaction ID from eventData
      if (payload.eventData?.id) {
        keys.push(this.createDedupKey('transaction', payload.eventData.id));
      }
      
      // Tertiary: payload ID
      if (payload.id) {
        keys.push(this.createDedupKey('payload', payload.id));
      }
      
      // Quaternary: merchant reference number
      if (payload.eventData?.merchantRefNum) {
        keys.push(this.createDedupKey('merchant_ref', payload.eventData.merchantRefNum));
      }
      
      // Additional: combination of payload ID + transaction ID for extra safety
      if (payload.id && payload.eventData?.id) {
        keys.push(this.createDedupKey('composite', `${payload.id}:${payload.eventData.id}`));
      }
    }
    
    return keys;
  }

  /**
   * Create a single deduplication key with namespace
   */
  private createDedupKey(namespace: string, data: string, signature?: string): string {
    const keyData = signature ? `${data}:${signature}` : data;
    const hash = crypto.createHash('sha256').update(keyData).digest('hex');
    return `${this.DEDUP_KEY_PREFIX}${namespace}:${hash}`;
  }

  /**
   * Clear deduplication keys for a specific identifier (useful for debugging)
   */
  async clearDedupKeys(
    webhookId?: string,
    payload?: WebhookPayload,
    signature?: string
  ): Promise<number> {
    try {
      if (!webhookId && !payload) {
        console.warn('No identifiers provided for clearing dedup keys');
        return 0;
      }

      const dedupKeys = this.createAllDedupKeys(
        webhookId || '',
        payload,
        signature
      );

      let cleared = 0;
      for (const key of dedupKeys) {
        const result = await RedisConnectionManager.del(key).catch(() => 0);
        if (result > 0) cleared++;
      }

      console.log(`Cleared ${cleared} deduplication keys`);
      return cleared;
    } catch (error) {
      console.error('Failed to clear dedup keys:', error);
      return 0;
    }
  }

  /**
   * Get deduplication status for debugging
   */
  async getDedupStatus(
    webhookId: string,
    payload?: WebhookPayload,
    signature?: string
  ): Promise<{ [key: string]: boolean }> {
    try {
      const dedupKeys = this.createAllDedupKeys(webhookId, payload, signature);
      const status: { [key: string]: boolean } = {};

      for (const key of dedupKeys) {
        const exists = await RedisConnectionManager.exists(key).catch(() => 0);
        // Extract readable name from key
        const keyName = key.replace(this.DEDUP_KEY_PREFIX, '').split(':')[0];
        status[keyName] = exists === 1;
      }

      return status;
    } catch (error) {
      console.error('Failed to get dedup status:', error);
      return {};
    }
  }
}

export const webhookDeduplicator = new WebhookDeduplicator();

// Optimized signature validation with caching
class OptimizedSignatureValidator {
  private readonly CACHE_KEY_PREFIX = 'webhook_secret:';
  private readonly CACHE_TTL = 300; // 5 minutes

  async validateSignature(
    body: string,
    signature: string | null,
    endpoint: string
  ): Promise<boolean> {
    if (!signature) {
      console.warn('No signature provided in webhook request');
      return process.env.NODE_ENV !== 'production';
    }

    try {
      // Try cached secret first
      const cachedSecret = await this.getCachedSecret(endpoint);
      if (cachedSecret) {
        return this.performValidation(body, signature, cachedSecret.key, cachedSecret.algorithm);
      }

      // Use optimized batch loading (eliminates N+1 queries)
      const secretData = await optimizedWebhookSecretStore.getWebhookSecret(endpoint);
      if (secretData) {
        // Cache the secret for future use
        await this.cacheSecret(endpoint, secretData);
        return this.performValidation(body, signature, secretData.key, secretData.algorithm);
      }

      // Final fallback to hardcoded key
      console.warn(`No secret found for endpoint ${endpoint}, using fallback`);
      const fallbackSecret = 'YzM2ZjA4OGYyMjAxODA3MmRkYjBkZjA1ZmY2MzM2MjNmZmVjZDAzZjFiYWMyMjlkZTc0YTg3MGEyNDg1NjIxNg==';
      return this.performValidation(body, signature, fallbackSecret, 'sha256');

    } catch (error) {
      console.error('Signature validation error:', error);
      return false;
    }
  }

  private async getCachedSecret(endpoint: string): Promise<{ key: string; algorithm: string } | null> {
    try {
      const cacheKey = `${this.CACHE_KEY_PREFIX}${endpoint}`;
      const cached = await RedisConnectionManager.get(cacheKey);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.warn('Failed to get cached secret:', error);
      return null;
    }
  }

  private async cacheSecret(endpoint: string, secretData: { key: string; algorithm: string }): Promise<void> {
    try {
      const cacheKey = `${this.CACHE_KEY_PREFIX}${endpoint}`;
      await RedisConnectionManager.setex(cacheKey, this.CACHE_TTL, JSON.stringify(secretData));
    } catch (error) {
      console.warn('Failed to cache secret:', error);
    }
  }

  private performValidation(body: string, signature: string, secretKey: string, algorithm = 'sha256'): boolean {
    try {
      // Single-pass validation (no more multiple attempts)
      const secret = Buffer.from(secretKey, 'base64').toString('utf-8');
      const computedSignature = crypto.createHmac(algorithm, secret).update(body, 'utf8').digest('hex');
      
      // Check common signature formats
      const expectedFormats = [
        computedSignature,
        computedSignature.toUpperCase(),
        `${algorithm}=${computedSignature}`,
        `${algorithm.toUpperCase()}=${computedSignature}`,
      ];

      const isValid = expectedFormats.includes(signature);
      
      if (!isValid) {
        console.warn('Signature validation failed:', {
          provided: signature,
          computed: computedSignature,
          algorithm,
        });
      }

      return isValid;
    } catch (error) {
      console.error('Signature computation error:', error);
      return false;
    }
  }
}

export const signatureValidator = new OptimizedSignatureValidator();

// Queue processing logic with INCREASED CONCURRENCY for faster processing
webhookQueue.process('*', 5, async (job) => {  // Process 5 jobs concurrently
  const startTime = Date.now();
  const { webhookEvent, rawBody, signature, headers } = job.data;

  try {
    console.log(`Processing webhook job: ${job.id} - ${webhookEvent.id}`);

    // Enhanced deduplication: check multiple identifiers
    const isDuplicate = await webhookDeduplicator.isDuplicate(
      webhookEvent.id, 
      webhookEvent.payload,
      signature
    );
    
    if (isDuplicate) {
      console.log(`Skipping duplicate webhook: ${webhookEvent.id}`);
      return {
        success: true,
        webhookId: webhookEvent.id,
        processingTime: Date.now() - startTime,
        skipped: true,
      };
    }

    // Validate signature (if enabled)
    if (process.env.WEBHOOK_SIGNATURE_VALIDATION !== 'false') {
      const isValidSignature = await signatureValidator.validateSignature(
        rawBody,
        signature,
        webhookEvent.source
      );
      
      if (!isValidSignature && process.env.NODE_ENV === 'production') {
        throw new Error('Invalid webhook signature');
      }
    }

    // Process the webhook event
    await webhookStorePersistent.addWebhookEvent(webhookEvent);

    // Mark as processed with all identifiers for comprehensive deduplication
    await webhookDeduplicator.markProcessed(
      webhookEvent.id,
      webhookEvent.payload,
      signature
    );

    // Smart cache invalidation based on webhook type
    await performSmartCacheInvalidation(webhookEvent);

    const processingTime = Date.now() - startTime;
    console.log(`Successfully processed webhook ${webhookEvent.id} in ${processingTime}ms`);

    // Update processing metrics
    await updateWebhookMetrics('success', processingTime);

    return {
      success: true,
      webhookId: webhookEvent.id,
      processingTime,
    };

  } catch (error) {
    const processingTime = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    console.error(`Failed to process webhook ${webhookEvent.id}:`, error);

    // Store failed webhook event
    const failedEvent: WebhookEvent = {
      ...webhookEvent,
      processed: false,
      error: errorMessage,
    };

    try {
      await webhookStorePersistent.addWebhookEvent(failedEvent);
    } catch (storeError) {
      console.error('Failed to store failed webhook event:', storeError);
    }

    // Update processing metrics
    await updateWebhookMetrics('failure', processingTime);

    throw error; // Let Bull handle retry logic
  }
});

// Queue event listeners for monitoring
webhookQueue.on('completed', (job, result: WebhookProcessResult) => {
  console.log(`Webhook job ${job.id} completed:`, {
    webhookId: result.webhookId,
    processingTime: result.processingTime,
  });
});

webhookQueue.on('failed', (job, err) => {
  console.error(`Webhook job ${job.id} failed:`, err.message);
});

webhookQueue.on('stalled', (job) => {
  console.warn(`Webhook job ${job.id} stalled`);
});

// Webhook queue management functions
export class WebhookQueueManager {
  static async addWebhookJob(
    webhookEvent: WebhookEvent,
    rawBody: string,
    signature?: string,
    headers: Record<string, string> = {}
  ): Promise<string> {
    try {
      const job = await webhookQueue.add('process', {
        webhookEvent,
        rawBody,
        signature,
        headers,
        timestamp: new Date().toISOString(),
      }, {
        priority: webhookEvent.eventType.includes('PAYMENT') ? 10 : 5, // Prioritize payment events
        delay: 0, // Process immediately
      });

      console.log(`Added webhook job ${job.id} for webhook ${webhookEvent.id}`);
      return job.id.toString();
    } catch (error) {
      console.error('Failed to add webhook job:', error);
      throw error;
    }
  }

  static async getQueueStats() {
    try {
      const [waiting, active, completed, failed, delayed] = await Promise.all([
        webhookQueue.getWaiting(),
        webhookQueue.getActive(),
        webhookQueue.getCompleted(),
        webhookQueue.getFailed(),
        webhookQueue.getDelayed(),
      ]);

      return {
        waiting: waiting.length,
        active: active.length,
        completed: completed.length,
        failed: failed.length,
        delayed: delayed.length,
        total: waiting.length + active.length + completed.length + failed.length + delayed.length,
      };
    } catch (error) {
      console.error('Failed to get queue stats:', error);
      return {
        waiting: 0,
        active: 0,
        completed: 0,
        failed: 0,
        delayed: 0,
        total: 0,
      };
    }
  }

  static async pauseQueue(): Promise<void> {
    await webhookQueue.pause();
  }

  static async resumeQueue(): Promise<void> {
    await webhookQueue.resume();
  }

  static async cleanQueue(): Promise<void> {
    await Promise.all([
      webhookQueue.clean(24 * 60 * 60 * 1000, 'completed'), // Clean completed jobs older than 24 hours
      webhookQueue.clean(24 * 60 * 60 * 1000, 'failed'),    // Clean failed jobs older than 24 hours
    ]);
  }
}

// Smart cache invalidation based on webhook content - OPTIMIZED for performance
async function performSmartCacheInvalidation(webhookEvent: WebhookEvent): Promise<void> {
  try {
    const eventType = webhookEvent.eventType.toLowerCase();
    const payload = webhookEvent.payload;
    
    // Extract company ID if available
    const companyId = payload.companyId || payload.eventData?.companyId;
    
    // OPTIMIZED: Use selective cache invalidation to reduce overhead
    // Only invalidate specific cache keys instead of entire categories
    
    // Payment-related events - invalidate only specific cache keys
    if (eventType.includes('payment') || eventType.includes('transaction')) {
      console.log('Selective cache invalidation for payment webhook:', webhookEvent.id);
      
      // Invalidate only the specific data API caches, not all caches
      const cacheKeys = [
        `api:data:v2:transactions:${companyId || 'all'}:*`,
        `api:data:v2:stats:${companyId || 'all'}:*`,
      ];
      
      for (const pattern of cacheKeys) {
        const keys = await redis.keys(pattern);
        if (keys.length > 0 && keys.length < 100) {  // Safety limit
          await redis.del(...keys);
        }
      }
    }
    
    // Account-related events - minimal invalidation
    else if (eventType.includes('account') || eventType.includes('customer')) {
      console.log('Selective cache invalidation for account webhook:', webhookEvent.id);
      
      // Only invalidate account-specific caches
      const pattern = `api:data:v2:accounts:${companyId || 'all'}:*`;
      const keys = await redis.keys(pattern);
      if (keys.length > 0 && keys.length < 50) {
        await redis.del(...keys);
      }
    }
    
    // High-impact events - targeted invalidation
    else if (eventType.includes('error') || eventType.includes('failed') || eventType.includes('refund')) {
      console.log('Targeted cache invalidation for high-impact webhook:', webhookEvent.id);
      
      // Invalidate only the most critical caches
      const patterns = [
        `api:data:v2:transactions:${companyId || 'all'}:*`,
        `api:data:v2:stats:${companyId || 'all'}:*`,
      ];
      
      for (const pattern of patterns) {
        const keys = await redis.keys(pattern);
        if (keys.length > 0 && keys.length < 100) {
          await redis.del(...keys);
        }
      }
    }
    
    // Low-priority events: skip cache invalidation for better performance
    else {
      console.log('Skipping cache invalidation for low-priority webhook:', webhookEvent.eventType);
      // Don't invalidate cache for every webhook - reduces overhead significantly
    }
    
  } catch (error) {
    console.warn('Smart cache invalidation failed:', error);
    // Don't fail webhook processing due to cache invalidation issues
  }
}

// Webhook processing metrics
async function updateWebhookMetrics(type: 'success' | 'failure', processingTime: number): Promise<void> {
  try {
    const metricsKey = 'webhook_metrics';
    const currentHour = new Date().getHours();
    const hourKey = `${metricsKey}:${currentHour}`;

    await redis.hincrby(hourKey, `${type}_count`, 1);
    await redis.hincrbyfloat(hourKey, `${type}_processing_time`, processingTime);
    await redis.expire(hourKey, 3600 * 25); // Keep metrics for 25 hours
  } catch (error) {
    console.warn('Failed to update webhook metrics:', error);
  }
}

// Queue is already exported at the top of the file

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Shutting down webhook queue...');
  await webhookQueue.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down webhook queue...');
  await webhookQueue.close();
  process.exit(0);
});