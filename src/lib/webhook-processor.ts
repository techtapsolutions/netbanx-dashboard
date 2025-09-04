import { DatabaseService, db } from './database';
import { WebhookEvent } from '@/types/webhook';
import { Transaction } from '@/types/paysafe';
import crypto from 'crypto';
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ],
});

export class WebhookProcessor {
  // Process webhook and convert to transaction
  async processWebhook(webhookData: any, metadata: any = {}) {
    const startTime = Date.now();
    
    try {
      // Validate webhook structure
      this.validateWebhookStructure(webhookData);
      
      // Create webhook event record
      const webhookEvent = await this.createWebhookEvent(webhookData, metadata);
      
      // Process different event types
      let transactionId = null;
      if (this.isTransactionEvent(webhookData.eventType)) {
        const transaction = await this.processTransactionEvent(webhookData, webhookEvent.id);
        transactionId = transaction.id;
      }
      
      // Mark webhook as processed
      await db.webhookEvent.update({
        where: { id: webhookEvent.id },
        data: { processed: true },
      });
      
      const processingTime = Date.now() - startTime;
      
      logger.info('Webhook processed successfully', {
        webhookId: webhookEvent.id,
        eventType: webhookData.eventType,
        transactionId,
        processingTime,
      });
      
      return {
        webhookId: webhookEvent.id,
        transactionId,
        processingTime,
        success: true,
      };
      
    } catch (error) {
      const processingTime = Date.now() - startTime;
      
      logger.error('Webhook processing failed', {
        eventType: webhookData.eventType,
        error: error.message,
        processingTime,
      });
      
      // Create alert for critical failures
      if (this.isCriticalEvent(webhookData.eventType)) {
        await DatabaseService.createAlert(
          'ERROR',
          'Critical Webhook Processing Failed',
          `Failed to process ${webhookData.eventType}: ${error.message}`,
          { webhookData, error: error.message }
        );
      }
      
      throw error;
    }
  }

  // Validate webhook structure
  private validateWebhookStructure(webhookData: any) {
    if (!webhookData) {
      throw new Error('Webhook data is required');
    }
    
    if (!webhookData.eventType) {
      throw new Error('Event type is required');
    }
    
    if (!webhookData.eventData) {
      throw new Error('Event data is required');
    }
    
    if (!webhookData.eventData.id) {
      throw new Error('Event data ID is required');
    }
  }

  // Create webhook event record
  private async createWebhookEvent(webhookData: any, metadata: any): Promise<any> {
    try {
      return await db.webhookEvent.create({
        data: {
          eventType: webhookData.eventType,
          source: metadata.source || 'netbanx',
          payload: webhookData,
          ipAddress: metadata.ipAddress,
          userAgent: metadata.userAgent,
          signature: metadata.signature,
          processed: false,
        },
      });
    } catch (error) {
      logger.error('Failed to create webhook event', {
        eventType: webhookData.eventType,
        error: error.message,
      });
      throw error;
    }
  }

  // Check if event type is transaction-related
  private isTransactionEvent(eventType: string): boolean {
    const transactionEvents = [
      'PAYMENT_COMPLETED',
      'PAYMENT_FAILED',
      'PAYMENT_PENDING',
      'PAYMENT_CANCELLED',
      'PAYMENT_AUTHORIZED',
      'PAYMENT_CAPTURED',
      'PAYMENT_REFUNDED',
      'REFUND_COMPLETED',
      'REFUND_FAILED',
      'CHARGEBACK_CREATED',
    ];
    
    return transactionEvents.some(event => eventType.includes(event)) ||
           eventType.toLowerCase().includes('payment') ||
           eventType.toLowerCase().includes('transaction');
  }

  // Process transaction-related events
  private async processTransactionEvent(webhookData: any, webhookEventId: string) {
    const eventData = webhookData.eventData;
    
    try {
      // Map webhook data to transaction format
      const transaction = {
        externalId: eventData.id,
        merchantRefNum: eventData.merchantRefNum,
        amount: eventData.amount || 0,
        currency: eventData.currencyCode || 'USD',
        status: this.mapEventToTransactionStatus(webhookData.eventType, eventData.status),
        transactionType: this.getTransactionType(webhookData.eventType),
        paymentMethod: this.getPaymentMethod(eventData),
        description: `Webhook: ${webhookData.eventType}`,
        transactionTime: eventData.txnTime ? new Date(eventData.txnTime) : new Date(),
        metadata: {
          webhookEventType: webhookData.eventType,
          originalPayload: eventData,
        },
        webhookEventId,
      };
      
      // Upsert transaction (create or update)
      const result = await db.transaction.upsert({
        where: { externalId: transaction.externalId },
        update: {
          status: transaction.status,
          updatedAt: new Date(),
          metadata: transaction.metadata,
          webhookEventId,
        },
        create: transaction,
      });
      
      logger.debug('Transaction processed', {
        transactionId: result.id,
        externalId: transaction.externalId,
        status: transaction.status,
      });
      
      return result;
      
    } catch (error) {
      logger.error('Failed to process transaction event', {
        eventType: webhookData.eventType,
        externalId: eventData.id,
        error: error.message,
      });
      throw error;
    }
  }

