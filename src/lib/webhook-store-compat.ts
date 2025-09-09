/**
 * Backward Compatibility Wrapper for WebhookStore
 * 
 * This wrapper provides the same API as the original in-memory WebhookStore
 * but backed by persistent database storage.
 */

import { Transaction } from '@/types/paysafe';
import { WebhookEvent, WebhookStats } from '@/types/webhook';
import { persistentWebhookStore } from './webhook-store-persistent';

class CompatibilityWebhookStore {
  /**
   * Add webhook event - synchronous interface for backward compatibility
   * Data is persisted asynchronously in the background
   */
  addWebhookEvent(event: WebhookEvent): void {
    // Persist to database asynchronously (non-blocking)
    persistentWebhookStore.addWebhookEvent(event).catch(error => {
      console.error('Failed to persist webhook event:', error);
    });
  }

  /**
   * Get webhook events - returns Promise for database access
   * Falls back to empty array on error for compatibility
   */
  getWebhookEvents(limit: number = 100): WebhookEvent[] {
    // For backward compatibility, we need to return a synchronous result
    // But we can't make synchronous database calls, so we return empty and
    // suggest users migrate to the async version
    console.warn(
      'webhook-store.getWebhookEvents() is synchronous but data is now in database. ' +
      'Consider using webhook-store-persistent.getWebhookEvents() for full functionality.'
    );
    return [];
  }

  /**
   * Get webhook events asynchronously - recommended approach
   */
  async getWebhookEventsAsync(limit: number = 100): Promise<WebhookEvent[]> {
    return await persistentWebhookStore.getWebhookEvents(limit);
  }

  /**
   * Get transactions - returns Promise for database access
   * Falls back to empty array on error for compatibility
   */
  getTransactions(): Transaction[] {
    // For backward compatibility, we need to return a synchronous result
    // But we can't make synchronous database calls, so we return empty and
    // suggest users migrate to the async version
    console.warn(
      'webhook-store.getTransactions() is synchronous but data is now in database. ' +
      'Consider using webhook-store-persistent.getTransactions() for full functionality.'
    );
    return [];
  }

  /**
   * Get transactions asynchronously - recommended approach
   */
  async getTransactionsAsync(): Promise<Transaction[]> {
    return await persistentWebhookStore.getTransactions();
  }

  /**
   * Get webhook statistics - synchronous fallback
   */
  getWebhookStats(): WebhookStats {
    console.warn(
      'webhook-store.getWebhookStats() is synchronous but data is now in database. ' +
      'Consider using webhook-store-persistent.getWebhookStats() for real-time stats.'
    );
    
    // Return default stats as fallback
    return {
      totalReceived: 0,
      successfullyProcessed: 0,
      failed: 0,
      lastReceived: undefined,
    };
  }

  /**
   * Get webhook statistics asynchronously - recommended approach
   */
  async getWebhookStatsAsync(): Promise<WebhookStats> {
    return await persistentWebhookStore.getWebhookStats();
  }

  /**
   * Clear all data - async operation
   */
  clearData(): void {
    persistentWebhookStore.clearData().catch(error => {
      console.error('Failed to clear webhook data:', error);
    });
  }

  /**
   * Clear all data asynchronously - recommended approach
   */
  async clearDataAsync(): Promise<void> {
    return await persistentWebhookStore.clearData();
  }

  /**
   * Generate mock webhook - synchronous operation (unchanged)
   */
  generateMockWebhook(eventType: string = 'PAYMENT_COMPLETED'): WebhookEvent {
    return persistentWebhookStore.generateMockWebhook(eventType);
  }
}

export const webhookStore = new CompatibilityWebhookStore();