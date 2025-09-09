import Queue from 'bull';
import { WebhookEvent } from '@/types/webhook';
import { webhookStorePersistent } from '@/lib/webhook-store-persistent';
import { redis } from '@/lib/database';
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

// Create webhook processing queue with Redis connection
export const webhookQueue = new Queue<WebhookJobData>('webhook processing', {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || '0'),
    // Connection pool optimization
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    family: 4,
    lazyConnect: true,
    keepAlive: 30000,
  },
  defaultJobOptions: {
    removeOnComplete: 100, // Keep only last 100 completed jobs
    removeOnFail: 50,      // Keep only last 50 failed jobs
    attempts: 3,           // Retry failed jobs 3 times
    backoff: {
      type: 'exponential',
      delay: 2000,         // Start with 2 second delay
    },
    delay: 0,              // Process immediately
  },
  settings: {
    stalledInterval: 30000,    // Check for stalled jobs every 30 seconds
    maxStalledCount: 1,        // Max stalled jobs before considered failed
  },
});

// Webhook deduplication using Redis
class WebhookDeduplicator {
  private readonly DEDUP_KEY_PREFIX = 'webhook_dedup:';
  private readonly DEFAULT_TTL = 3600; // 1 hour

  async isDuplicate(webhookId: string, signature?: string): Promise<boolean> {
    try {
      // Create deduplication key from webhook ID and signature
      const dedupKey = this.createDedupKey(webhookId, signature);
      const exists = await redis.exists(dedupKey);
      return exists === 1;
    } catch (error) {
      console.warn('Deduplication check failed:', error);
      return false; // Allow processing if dedup check fails
    }
  }

  async markProcessed(webhookId: string, signature?: string, ttlSeconds = this.DEFAULT_TTL): Promise<void> {
    try {
      const dedupKey = this.createDedupKey(webhookId, signature);
      await redis.setex(dedupKey, ttlSeconds, Date.now().toString());
    } catch (error) {
      console.warn('Failed to mark webhook as processed:', error);
    }
  }

  private createDedupKey(webhookId: string, signature?: string): string {
    const data = signature ? `${webhookId}:${signature}` : webhookId;
    const hash = crypto.createHash('sha256').update(data).digest('hex');
    return `${this.DEDUP_KEY_PREFIX}${hash}`;
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
      const cached = await redis.get(cacheKey);
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.warn('Failed to get cached secret:', error);
      return null;
    }
  }

  private async cacheSecret(endpoint: string, secretData: { key: string; algorithm: string }): Promise<void> {
    try {
      const cacheKey = `${this.CACHE_KEY_PREFIX}${endpoint}`;
      await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(secretData));
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

// Queue processing logic
webhookQueue.process('*', async (job) => {
  const startTime = Date.now();
  const { webhookEvent, rawBody, signature, headers } = job.data;

  try {
    console.log(`Processing webhook job: ${job.id} - ${webhookEvent.id}`);

    // Skip processing if webhook is duplicate
    const isDuplicate = await webhookDeduplicator.isDuplicate(webhookEvent.id, signature);
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

    // Mark as processed for deduplication
    await webhookDeduplicator.markProcessed(webhookEvent.id, signature);

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

// Smart cache invalidation based on webhook content
async function performSmartCacheInvalidation(webhookEvent: WebhookEvent): Promise<void> {
  try {
    const eventType = webhookEvent.eventType.toLowerCase();
    const payload = webhookEvent.payload;
    
    // Extract company ID if available
    const companyId = payload.companyId || payload.eventData?.companyId;
    
    // Payment-related events invalidate transactions and analytics
    if (eventType.includes('payment') || eventType.includes('transaction')) {
      console.log('Invalidating payment-related caches for webhook:', webhookEvent.id);
      
      await Promise.all([
        CacheInvalidator.invalidateTransactions(companyId),
        CacheInvalidator.invalidateAnalytics(companyId),
      ]);
    }
    
    // Account-related events invalidate accounts cache
    else if (eventType.includes('account') || eventType.includes('customer')) {
      console.log('Invalidating account-related caches for webhook:', webhookEvent.id);
      
      await CacheInvalidator.invalidateAccounts(companyId);
    }
    
    // High-impact events invalidate all caches
    else if (eventType.includes('error') || eventType.includes('failed') || eventType.includes('refund')) {
      console.log('Invalidating all caches due to high-impact webhook:', webhookEvent.id);
      
      await Promise.all([
        CacheInvalidator.invalidateTransactions(companyId),
        CacheInvalidator.invalidateAnalytics(companyId),
        CacheInvalidator.invalidateAccounts(companyId),
      ]);
    }
    
    // Default: always invalidate analytics for new data
    else {
      await CacheInvalidator.invalidateAnalytics(companyId);
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