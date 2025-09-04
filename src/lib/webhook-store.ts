import { Transaction } from '@/types/paysafe';
import { WebhookEvent, WebhookStats } from '@/types/webhook';
import { v4 as uuidv4 } from 'uuid';

class WebhookStore {
  private events: WebhookEvent[] = [];
  private transactions: Transaction[] = [];

  addWebhookEvent(event: WebhookEvent): void {
    this.events.unshift(event); // Add to beginning for newest first
    
    // Keep only last 1000 events to prevent memory issues
    if (this.events.length > 1000) {
      this.events = this.events.slice(0, 1000);
    }

    // Convert to transaction format if it's a payment event
    if (this.isPaymentEvent(event)) {
      const transaction = this.convertToTransaction(event);
      this.addOrUpdateTransaction(transaction);
    }
  }

  private isPaymentEvent(event: WebhookEvent): boolean {
    const paymentEvents = [
      'PAYMENT_COMPLETED',
      'PAYMENT_FAILED',
      'PAYMENT_PENDING',
      'PAYMENT_CANCELLED',
      'PAYMENT_AUTHORIZED',
      'PAYMENT_CAPTURED',
      'PAYMENT_REFUNDED'
    ];
    return paymentEvents.some(type => event.eventType.includes(type) || event.eventType.includes('PAYMENT'));
  }

  private convertToTransaction(event: WebhookEvent): Transaction {
    const eventData = event.payload.eventData;
    
    return {
      id: eventData.id,
      merchantRefNum: eventData.merchantRefNum,
      amount: eventData.amount || 0,
      currency: eventData.currencyCode || 'USD',
      status: this.mapStatus(eventData.status || event.eventType),
      transactionType: 'PAYMENT',
      paymentMethod: eventData.card?.type || 'UNKNOWN',
      createdAt: eventData.txnTime || event.timestamp,
      updatedAt: eventData.updatedTime || event.timestamp,
      description: `Webhook: ${event.eventType}`,
    };
  }

  private mapStatus(status: string): 'COMPLETED' | 'PENDING' | 'FAILED' | 'CANCELLED' {
    const upperStatus = status.toUpperCase();
    if (upperStatus.includes('COMPLETED') || upperStatus.includes('CAPTURED') || upperStatus.includes('SUCCESS')) {
      return 'COMPLETED';
    }
    if (upperStatus.includes('PENDING') || upperStatus.includes('AUTHORIZED')) {
      return 'PENDING';
    }
    if (upperStatus.includes('FAILED') || upperStatus.includes('DECLINED') || upperStatus.includes('ERROR')) {
      return 'FAILED';
    }
    if (upperStatus.includes('CANCELLED') || upperStatus.includes('VOID')) {
      return 'CANCELLED';
    }
    return 'PENDING'; // Default fallback
  }

  private addOrUpdateTransaction(transaction: Transaction): void {
    const existingIndex = this.transactions.findIndex(t => t.id === transaction.id);
    
    if (existingIndex >= 0) {
      // Update existing transaction
      this.transactions[existingIndex] = transaction;
    } else {
      // Add new transaction
      this.transactions.unshift(transaction);
      
      // Keep only last 1000 transactions
      if (this.transactions.length > 1000) {
        this.transactions = this.transactions.slice(0, 1000);
      }
    }
  }

  getWebhookEvents(limit: number = 100): WebhookEvent[] {
    return this.events.slice(0, limit);
  }

  getTransactions(): Transaction[] {
    return [...this.transactions];
  }

  getWebhookStats(): WebhookStats {
    const totalReceived = this.events.length;
    const successfullyProcessed = this.events.filter(e => e.processed && !e.error).length;
    const failed = this.events.filter(e => e.error).length;
    const lastReceived = this.events.length > 0 ? this.events[0].timestamp : undefined;

    return {
      totalReceived,
      successfullyProcessed,
      failed,
      lastReceived,
    };
  }

  clearData(): void {
    this.events = [];
    this.transactions = [];
  }

  // Generate mock webhook data for testing
  generateMockWebhook(eventType: string = 'PAYMENT_COMPLETED'): WebhookEvent {
    const mockEvent: WebhookEvent = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      eventType,
      source: 'netbanx',
      processed: true,
      payload: {
        id: `pay_${Date.now()}`,
        eventType,
        eventData: {
          id: `pay_${Date.now()}`,
          merchantRefNum: `ORDER_${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
          amount: Math.floor(Math.random() * 50000) / 100, // Random amount between 0-500
          currencyCode: 'USD',
          status: eventType.includes('COMPLETED') ? 'COMPLETED' : 
                  eventType.includes('FAILED') ? 'FAILED' : 'PENDING',
          txnTime: new Date().toISOString(),
          card: {
            type: ['VISA', 'MASTERCARD', 'AMEX'][Math.floor(Math.random() * 3)],
            lastDigits: Math.floor(Math.random() * 9999).toString().padStart(4, '0'),
            holderName: 'John Doe',
          },
        },
      },
    };

    return mockEvent;
  }
}

export const webhookStore = new WebhookStore();