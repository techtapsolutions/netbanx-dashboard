import { db } from '@/lib/database';
import { decryptSecret } from '@/lib/encryption';
import { ensureWebhookSecretsTable } from '@/lib/db-init';

// Cache for webhook secrets to avoid frequent database queries
const secretsCache = new Map<string, { key: string; lastFetched: number; algorithm: string }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Get decrypted webhook secret for validation
export async function getWebhookSecret(endpoint: string): Promise<{ key: string; algorithm: string } | null> {
  try {
    // Check cache first
    const cached = secretsCache.get(endpoint);
    if (cached && (Date.now() - cached.lastFetched) < CACHE_TTL) {
      return { key: cached.key, algorithm: cached.algorithm };
    }

    // Ensure table exists
    const tableReady = await ensureWebhookSecretsTable();
    if (!tableReady) {
      console.warn('Webhook secrets table not ready, returning null');
      return null;
    }

    // Fetch from database
    const secret = await db.webhookSecret.findUnique({
      where: { endpoint, isActive: true }
    });

    if (!secret) {
      console.warn(`No active webhook secret found for endpoint: ${endpoint}`);
      return null;
    }

    // Decrypt the key
    const decryptedKey = decryptSecret(secret.encryptedKey);

    // Update cache
    secretsCache.set(endpoint, {
      key: decryptedKey,
      algorithm: secret.algorithm,
      lastFetched: Date.now()
    });

    // Update usage tracking (async, don't wait)
    db.webhookSecret.update({
      where: { endpoint },
      data: {
        lastUsedAt: new Date(),
        usageCount: { increment: 1 }
      }
    }).catch(error => {
      console.error(`Error updating usage for webhook secret ${endpoint}:`, error);
    });

    return { key: decryptedKey, algorithm: secret.algorithm };

  } catch (error) {
    console.error(`Error fetching webhook secret for endpoint ${endpoint}:`, error);
    return null;
  }
}

// Clear cache for a specific endpoint (useful after updates)
export function clearSecretCache(endpoint?: string) {
  if (endpoint) {
    secretsCache.delete(endpoint);
  } else {
    secretsCache.clear();
  }
}

// Get all available webhook endpoints with secrets configured
export async function getAvailableWebhookEndpoints(): Promise<string[]> {
  try {
    const secrets = await db.webhookSecret.findMany({
      where: { isActive: true },
      select: { endpoint: true }
    });

    return secrets.map(s => s.endpoint);
  } catch (error) {
    console.error('Error fetching available webhook endpoints:', error);
    return [];
  }
}

// Check if webhook secret exists for endpoint
export async function hasWebhookSecret(endpoint: string): Promise<boolean> {
  try {
    const secret = await db.webhookSecret.findUnique({
      where: { endpoint, isActive: true },
      select: { id: true }
    });

    return !!secret;
  } catch (error) {
    console.error(`Error checking webhook secret for endpoint ${endpoint}:`, error);
    return false;
  }
}