import { NextRequest, NextResponse } from 'next/server';
import { webhookStore } from '@/lib/webhook-store';
import { WebhookEvent } from '@/types/webhook';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

interface AlternatePaymentWebhook {
  id: string; // Unique request ID
  resourceId: string; // Alternate payment transaction ID
  mode: 'live' | 'test'; // Event mode
  eventDate: string; // Timestamp of event
  eventType: string; // Event type (e.g., "AP_PAYMENT_COMPLETED", "AP_PAYMENT_FAILED")
  payload: {
    transactionId: string;
    alternatePaymentId: string; // Alternate Payment ID
    accountNumber: string;
    amount: number;
    currency: string;
    status: string;
    paymentMethod: string; // e.g., "PAYPAL", "APPLE_PAY", "GOOGLE_PAY", "VENMO", "SKRILL"
    merchantRefNum?: string;
    customerId?: string;
    description?: string;
    reason?: string; // For failures
    returnUrl?: string;
    cancelUrl?: string;
    paymentDetails?: {
      payerId?: string;
      payerEmail?: string;
      payerName?: string;
      externalTransactionId?: string;
      walletId?: string;
    };
    [key: string]: any; // Additional fields
  };
}

export async function POST(request: NextRequest) {
  try {
    // Get the raw body for signature verification
    const body = await request.text();
    const timestamp = new Date().toISOString();
    
    // Get headers for validation
    const signature = request.headers.get('x-paysafe-signature') || 
                     request.headers.get('x-netbanx-signature') || 
                     request.headers.get('x-signature') ||
                     request.headers.get('signature');
    const eventType = request.headers.get('x-paysafe-event-type') ||
                     request.headers.get('x-netbanx-event-type') ||
                     request.headers.get('x-event-type');

    // Log incoming webhook for debugging
    console.log('Received Alternate Payment webhook:', {
      url: request.url,
      method: request.method,
      eventType,
      signature: signature ? 'present' : 'missing',
      bodyLength: body.length,
      timestamp,
      headers: Object.fromEntries(request.headers.entries()),
    });

    // Parse the JSON payload
    let payload: AlternatePaymentWebhook;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      console.error('Invalid JSON payload:', error);
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    // Validate webhook signature if present
    const isSignatureValid = validateSignature(body, signature);
    
    if (!isSignatureValid && process.env.NODE_ENV === 'production') {
      console.error('Invalid webhook signature');
      return NextResponse.json(
        { error: 'Invalid signature' },
        { status: 401 }
      );
    }

    // Create webhook event
    const webhookEvent: WebhookEvent = {
      id: uuidv4(),
      timestamp,
      eventType: payload.eventType || eventType || 'ALTERNATE_PAYMENT_UPDATE',
      source: 'paysafe-alternate-payments',
      payload: payload,
      processed: true,
    };

    // Store the webhook event
    webhookStore.addWebhookEvent(webhookEvent);

    // Process Alternate Payment transaction
    await processAlternatePaymentTransaction(payload);

    console.log('Successfully processed Alternate Payment webhook:', {
      id: webhookEvent.id,
      eventType: webhookEvent.eventType,
      transactionId: payload.payload.transactionId,
      alternatePaymentId: payload.payload.alternatePaymentId,
      paymentMethod: payload.payload.paymentMethod,
      amount: payload.payload.amount,
      status: payload.payload.status,
    });

    // Return success response
    return NextResponse.json(
      { 
        success: true, 
        message: 'Alternate Payment webhook processed successfully',
        webhookId: webhookEvent.id 
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error processing Alternate Payment webhook:', error);
    
    // Log failed webhook event
    const failedEvent: WebhookEvent = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      eventType: 'AP_WEBHOOK_ERROR',
      source: 'paysafe-alternate-payments',
      payload: { error: 'Processing failed', originalBody: body },
      processed: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    
    webhookStore.addWebhookEvent(failedEvent);
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Health check endpoint for Alternate Payment webhooks
  const stats = webhookStore.getWebhookStats();
  
  return NextResponse.json({
    status: 'active',
    endpoint: '/api/webhooks/alternate-payments',
    description: 'Paysafe Alternate Payment Webhooks',
    supportedEventTypes: [
      'AP_PAYMENT_COMPLETED',
      'AP_PAYMENT_FAILED', 
      'AP_PAYMENT_PENDING',
      'AP_PAYMENT_CANCELLED',
      'AP_REFUND_COMPLETED',
      'AP_REFUND_FAILED',
      'AP_REFUND_PENDING'
    ],
    supportedPaymentMethods: [
      'PAYPAL', 'APPLE_PAY', 'GOOGLE_PAY', 'VENMO', 'SKRILL',
      'NETELLER', 'PAYSAFECARD', 'SOFORT', 'GIROPAY', 'IDEAL',
      'BANCONTACT', 'EPS', 'P24', 'MULTIBANCO', 'MYBANK'
    ],
    supportedStatuses: [
      'COMPLETED', 'FAILED', 'PENDING', 'CANCELLED',
      'PROCESSING', 'SETTLED', 'REFUNDED'
    ],
    stats,
    timestamp: new Date().toISOString(),
  });
}

// Process Alternate Payment transaction
async function processAlternatePaymentTransaction(webhook: AlternatePaymentWebhook) {
  try {
    const { payload } = webhook;
    
    console.log('Processing Alternate Payment transaction:', {
      eventType: webhook.eventType,
      transactionId: payload.transactionId,
      alternatePaymentId: payload.alternatePaymentId,
      accountNumber: payload.accountNumber,
      amount: payload.amount,
      currency: payload.currency,
      status: payload.status,
      paymentMethod: payload.paymentMethod,
      merchantRefNum: payload.merchantRefNum,
      mode: webhook.mode,
    });

    // Here you would integrate with database or external systems
    // For now, we're logging and storing in memory
    
    // Example: Store Alternate Payment transaction
    /*
    await storeAlternatePaymentTransaction({
      transactionId: payload.transactionId,
      alternatePaymentId: payload.alternatePaymentId,
      accountNumber: payload.accountNumber,
      amount: payload.amount,
      currency: payload.currency,
      status: payload.status,
      paymentMethod: payload.paymentMethod,
      merchantRefNum: payload.merchantRefNum,
      eventType: webhook.eventType,
      eventDate: webhook.eventDate,
      mode: webhook.mode,
      paymentDetails: payload.paymentDetails,
    });
    */

  } catch (error) {
    console.error('Error processing Alternate Payment transaction:', error);
    throw error;
  }
}

// HMAC signature validation using Paysafe secret key
function validateSignature(body: string, signature: string | null): boolean {
  if (!signature) {
    console.warn('No signature provided in Alternate Payment webhook request');
    return process.env.NODE_ENV !== 'production';
  }
  
  try {
    const webhookSecret = 'YzM2ZjA4OGYyMjAxODA3MmRkYjBkZjA1ZmY2MzM2MjNmZmVjZDAzZjFiYWMyMjlkZTc0YTg3MGEyNDg1NjIxNg==';
    
    // Try multiple approaches for the secret key
    const secretKey1 = Buffer.from(webhookSecret, 'base64').toString('utf-8');
    const secretKey2 = webhookSecret;
    const secretKey3 = Buffer.from(webhookSecret, 'base64');
    
    // Try different secret key formats and signature computations
    const signatures = [];
    
    signatures.push(crypto.createHmac('sha256', secretKey1).update(body, 'utf8').digest('hex'));
    signatures.push(crypto.createHmac('sha256', secretKey1).update(body, 'utf8').digest('base64'));
    signatures.push(crypto.createHmac('sha256', secretKey2).update(body, 'utf8').digest('hex'));
    signatures.push(crypto.createHmac('sha256', secretKey2).update(body, 'utf8').digest('base64'));
    signatures.push(crypto.createHmac('sha256', secretKey3).update(body, 'utf8').digest('hex'));
    signatures.push(crypto.createHmac('sha256', secretKey3).update(body, 'utf8').digest('base64'));
    
    // Create all possible signature formats
    const possibleSignatures = [];
    signatures.forEach(sig => {
      possibleSignatures.push(sig);
      possibleSignatures.push(sig.toUpperCase());
      possibleSignatures.push(`sha256=${sig}`);
      possibleSignatures.push(`SHA256=${sig}`);
      possibleSignatures.push(`sha256=${sig.toUpperCase()}`);
      possibleSignatures.push(`SHA256=${sig.toUpperCase()}`);
    });
    
    const isValid = possibleSignatures.includes(signature);
    
    console.log('Alternate Payment webhook signature validation:', {
      provided: signature,
      possibleMatches: signatures.slice(0, 3),
      valid: isValid
    });
    
    return isValid;
  } catch (error) {
    console.error('Error validating Alternate Payment webhook signature:', error);
    return false;
  }
}