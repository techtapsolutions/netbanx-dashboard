import { withDatabase, redis } from '@/lib/database';
import { decryptSecret } from '@/lib/encryption';
import { ensureWebhookSecretsTable } from '@/lib/db-init';

interface WebhookSecretData {
  key: string;
  algorithm: string;
  endpoint: string;
}

interface CachedSecret {
  key: string;
  algorithm: string;
  lastFetched: number;
}

/**
 * OPTIMIZED WEBHOOK SECRET STORE
 * 
 * Eliminates N+1 queries by:
 * 1. Batch loading all secrets in a single query
 * 2. Long-term caching with intelligent invalidation
 * 3. Centralized secret management
 * 4. Fallback strategies for high availability
 */
export class OptimizedWebhookSecretStore {
  private static instance: OptimizedWebhookSecretStore;
  private secretsCache = new Map<string, CachedSecret>();
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes (much longer than before)
  private readonly REDIS_CACHE_TTL = 1800; // 30 minutes in Redis
  private readonly BATCH_CACHE_KEY = 'webhook_secrets:batch:all';
  private lastBatchFetch = 0;
  private batchFetchPromise: Promise<Map<string, WebhookSecretData>> | null = null;

  static getInstance(): OptimizedWebhookSecretStore {
    if (!OptimizedWebhookSecretStore.instance) {
      OptimizedWebhookSecretStore.instance = new OptimizedWebhookSecretStore();
    }
    return OptimizedWebhookSecretStore.instance;
  }

  /**
   * Get webhook secret with batch loading optimization
   * This is the main method that replaces the individual getWebhookSecret calls
   */
  async getWebhookSecret(endpoint: string): Promise<{ key: string; algorithm: string } | null> {
    try {
      // Check memory cache first (fastest)
      const cached = this.secretsCache.get(endpoint);
      if (cached && (Date.now() - cached.lastFetched) < this.CACHE_TTL) {
        return { key: cached.key, algorithm: cached.algorithm };
      }

      // Get all secrets via batch loading
      const allSecrets = await this.getAllSecretsBatch();
      const secret = allSecrets.get(endpoint);
      
      if (!secret) {
        console.warn(`No webhook secret found for endpoint: ${endpoint}`);
        return null;
      }

      return { key: secret.key, algorithm: secret.algorithm };

    } catch (error) {
      console.error(`Error fetching webhook secret for endpoint ${endpoint}:`, error);
      return null;
    }
  }

  /**
   * Batch load ALL webhook secrets in a single database query
   * Uses multi-level caching strategy for maximum performance
   */
  private async getAllSecretsBatch(): Promise<Map<string, WebhookSecretData>> {
    // Prevent concurrent batch fetches
    if (this.batchFetchPromise) {
      return this.batchFetchPromise;
    }

    const now = Date.now();
    const shouldRefresh = (now - this.lastBatchFetch) > this.CACHE_TTL;

    if (!shouldRefresh && this.secretsCache.size > 0) {
      // Return cached data as Map
      const result = new Map<string, WebhookSecretData>();
      this.secretsCache.forEach((cached, endpoint) => {
        result.set(endpoint, {
          endpoint,
          key: cached.key,
          algorithm: cached.algorithm,
        });
      });
      return result;
    }

    // Create batch fetch promise
    this.batchFetchPromise = this.performBatchFetch();
    
    try {
      const result = await this.batchFetchPromise;
      this.batchFetchPromise = null; // Clear promise
      return result;
    } catch (error) {
      this.batchFetchPromise = null; // Clear promise on error
      throw error;
    }
  }

  /**
   * Perform the actual batch fetch with Redis caching
   */
  private async performBatchFetch(): Promise<Map<string, WebhookSecretData>> {
    try {
      // Try Redis cache first
      const cachedBatch = await redis.get(this.BATCH_CACHE_KEY);
      if (cachedBatch) {
        console.log('✅ Webhook secrets batch loaded from Redis cache');
        const parsed = JSON.parse(cachedBatch) as WebhookSecretData[];
        return this.updateCacheFromBatch(parsed);
      }

      console.log('🔄 Loading webhook secrets batch from database...');
      
      // Ensure table exists
      const tableReady = await ensureWebhookSecretsTable();
      if (!tableReady) {
        console.warn('Webhook secrets table not ready, returning empty batch');
        return new Map();
      }

      // SINGLE DATABASE QUERY - loads all secrets at once
      const secrets = await withDatabase(async (db) => {
        return await db.webhookSecret.findMany({
          where: { isActive: true },
          select: {
            endpoint: true,
            encryptedKey: true,
            algorithm: true,
          }
        });
      }, { 
        timeout: 5000, 
        operationName: 'webhook_secrets_batch_load',
        retries: 2 
      });

      // Decrypt all secrets and prepare batch
      const batchData: WebhookSecretData[] = [];
      const secretsMap = new Map<string, WebhookSecretData>();

      for (const secret of secrets) {
        try {
          const decryptedKey = decryptSecret(secret.encryptedKey);
          const secretData: WebhookSecretData = {
            endpoint: secret.endpoint,
            key: decryptedKey,
            algorithm: secret.algorithm,
          };
          
          batchData.push(secretData);
          secretsMap.set(secret.endpoint, secretData);
        } catch (decryptError) {
          console.error(`Failed to decrypt secret for ${secret.endpoint}:`, decryptError);
        }
      }

      // Update all caches
      this.updateCacheFromBatch(batchData);
      
      // Cache in Redis for other instances
      await redis.setex(
        this.BATCH_CACHE_KEY, 
        this.REDIS_CACHE_TTL, 
        JSON.stringify(batchData)
      ).catch(err => console.warn('Failed to cache webhook secrets batch:', err));

      console.log(`✅ Loaded ${batchData.length} webhook secrets in single query`);
      this.lastBatchFetch = Date.now();

      return secretsMap;

    } catch (error) {
      console.error('Batch webhook secrets fetch failed:', error);
      
      // Return cached data if available, even if stale
      if (this.secretsCache.size > 0) {
        console.log('Using stale webhook secrets cache as fallback');
        const result = new Map<string, WebhookSecretData>();
        this.secretsCache.forEach((cached, endpoint) => {
          result.set(endpoint, {
            endpoint,
            key: cached.key,
            algorithm: cached.algorithm,
          });
        });
        return result;
      }

      throw error;
    }
  }

