import axios, { AxiosInstance } from 'axios';
import { PaysafeCredentials, Transaction, Payment, PaymentSummary, ReportFilter } from '@/types/paysafe';

export class PaysafeAPI {
  private client: AxiosInstance;
  private credentials: PaysafeCredentials;

  constructor(credentials: PaysafeCredentials) {
    this.credentials = credentials;
    
    const baseURL = credentials.environment === 'production' 
      ? 'https://api.paysafe.com' 
      : 'https://api.test.paysafe.com';

    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${credentials.apiKey}:${credentials.apiSecret}`).toString('base64')}`,
      },
      timeout: 30000,
    });
  }

  async getTransactions(filter?: ReportFilter): Promise<Transaction[]> {
    try {
      const params = new URLSearchParams();
      
      if (filter) {
        if (filter.startDate) params.append('startDate', filter.startDate);
        if (filter.endDate) params.append('endDate', filter.endDate);
        if (filter.status?.length) {
          filter.status.forEach(status => params.append('status', status));
        }
        if (filter.currency) params.append('currency', filter.currency);
        if (filter.minAmount) params.append('minAmount', filter.minAmount.toString());
        if (filter.maxAmount) params.append('maxAmount', filter.maxAmount.toString());
      }

      const response = await this.client.get(`/paymenthub/v1/payments?${params.toString()}`);
      
      return response.data.payments?.map((payment: any) => ({
        id: payment.id,
        merchantRefNum: payment.merchantRefNum,
        amount: payment.amount,
        currency: payment.currencyCode,
        status: payment.status,
        transactionType: 'PAYMENT',
        paymentMethod: payment.card?.type || payment.paymentType || 'UNKNOWN',
        createdAt: payment.txnTime,
        updatedAt: payment.updatedTime || payment.txnTime,
        description: payment.description,
      })) || [];
    } catch (error) {
      console.error('Error fetching transactions:', error);
      throw new Error('Failed to fetch transactions');
    }
  }

  async getPaymentSummary(filter?: ReportFilter): Promise<PaymentSummary> {
    try {
      const transactions = await this.getTransactions(filter);
      
      const totalTransactions = transactions.length;
      const totalAmount = transactions.reduce((sum, t) => sum + t.amount, 0);
      const successfulTransactions = transactions.filter(t => t.status === 'COMPLETED').length;
      const failedTransactions = transactions.filter(t => t.status === 'FAILED').length;
      const pendingTransactions = transactions.filter(t => t.status === 'PENDING').length;
      
      return {
        totalTransactions,
        totalAmount,
        successfulTransactions,
        failedTransactions,
        pendingTransactions,
        currency: filter?.currency || 'USD',
        period: filter ? `${filter.startDate} - ${filter.endDate}` : 'All time',
      };
    } catch (error) {
      console.error('Error getting payment summary:', error);
      throw new Error('Failed to get payment summary');
    }
  }

  async getPaymentDetails(paymentId: string): Promise<Payment> {
    try {
      const response = await this.client.get(`/paymenthub/v1/payments/${paymentId}`);
      const payment = response.data;
      
      return {
        id: payment.id,
        merchantRefNum: payment.merchantRefNum,
        amount: payment.amount,
        currency: payment.currencyCode,
        status: payment.status,
        paymentHandleToken: payment.paymentHandleToken,
        card: payment.card ? {
          holderName: payment.card.holderName,
          cardNum: payment.card.lastDigits ? `****${payment.card.lastDigits}` : '****',
          cardExpiry: {
            month: payment.card.cardExpiry?.month || 0,
            year: payment.card.cardExpiry?.year || 0,
          },
          cardType: payment.card.type,
        } : undefined,
        billingDetails: payment.billingDetails,
        createdAt: payment.txnTime,
        updatedAt: payment.updatedTime || payment.txnTime,
      };
    } catch (error) {
      console.error('Error fetching payment details:', error);
      throw new Error('Failed to fetch payment details');
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.client.get('/paymenthub/v1/payments?limit=1');
      return true;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
}

export const createMockData = (): Transaction[] => {
  return [
    {
      id: 'pay_1',
      merchantRefNum: 'ORDER_001',
      amount: 99.99,
      currency: 'USD',
      status: 'COMPLETED',
      transactionType: 'PAYMENT',
      paymentMethod: 'VISA',
      createdAt: new Date(Date.now() - 86400000).toISOString(),
      updatedAt: new Date(Date.now() - 86400000).toISOString(),
      description: 'Online purchase',
    },
    {
      id: 'pay_2',
      merchantRefNum: 'ORDER_002',
      amount: 249.50,
      currency: 'USD',
      status: 'COMPLETED',
      transactionType: 'PAYMENT',
      paymentMethod: 'MASTERCARD',
      createdAt: new Date(Date.now() - 172800000).toISOString(),
      updatedAt: new Date(Date.now() - 172800000).toISOString(),
      description: 'Subscription payment',
    },
    {
      id: 'pay_3',
      merchantRefNum: 'ORDER_003',
      amount: 75.00,
      currency: 'USD',
      status: 'PENDING',
      transactionType: 'PAYMENT',
      paymentMethod: 'AMEX',
      createdAt: new Date(Date.now() - 3600000).toISOString(),
      updatedAt: new Date(Date.now() - 3600000).toISOString(),
      description: 'Product purchase',
    },
    {
      id: 'pay_4',
      merchantRefNum: 'ORDER_004',
      amount: 150.00,
      currency: 'USD',
      status: 'FAILED',
      transactionType: 'PAYMENT',
      paymentMethod: 'VISA',
      createdAt: new Date(Date.now() - 7200000).toISOString(),
      updatedAt: new Date(Date.now() - 7200000).toISOString(),
      description: 'Service payment',
    },
  ];
};