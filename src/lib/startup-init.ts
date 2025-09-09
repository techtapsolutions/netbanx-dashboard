import { optimizedWebhookSecretStore } from './webhook-secret-store-optimized';

/**
 * STARTUP INITIALIZATION
 * 
 * Pre-warm critical caches during application startup
 * to ensure optimal performance from the first request
 */

let initializationPromise: Promise<void> | null = null;

export async function initializeApplication(): Promise<void> {
  // Prevent concurrent initialization
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = performInitialization();
  return initializationPromise;
}

async function performInitialization(): Promise<void> {
  console.log('🚀 Starting application initialization...');
  const startTime = Date.now();
  
  try {
    // Pre-warm webhook secrets cache (critical for performance)
    await optimizedWebhookSecretStore.preWarmCache();
    
    const duration = Date.now() - startTime;
    console.log(`✅ Application initialization completed in ${duration}ms`);
    
    // Log cache statistics
    const cacheStats = optimizedWebhookSecretStore.getCacheStats();
    console.log('📊 Webhook secrets cache initialized:', {
      totalSecrets: cacheStats.totalSecrets,
      isHealthy: cacheStats.isHealthy,
    });
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ Application initialization failed after ${duration}ms:`, error);
    
    // Don't throw - allow app to start even if cache pre-warming fails
    // The cache will be loaded lazily on first request
  }
}

// Auto-initialize on module load in production
if (process.env.NODE_ENV === 'production') {
  initializeApplication().catch(error => {
    console.warn('Background initialization failed:', error);
  });
}