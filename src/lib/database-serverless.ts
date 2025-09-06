/**
 * SERVERLESS DATABASE OPERATIONS
 * 
 * This module provides bulletproof database operations specifically designed
 * for serverless environments with complete prepared statement isolation.
 */

import { PrismaClient } from '@prisma/client';
import { withDatabase } from './database';

export interface DatabaseOperationOptions {
  retries?: number;
  timeout?: number;
  transactional?: boolean;
}

/**
 * Webhook-specific database operations with serverless optimizations
 */
export class ServerlessDatabaseOperations {
  
  /**
   * Store webhook event with automatic retry and error handling
   */
  static async storeWebhookEvent(
    eventData: {
      eventType: string;
      source: string;
      payload: any;
      signature?: string;
      ipAddress?: string;
      userAgent?: string;
      companyId?: string;
    },
    options: DatabaseOperationOptions = {}
  ) {
    return withDatabase(async (db) => {
      try {
        const webhookEvent = await db.webhookEvent.create({
          data: {
            eventType: eventData.eventType,
            source: eventData.source,
            payload: eventData.payload,
            signature: eventData.signature,
            ipAddress: eventData.ipAddress,
            userAgent: eventData.userAgent,
            companyId: eventData.companyId,
            processed: false,
          },
        });
        
        console.log(`Stored webhook event: ${webhookEvent.id}`);
        return webhookEvent;
      } catch (error: any) {
        console.error('Failed to store webhook event:', error);
        throw new Error(`Webhook storage failed: ${error.message}`);
      }
    }, options);
  }

  /**
   * Update webhook event processing status
   */
  static async updateWebhookEventStatus(
    eventId: string,
    processed: boolean,
    error?: string,
    options: DatabaseOperationOptions = {}
  ) {
    return withDatabase(async (db) => {
      return await db.webhookEvent.update({
        where: { id: eventId },
        data: {
          processed,
          error: error || null,
        },
      });
    }, options);
  }

  /**
   * Store or update transaction from webhook data
   */
  static async upsertTransaction(
    transactionData: {
      externalId: string;
      merchantRefNum: string;
      amount: number;
      currency?: string;
      status: string;
      transactionType: string;
      paymentMethod: string;
      description?: string;
      transactionTime: Date;
      metadata?: any;
      companyId?: string;
      webhookEventId?: string;
    },
    options: DatabaseOperationOptions = {}
  ) {
    return withDatabase(async (db) => {
      try {
        const transaction = await db.transaction.upsert({
          where: { externalId: transactionData.externalId },
          update: {
            status: transactionData.status,
            transactionType: transactionData.transactionType,
            paymentMethod: transactionData.paymentMethod,
            description: transactionData.description,
            metadata: transactionData.metadata,
            updatedAt: new Date(),
          },
          create: {
            externalId: transactionData.externalId,
            merchantRefNum: transactionData.merchantRefNum,
            amount: transactionData.amount,
            currency: transactionData.currency || 'USD',
            status: transactionData.status,
            transactionType: transactionData.transactionType,
            paymentMethod: transactionData.paymentMethod,
            description: transactionData.description,
            transactionTime: transactionData.transactionTime,
            metadata: transactionData.metadata,
            companyId: transactionData.companyId,
            webhookEventId: transactionData.webhookEventId,
          },
        });
        
        console.log(`Upserted transaction: ${transaction.id} (${transaction.externalId})`);
        return transaction;
      } catch (error: any) {
        console.error('Failed to upsert transaction:', error);
        throw new Error(`Transaction upsert failed: ${error.message}`);
      }
    }, options);
  }

  /**
   * Store or update account from webhook data
   */
  static async upsertAccount(
    accountData: {
      externalId: string;
      merchantId?: string;
      accountName: string;
      businessName?: string;
      email: string;
      phone?: string;
      status: string;
      subStatus?: string;
      onboardingStage?: string;
      creditCardId?: string;
      directDebitId?: string;
      businessType?: string;
      industry?: string;
      website?: string;
      riskLevel?: string;
      complianceStatus?: string;
      metadata?: any;
      companyId?: string;
      webhookEventId?: string;
    },
    options: DatabaseOperationOptions = {}
  ) {
    return withDatabase(async (db) => {
      try {
        const account = await db.account.upsert({
          where: { externalId: accountData.externalId },
          update: {
            status: accountData.status,
            subStatus: accountData.subStatus,
            onboardingStage: accountData.onboardingStage,
            creditCardId: accountData.creditCardId,
            directDebitId: accountData.directDebitId,
            riskLevel: accountData.riskLevel,
            complianceStatus: accountData.complianceStatus,
            metadata: accountData.metadata,
            updatedAt: new Date(),
          },
          create: {
            externalId: accountData.externalId,
            merchantId: accountData.merchantId,
            accountName: accountData.accountName,
            businessName: accountData.businessName,
            email: accountData.email,
            phone: accountData.phone,
            status: accountData.status,
            subStatus: accountData.subStatus,
            onboardingStage: accountData.onboardingStage,
            creditCardId: accountData.creditCardId,
            directDebitId: accountData.directDebitId,
            businessType: accountData.businessType,
            industry: accountData.industry,
            website: accountData.website,
            riskLevel: accountData.riskLevel,
            complianceStatus: accountData.complianceStatus,
            metadata: accountData.metadata,
            companyId: accountData.companyId,
            webhookEventId: accountData.webhookEventId,
          },
        });
        
        console.log(`Upserted account: ${account.id} (${account.externalId})`);
        return account;
      } catch (error: any) {
        console.error('Failed to upsert account:', error);
        throw new Error(`Account upsert failed: ${error.message}`);
      }
    }, options);
  }

