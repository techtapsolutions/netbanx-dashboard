export interface WebhookPayload {
  id: string;
  eventType: string;
  eventData: {
    id: string;
    merchantRefNum: string;
    amount?: number;
    currencyCode?: string;
    status?: string;
    txnTime?: string;
    updatedTime?: string;
    paymentHandleToken?: string;
    card?: {
      type?: string;
      lastDigits?: string;
      holderName?: string;
    };
    billingDetails?: {
      street?: string;
      city?: string;
      state?: string;
      country?: string;
      zip?: string;
    };
  };
  links?: Array<{
    rel: string;
    href: string;
  }>;
}

export interface WebhookEvent {
  id: string;
  timestamp: string;
  eventType: string;
  source: 'netbanx' | 'paysafe';
  payload: WebhookPayload;
  processed: boolean;
  error?: string;
}

export interface WebhookConfig {
  endpoint: string;
  secret: string;
  events: string[];
  isActive: boolean;
  createdAt: string;
}

export interface WebhookStats {
  totalReceived: number;
  successfullyProcessed: number;
  failed: number;
  lastReceived?: string;
}