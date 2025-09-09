import { optimizedWebhookSecretStore } from './webhook-secret-store-optimized';

// OPTIMIZED: Use batch loading instead of individual queries
// This eliminates the N+1 query pattern that was causing 183+ database calls
export async function getWebhookSecret(endpoint: string): Promise<{ key: string; algorithm: string } | null> {
  return optimizedWebhookSecretStore.getWebhookSecret(endpoint);
}

// Clear cache for a specific endpoint (useful after updates)
export async function clearSecretCache(endpoint?: string): Promise<void> {
  if (endpoint) {
    console.log(`Clearing cache for webhook endpoint: ${endpoint}`);
  }
  // Invalidate the entire optimized cache since we now batch load
  await optimizedWebhookSecretStore.invalidateCache();
}

// Get all available webhook endpoints with secrets configured
export async function getAvailableWebhookEndpoints(): Promise<string[]> {
  try {
    // Use the optimized store's cache stats to avoid another DB query
    const stats = optimizedWebhookSecretStore.getCacheStats();
    if (stats.totalSecrets > 0) {
      // If we have secrets cached, we can extract endpoints from there
      // For now, fall back to a single query since endpoints are rarely requested
      const { withDatabase } = await import('@/lib/database');
      const secrets = await withDatabase(async (db) => {
        return await db.webhookSecret.findMany({
          where: { isActive: true },
          select: { endpoint: true }
        });
      }, { timeout: 3000, operationName: 'get_webhook_endpoints' });
      
      return secrets.map(s => s.endpoint);
    }
    return [];
  } catch (error) {
    console.error('Error fetching available webhook endpoints:', error);
    return [];
  }
}

// Check if webhook secret exists for endpoint
export async function hasWebhookSecret(endpoint: string): Promise<boolean> {
  try {
    const secret = await getWebhookSecret(endpoint);
    return !!secret;
  } catch (error) {
    console.error(`Error checking webhook secret for endpoint ${endpoint}:`, error);
    return false;
  }
}