  /**
   * Store account status history
   */
  static async recordAccountStatusHistory(
    historyData: {
      accountId: string;
      fromStatus?: string;
      toStatus: string;
      subStatus?: string;
      stage?: string;
      reason?: string;
      description?: string;
      changedBy?: string;
      metadata?: any;
    },
    options: DatabaseOperationOptions = {}
  ) {
    return withDatabase(async (db) => {
      try {
        const history = await db.accountStatusHistory.create({
          data: {
            accountId: historyData.accountId,
            fromStatus: historyData.fromStatus,
            toStatus: historyData.toStatus,
            subStatus: historyData.subStatus,
            stage: historyData.stage,
            reason: historyData.reason,
            description: historyData.description,
            changedBy: historyData.changedBy || 'webhook',
            metadata: historyData.metadata,
          },
        });
        
        console.log(`Recorded account status history: ${history.id}`);
        return history;
      } catch (error: any) {
        console.error('Failed to record account status history:', error);
        throw new Error(`Account status history failed: ${error.message}`);
      }
    }, options);
  }

  /**
   * Batch operations for high-volume webhooks
   */
  static async batchUpsertTransactions(
    transactions: Array<Parameters<typeof ServerlessDatabaseOperations.upsertTransaction>[0]>,
    options: DatabaseOperationOptions = {}
  ) {
    const maxBatchSize = 50; // Prevent overwhelming the database
    const batches = [];
    
    for (let i = 0; i < transactions.length; i += maxBatchSize) {
      batches.push(transactions.slice(i, i + maxBatchSize));
    }
    
    const results = [];
    
    for (const batch of batches) {
      const batchResults = await Promise.allSettled(
        batch.map(transaction => 
          ServerlessDatabaseOperations.upsertTransaction(transaction, options)
        )
      );
      
      results.push(...batchResults);
    }
    
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    console.log(`Batch upsert completed: ${successful} successful, ${failed} failed`);
    
    return {
      successful,
      failed,
      results
    };
  }

  /**
   * Get webhook secrets with caching
   */
  static async getWebhookSecret(
    endpoint: string,
    options: DatabaseOperationOptions = {}
  ) {
    return withDatabase(async (db) => {
      try {
        const secret = await db.webhookSecret.findFirst({
          where: {
            endpoint,
            isActive: true,
          },
          orderBy: {
            createdAt: 'desc',
          },
        });
        
        if (secret) {
          // Update usage tracking
          await db.webhookSecret.update({
            where: { id: secret.id },
            data: {
              lastUsedAt: new Date(),
              usageCount: { increment: 1 },
            },
          });
        }
        
        return secret;
      } catch (error: any) {
        console.error('Failed to get webhook secret:', error);
        throw new Error(`Webhook secret retrieval failed: ${error.message}`);
      }
    }, options);
  }

  /**
   * Create alert for monitoring
   */
  static async createAlert(
    alertData: {
      type: 'ERROR' | 'WARNING' | 'INFO';
      title: string;
      message: string;
      source?: string;
      metadata?: any;
    },
    options: DatabaseOperationOptions = {}
  ) {
    return withDatabase(async (db) => {
      try {
        const alert = await db.alert.create({
          data: {
            type: alertData.type,
            title: alertData.title,
            message: alertData.message,
            source: alertData.source || 'webhook-processor',
            metadata: alertData.metadata,
          },
        });
        
        console.log(`Created alert: ${alert.id} (${alert.type})`);
        return alert;
      } catch (error: any) {
        console.error('Failed to create alert:', error);
        // Don't throw on alert failures to avoid breaking webhook processing
        return null;
      }
    }, options);
  }

  /**
   * Health check for database connectivity
   */
  static async healthCheck(options: DatabaseOperationOptions = {}): Promise<{
    status: 'healthy' | 'unhealthy';
    latency: number;
    error?: string;
  }> {
    const startTime = Date.now();
    
    try {
      await withDatabase(async (db) => {
        // Simple query to test connectivity
        await db.$queryRaw`SELECT 1 as test`;
      }, { ...options, timeout: 5000 });
      
      const latency = Date.now() - startTime;
      return { status: 'healthy', latency };
    } catch (error: any) {
      const latency = Date.now() - startTime;
      return {
        status: 'unhealthy',
        latency,
        error: error.message
      };
    }
  }
}

/**
 * Convenience functions for common operations
 */

export const storeWebhookEvent = ServerlessDatabaseOperations.storeWebhookEvent;
export const updateWebhookEventStatus = ServerlessDatabaseOperations.updateWebhookEventStatus;
export const upsertTransaction = ServerlessDatabaseOperations.upsertTransaction;
export const upsertAccount = ServerlessDatabaseOperations.upsertAccount;
export const recordAccountStatusHistory = ServerlessDatabaseOperations.recordAccountStatusHistory;
export const batchUpsertTransactions = ServerlessDatabaseOperations.batchUpsertTransactions;
export const getWebhookSecret = ServerlessDatabaseOperations.getWebhookSecret;
export const createAlert = ServerlessDatabaseOperations.createAlert;
export const databaseHealthCheck = ServerlessDatabaseOperations.healthCheck;