  // Map event types to transaction status
  private mapEventToTransactionStatus(eventType: string, eventStatus?: string): string {
    const upperEventType = eventType.toUpperCase();
    const upperEventStatus = eventStatus?.toUpperCase();
    
    // Use explicit status if provided
    if (upperEventStatus) {
      if (upperEventStatus.includes('COMPLETED') || upperEventStatus.includes('SUCCESS')) {
        return 'COMPLETED';
      }
      if (upperEventStatus.includes('FAILED') || upperEventStatus.includes('DECLINED')) {
        return 'FAILED';
      }
      if (upperEventStatus.includes('PENDING') || upperEventStatus.includes('AUTHORIZED')) {
        return 'PENDING';
      }
      if (upperEventStatus.includes('CANCELLED') || upperEventStatus.includes('VOID')) {
        return 'CANCELLED';
      }
    }
    
    // Map based on event type
    if (upperEventType.includes('COMPLETED') || upperEventType.includes('CAPTURED')) {
      return 'COMPLETED';
    }
    if (upperEventType.includes('FAILED') || upperEventType.includes('DECLINED')) {
      return 'FAILED';
    }
    if (upperEventType.includes('PENDING') || upperEventType.includes('AUTHORIZED')) {
      return 'PENDING';
    }
    if (upperEventType.includes('CANCELLED') || upperEventType.includes('VOID')) {
      return 'CANCELLED';
    }
    
    // Default to pending for unknown statuses
    return 'PENDING';
  }

  // Get transaction type from event
  private getTransactionType(eventType: string): string {
    const upperEventType = eventType.toUpperCase();
    
    if (upperEventType.includes('REFUND')) {
      return 'REFUND';
    }
    if (upperEventType.includes('PAYOUT') || upperEventType.includes('WITHDRAWAL')) {
      return 'PAYOUT';
    }
    if (upperEventType.includes('CHARGEBACK')) {
      return 'CHARGEBACK';
    }
    
    return 'PAYMENT'; // Default
  }

  // Extract payment method from event data
  private getPaymentMethod(eventData: any): string {
    // Check card information
    if (eventData.card?.type) {
      return eventData.card.type.toUpperCase();
    }
    
    // Check payment type
    if (eventData.paymentType) {
      return eventData.paymentType.toUpperCase();
    }
    
    // Check payment method
    if (eventData.paymentMethod) {
      return eventData.paymentMethod.toUpperCase();
    }
    
    return 'UNKNOWN';
  }

  // Check if event is critical
  private isCriticalEvent(eventType: string): boolean {
    const criticalEvents = [
      'PAYMENT_COMPLETED',
      'PAYMENT_FAILED',
      'CHARGEBACK_CREATED',
      'REFUND_FAILED',
    ];
    
    return criticalEvents.some(event => eventType.includes(event));
  }

  // Verify webhook signature (production security)
  static verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    try {
      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(payload)
        .digest('hex');
      
      const providedSignature = signature.replace('sha256=', '');
      
      return crypto.timingSafeEqual(
        Buffer.from(expectedSignature, 'hex'),
        Buffer.from(providedSignature, 'hex')
      );
    } catch (error) {
      logger.error('Signature verification failed', { error: error.message });
      return false;
    }
  }

  // Detect duplicate webhooks
  async isDuplicateWebhook(eventId: string, eventType: string): Promise<boolean> {
    try {
      const existing = await db.webhookEvent.findFirst({
        where: {
          payload: {
            path: ['eventData', 'id'],
            equals: eventId,
          },
          eventType,
          timestamp: {
            gte: new Date(Date.now() - 5 * 60 * 1000), // Within last 5 minutes
          },
        },
      });
      
      return !!existing;
    } catch (error) {
      logger.error('Duplicate check failed', { error: error.message });
      return false;
    }
  }
}