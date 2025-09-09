/**
 * DEPRECATED: In-Memory Webhook Store
 * 
 * This file is kept for backward compatibility but now redirects to 
 * the new database-backed persistent store.
 * 
 * All new code should use webhook-store-persistent.ts directly
 * or the compatibility wrapper webhook-store-compat.ts
 */

// Re-export the compatibility layer
export { webhookStore } from '@/lib/webhook-store-compat';