  /**
   * Update memory cache from batch data
   */
  private updateCacheFromBatch(batchData: WebhookSecretData[]): Map<string, WebhookSecretData> {
    const now = Date.now();
    const result = new Map<string, WebhookSecretData>();
    
    // Clear existing cache
    this.secretsCache.clear();
    
    // Update with fresh data
    batchData.forEach(secret => {
      this.secretsCache.set(secret.endpoint, {
        key: secret.key,
        algorithm: secret.algorithm,
        lastFetched: now,
      });
      result.set(secret.endpoint, secret);
    });

    return result;
  }

  /**
   * Pre-warm the cache by loading all secrets
   * Call this during application startup
   */
  async preWarmCache(): Promise<void> {
    try {
      console.log('🚀 Pre-warming webhook secrets cache...');
      await this.getAllSecretsBatch();
      console.log('✅ Webhook secrets cache pre-warmed');
    } catch (error) {
      console.error('Failed to pre-warm webhook secrets cache:', error);
    }
  }

  /**
   * Invalidate cache when secrets are updated
   */
  async invalidateCache(): Promise<void> {
    try {
      console.log('🔄 Invalidating webhook secrets cache...');
      
      // Clear memory cache
      this.secretsCache.clear();
      this.lastBatchFetch = 0;
      
      // Clear Redis cache
      await redis.del(this.BATCH_CACHE_KEY);
      
      // Pre-load fresh data
      await this.getAllSecretsBatch();
      
      console.log('✅ Webhook secrets cache invalidated and refreshed');
    } catch (error) {
      console.error('Failed to invalidate webhook secrets cache:', error);
    }
  }

  /**
   * Get cache statistics for monitoring
   */
  getCacheStats() {
    const now = Date.now();
    const totalSecrets = this.secretsCache.size;
    let freshSecrets = 0;
    let staleSecrets = 0;

    this.secretsCache.forEach((cached) => {
      if ((now - cached.lastFetched) < this.CACHE_TTL) {
        freshSecrets++;
      } else {
        staleSecrets++;
      }
    });

    return {
      totalSecrets,
      freshSecrets,
      staleSecrets,
      lastBatchFetch: new Date(this.lastBatchFetch).toISOString(),
      cacheAgeMs: now - this.lastBatchFetch,
      isHealthy: freshSecrets > 0 && staleSecrets === 0,
    };
  }

  /**
   * Validate multiple endpoints at once (for bulk webhook processing)
   */
  async validateSignatureBatch(
    requests: Array<{
      endpoint: string;
      body: string;
      signature: string;
      algorithm?: string;
    }>
  ): Promise<Array<{ endpoint: string; isValid: boolean; error?: string }>> {
    try {
      // Load all secrets in one batch
      await this.getAllSecretsBatch();
      
      // Process all validations
      return await Promise.all(
        requests.map(async req => {
          try {
            const secret = await this.getWebhookSecret(req.endpoint);
            if (!secret) {
              return { 
                endpoint: req.endpoint, 
                isValid: false, 
                error: 'Secret not found' 
              };
            }

            const isValid = this.validateWithSecret(
              req.body, 
              req.signature, 
              secret.key, 
              req.algorithm || secret.algorithm
            );

            return { endpoint: req.endpoint, isValid };
          } catch (error) {
            return { 
              endpoint: req.endpoint, 
              isValid: false, 
              error: error instanceof Error ? error.message : 'Unknown error'
            };
          }
        })
      );
    } catch (error) {
      console.error('Batch signature validation failed:', error);
      return requests.map(req => ({ 
        endpoint: req.endpoint, 
        isValid: false, 
        error: 'Batch validation failed' 
      }));
    }
  }

  /**
   * Optimized signature validation (single approach, no multiple attempts)
   */
  private validateWithSecret(
    body: string, 
    signature: string, 
    secretKey: string, 
    algorithm: string = 'sha256'
  ): boolean {
    try {
      const crypto = require('crypto');
      
      // Single-pass validation - use the most common format
      const computedSignature = crypto
        .createHmac(algorithm, secretKey)
        .update(body, 'utf8')
        .digest('hex');
      
      // Check the most common signature formats only
      const expectedFormats = [
        computedSignature,
        `${algorithm}=${computedSignature}`,
        computedSignature.toUpperCase(),
        `${algorithm.toUpperCase()}=${computedSignature}`,
      ];

      return expectedFormats.includes(signature);
    } catch (error) {
      console.error('Signature validation error:', error);
      return false;
    }
  }
}

// Export singleton instance
export const optimizedWebhookSecretStore = OptimizedWebhookSecretStore.getInstance();

// Export compatibility function for existing code
export async function getWebhookSecretOptimized(endpoint: string): Promise<{ key: string; algorithm: string } | null> {
  return optimizedWebhookSecretStore.getWebhookSecret(endpoint);
}

// Cache invalidation helper for webhook secret updates
export async function invalidateWebhookSecretsCache(): Promise<void> {
  return optimizedWebhookSecretStore.invalidateCache();
}