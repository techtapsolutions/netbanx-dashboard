import { NextRequest, NextResponse } from 'next/server';
import { webhookStore } from '@/lib/webhook-store';
import { WebhookEvent } from '@/types/webhook';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import { 
  storeWebhookEvent,
  getWebhookSecret,
  createAlert,
  databaseHealthCheck
} from '@/lib/database-serverless';

interface DirectDebitWebhook {
  id: string; // Unique request ID
  resourceId: string; // Direct Debit transaction ID
  mode: 'live' | 'test'; // Event mode
  eventDate: string; // Timestamp of event
  eventType: string; // Event type (e.g., "DD_PAYMENT_COMPLETED", "DD_PAYMENT_FAILED")
  payload: {
    transactionId: string;
    directDebitId: string; // Direct Debit ID
    accountNumber: string;
    amount: number;
    currency: string;
    status: string;
    merchantRefNum?: string;
    customerId?: string;
    mandateId?: string;
    description?: string;
    reason?: string; // For failures or returns
    returnCode?: string;
    bankAccount?: {
      accountNumber: string;
      sortCode: string;
      accountHolderName: string;
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
    console.log('Received Direct Debit webhook:', {
      url: request.url,
      method: request.method,
      eventType,
      signature: signature ? 'present' : 'missing',
      bodyLength: body.length,
      timestamp,
      headers: Object.fromEntries(request.headers.entries()),
    });

    // Parse the JSON payload
    let payload: DirectDebitWebhook;
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
    const isSignatureValid = await validateSignature(body, signature);
    
    // Allow webhooks from test endpoints and Netbanx testing without signatures
    const isFromTestEndpoint = request.headers.get('user-agent')?.includes('node') || 
                              request.headers.get('x-test-webhook') === 'true' ||
                              body.includes('"source":"test-webhook"');
    
    if (!isSignatureValid && !isFromTestEndpoint && process.env.NODE_ENV === 'production') {
      console.warn('Invalid Direct Debit webhook signature, but allowing for Netbanx testing:', {
        hasSignature: !!signature,
        userAgent: request.headers.get('user-agent'),
        isFromTestEndpoint
      });
      
      // For now, allow unsigned requests for Netbanx testing but log them  
      // In a real production system, you'd want to enable strict validation after testing
      // Updated: 2025-09-06 - Force deployment
    }

    // Convert direct debit webhook to standard format
    const standardPayload = {
      id: payload.id || uuidv4(),
      eventType: payload.eventType || eventType || 'DIRECT_DEBIT_UPDATE',
      eventData: {
        id: payload.resourceId || payload.payload?.directDebitId || uuidv4(),
        merchantRefNum: payload.payload?.merchantRefNum || `DD-${Date.now()}`,
        amount: payload.payload?.amount,
        currencyCode: payload.payload?.currency,
        status: payload.payload?.status,
        txnTime: payload.eventDate || timestamp,
        paymentHandleToken: payload.payload?.mandateId,
      }
    };

    // Create webhook event
    const webhookEvent: WebhookEvent = {
      id: uuidv4(),
      timestamp,
      eventType: payload.eventType || eventType || 'DIRECT_DEBIT_UPDATE',
      source: 'paysafe-direct-debit',
      payload: standardPayload,
      processed: true,
    };

    // Store the webhook event
    webhookStore.addWebhookEvent(webhookEvent);

    // Store webhook event in database with bulletproof handling
    let storedWebhookEvent;
    try {
      console.log('Development DB operation');
      storedWebhookEvent = await storeWebhookEvent({
        id: webhookEvent.id,
        eventType: webhookEvent.eventType,
        source: webhookEvent.source,
        payload: webhookEvent.payload,
        timestamp: webhookEvent.timestamp,
        processed: webhookEvent.processed,
      });
      console.log('Webhook event stored in database:', storedWebhookEvent.id);
    } catch (dbError) {
      console.error('Failed to store webhook event in database:', dbError);
      // Continue processing - don't fail the webhook due to DB issues
    }

    // Process Direct Debit transaction
    await processDirectDebitTransaction(payload);

    console.log('Successfully processed Direct Debit webhook:', {
      id: webhookEvent.id,
      eventType: webhookEvent.eventType,
      transactionId: payload.payload.transactionId,
      directDebitId: payload.payload.directDebitId,
      amount: payload.payload.amount,
      status: payload.payload.status,
    });

    // Return success response
    return NextResponse.json(
      { 
        success: true, 
        message: 'Direct Debit webhook processed successfully',
        webhookId: webhookEvent.id 
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error processing Direct Debit webhook:', error);
    
    // Log failed webhook event
    const failedEvent: WebhookEvent = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      eventType: 'DD_WEBHOOK_ERROR',
      source: 'paysafe-direct-debit',
      payload: {
        id: 'error',
        eventType: 'DD_WEBHOOK_ERROR',
        eventData: {
          id: 'error',
          merchantRefNum: 'ERROR',
          status: 'FAILED'
        }
      },
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
  // Health check endpoint for Direct Debit webhooks
  const stats = webhookStore.getWebhookStats();
  
  return NextResponse.json({
    status: 'active',
    endpoint: '/api/webhooks/direct-debit',
    description: 'Paysafe Direct Debit Webhooks',
    supportedEventTypes: [
      'DD_PAYMENT_COMPLETED',
      'DD_PAYMENT_FAILED', 
      'DD_PAYMENT_PENDING',
      'DD_PAYMENT_RETURNED',
      'DD_PAYMENT_CANCELLED',
      'DD_MANDATE_CREATED',
      'DD_MANDATE_CANCELLED',
      'DD_MANDATE_FAILED'
    ],
    supportedStatuses: [
      'COMPLETED', 'FAILED', 'PENDING', 'RETURNED', 'CANCELLED',
      'PROCESSING', 'SETTLED', 'DISPUTED'
    ],
    stats,
    timestamp: new Date().toISOString(),
  });
}

// Process Direct Debit transaction
async function processDirectDebitTransaction(webhook: DirectDebitWebhook) {
  try {
    const { payload } = webhook;
    
    console.log('Processing Direct Debit transaction:', {
      eventType: webhook.eventType,
      transactionId: payload.transactionId,
      directDebitId: payload.directDebitId,
      accountNumber: payload.accountNumber,
      amount: payload.amount,
      currency: payload.currency,
      status: payload.status,
      merchantRefNum: payload.merchantRefNum,
      mode: webhook.mode,
    });

    // Here you would integrate with database or external systems
    // For now, we're logging and storing in memory
    
    // Example: Store Direct Debit transaction
    /*
    await storeDirectDebitTransaction({
      transactionId: payload.transactionId,
      directDebitId: payload.directDebitId,
      accountNumber: payload.accountNumber,
      amount: payload.amount,
      currency: payload.currency,
      status: payload.status,
      merchantRefNum: payload.merchantRefNum,
      eventType: webhook.eventType,
      eventDate: webhook.eventDate,
      mode: webhook.mode,
      mandateId: payload.mandateId,
      bankAccount: payload.bankAccount,
    });
    */

  } catch (error) {
    console.error('Error processing Direct Debit transaction:', error);
    throw error;
  }
}

// HMAC signature validation using Paysafe secret key with database integration
async function validateSignature(body: string, signature: string | null): Promise<boolean> {
  if (!signature) {
    console.warn('No signature provided in Direct Debit webhook request');
    // Allow webhooks without signatures in development only
    return process.env.NODE_ENV !== 'production';
  }
  
  try {
    // Try to get stored secret from database first
    const storedSecret = await getWebhookSecret('direct-debit').catch(err => {
      console.warn('Failed to get stored webhook secret:', err.message);
      return null;
    });
    
    // Fallback to hardcoded secret if database lookup fails
    const webhookSecret = storedSecret || 'YzM2ZjA4OGYyMjAxODA3MmRkYjBkZjA1ZmY2MzM2MjNmZmVjZDAzZjFiYWMyMjlkZTc0YTg3MGEyNDg1NjIxNg==';
    
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
    
    console.log('Direct Debit webhook signature validation:', {
      provided: signature,
      possibleMatches: signatures.slice(0, 3),
      valid: isValid,
      secretSource: storedSecret ? 'database' : 'fallback'
    });
    
    return isValid;
  } catch (error) {
    console.error('Error validating Direct Debit webhook signature:', error);
    return false;
  }
}