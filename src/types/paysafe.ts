export interface PaysafeCredentials {
  apiKey: string;
  apiSecret: string;
  environment: 'sandbox' | 'production';
}

export interface Transaction {
  id: string;
  merchantRefNum: string;
  amount: number;
  currency: string;
  status: 'COMPLETED' | 'PENDING' | 'FAILED' | 'CANCELLED';
  transactionType: 'PAYMENT' | 'REFUND' | 'PAYOUT';
  paymentMethod: string;
  createdAt: string;
  updatedAt: string;
  description?: string;
}

export interface Payment {
  id: string;
  merchantRefNum: string;
  amount: number;
  currency: string;
  status: 'COMPLETED' | 'PENDING' | 'FAILED' | 'CANCELLED';
  paymentHandleToken?: string;
  card?: {
    holderName: string;
    cardNum: string;
    cardExpiry: {
      month: number;
      year: number;
    };
    cardType: string;
  };
  billingDetails?: {
    street: string;
    city: string;
    state: string;
    country: string;
    zip: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface PaymentSummary {
  totalTransactions: number;
  totalAmount: number;
  successfulTransactions: number;
  failedTransactions: number;
  pendingTransactions: number;
  currency: string;
  period: string;
}

export interface ReportFilter {
  startDate: string;
  endDate: string;
  status?: string[];
  transactionType?: string[];
  currency?: string;
  minAmount?: number;
  maxAmount?: number;
}

export interface DashboardConfig {
  credentials: PaysafeCredentials;
  refreshInterval: number;
  defaultCurrency: string;
  timezone: string;
}