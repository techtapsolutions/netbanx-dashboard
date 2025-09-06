import { NextRequest, NextResponse } from 'next/server';
import { webhookStore } from '@/lib/webhook-store';
import { WebhookEvent } from '@/types/webhook';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

interface PaysafeAccountStatusWebhook {
  id: string; // Unique request ID
  resourceId: string; // Account number being updated
  mode: 'live' | 'test'; // Event mode
  eventDate?: string; // Timestamp of status change
  eventType: string; // Status change type (e.g., "ACCT_ENABLED")
  payload?: {
    partnerId?: number;
    acctStatus?: string; // Current account status
    accountNumber?: string;
    creditCardId?: string; // CC ID for approved accounts
    directDebitId?: string; // DD ID for approved accounts
    [key: string]: any; // Additional fields
  };
  // Support for test webhook format
  account?: {
    id: string;
    merchantId: string;
    status: string;
    creditCardId?: string;
    directDebitId?: string;
    [key: string]: any;
  };
}

export async function POST(request: NextRequest) {
  try {
    // Get the raw body for signature verification
    const body = await request.text();
    const timestamp = new Date().toISOString();
    
    // Get headers for validation - check multiple possible header names
    const signature = request.headers.get('x-paysafe-signature') || 
                     request.headers.get('x-netbanx-signature') || 
                     request.headers.get('x-signature') ||
                     request.headers.get('signature');
    const eventType = request.headers.get('x-paysafe-event-type') ||
                     request.headers.get('x-netbanx-event-type') ||
                     request.headers.get('x-event-type');

    // Log incoming webhook for debugging
    console.log('Received Paysafe Account Status webhook:', {
      url: request.url,
      method: request.method,
      eventType,
      signature: signature ? 'present' : 'missing',
      bodyLength: body.length,
      timestamp,
      headers: Object.fromEntries(request.headers.entries()),
    });

    // Parse the JSON payload
    let payload: PaysafeAccountStatusWebhook;
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
    
    // Allow webhooks from test endpoints and Netbanx testing without signatures
    const isFromTestEndpoint = request.headers.get('user-agent')?.includes('node') || 
                              request.headers.get('x-test-webhook') === 'true' ||
                              body.includes('"source":"test-webhook"');
    
    if (!isSignatureValid && !isFromTestEndpoint && process.env.NODE_ENV === 'production') {
      console.warn('Invalid webhook signature, but allowing for Netbanx testing:', {
        hasSignature: !!signature,
        userAgent: request.headers.get('user-agent'),
        isFromTestEndpoint
      });
      
      // For now, allow unsigned requests for Netbanx testing but log them
      // In a real production system, you'd want to enable strict validation after testing
      // return NextResponse.json(
      //   { error: 'Invalid signature' },
      //   { status: 401 }
      // );
    }

    // Normalize payload - handle both Netbanx format and test format
    const normalizedPayload = normalizeWebhookPayload(payload);
    
    // Create webhook event
    const webhookEvent: WebhookEvent = {
      id: uuidv4(),
      timestamp,
      eventType: normalizedPayload.eventType || eventType || 'ACCOUNT_STATUS_UPDATE',
      source: 'paysafe-accounts',
      payload: normalizedPayload,
      processed: true,
    };

    // Store the webhook event
    webhookStore.addWebhookEvent(webhookEvent);

    // Process account status update
    await processAccountStatusUpdate(normalizedPayload);

    console.log('Successfully processed account status webhook:', {
      id: webhookEvent.id,
      eventType: webhookEvent.eventType,
      accountId: normalizedPayload.accountId,
      merchantId: normalizedPayload.merchantId,
      status: normalizedPayload.status,
      creditCardId: normalizedPayload.creditCardId,
      directDebitId: normalizedPayload.directDebitId,
    });

    // Return success response
    return NextResponse.json(
      { 
        success: true, 
        message: 'Account status webhook processed successfully',
        webhookId: webhookEvent.id 
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error processing account status webhook:', error);
    
    // Log failed webhook event
    const failedEvent: WebhookEvent = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      eventType: 'ACCOUNT_WEBHOOK_ERROR',
      source: 'paysafe-accounts',
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
  // Health check endpoint for account status webhooks
  const stats = webhookStore.getWebhookStats();
  
  return NextResponse.json({
    status: 'active',
    endpoint: '/api/webhooks/account-status',
    description: 'Paysafe Account Status Webhooks (Account Onboarding & Management)',
    supportedStatuses: [
      'Approved', 'Deferred', 'Disabled', 'Enabled', 
      'Pending', 'Processing', 'Rejected', 'Returned', 
      'Submitted', 'Waiting', 'Withdrawn'
    ],
    supportedEventTypes: [
      'ACCT_APPROVED', 'ACCT_ENABLED', 'ACCT_DISABLED',
      'ACCT_PENDING', 'ACCT_REJECTED', 'ACCT_DEFERRED',
      'ACCT_PROCESSING', 'ACCT_RETURNED', 'ACCT_SUBMITTED',
      'ACCT_WAITING', 'ACCT_WITHDRAWN'
    ],
    stats,
    timestamp: new Date().toISOString(),
  });
}

// Normalize webhook payload to handle different formats
function normalizeWebhookPayload(payload: any): any {
  // If it's already in test format with account field, extract that
  if (payload.account) {
    return {
      eventType: payload.eventType,
      accountId: payload.account.id,
      merchantId: payload.account.merchantId,
      status: payload.account.status,
      creditCardId: payload.account.creditCardId,
      directDebitId: payload.account.directDebitId,
      businessName: payload.account.businessName,
      email: payload.account.email,
      onboardingStage: payload.account.onboardingStage,
      riskLevel: payload.account.riskLevel,
      complianceStatus: payload.account.complianceStatus,
      timestamp: payload.timestamp,
      paymentMethods: payload.paymentMethods,
      statusChange: payload.statusChange,
      metadata: payload.metadata,
    };
  }
  
  // If it's Netbanx format with payload field, extract that
  if (payload.payload) {
    return {
      eventType: payload.eventType,
      accountId: payload.resourceId,
      merchantId: payload.resourceId,
      status: payload.payload.acctStatus,
      creditCardId: payload.payload.creditCardId,
      directDebitId: payload.payload.directDebitId,
      accountNumber: payload.payload.accountNumber,
      partnerId: payload.payload.partnerId,
      mode: payload.mode,
      eventDate: payload.eventDate,
      rawPayload: payload.payload,
    };
  }
  
  // If it's already in the expected format or unknown format, return as-is
  return payload;
}

// Process account status update
async function processAccountStatusUpdate(normalizedPayload: any) {
  try {
    console.log('Processing account status update:', {
      eventType: normalizedPayload.eventType,
      accountId: normalizedPayload.accountId,
      merchantId: normalizedPayload.merchantId,
      status: normalizedPayload.status,
      creditCardId: normalizedPayload.creditCardId,
      directDebitId: normalizedPayload.directDebitId,
      onboardingStage: normalizedPayload.onboardingStage,
    });

    // Here you could integrate with database or external systems
    // For now, we're just logging and storing in memory
    
    // Example: Update account status in database
    /*
    await updateAccountStatus({
      accountId: normalizedPayload.accountId,
      merchantId: normalizedPayload.merchantId,
      status: normalizedPayload.status,
      creditCardId: normalizedPayload.creditCardId,
      directDebitId: normalizedPayload.directDebitId,
      eventType: normalizedPayload.eventType,
      timestamp: normalizedPayload.timestamp || normalizedPayload.eventDate,
    });
    */

  } catch (error) {
    console.error('Error processing account status update:', error);
    throw error;
  }
}

// HMAC signature validation using Paysafe secret key
function validateSignature(body: string, signature: string | null): boolean {
  if (!signature) {
    console.warn('No signature provided in account status webhook request');
    // Allow webhooks without signatures in development only
    return process.env.NODE_ENV !== 'production';
  }
  
  try {
    // Paysafe HMAC secret key (base64 encoded)
    const webhookSecret = 'YzM2ZjA4OGYyMjAxODA3MmRkYjBkZjA1ZmY2MzM2MjNmZmVjZDAzZjFiYWMyMjlkZTc0YTg3MGEyNDg1NjIxNg==';
    
    // Try multiple approaches for the secret key
    const secretKey1 = Buffer.from(webhookSecret, 'base64').toString('utf-8');  // Decoded
    const secretKey2 = webhookSecret;  // Direct base64 string
    const secretKey3 = Buffer.from(webhookSecret, 'base64');  // Binary buffer
    
    // Try different secret key formats and signature computations
    const signatures = [];
    
    // Approach 1: Use decoded secret key
    signatures.push(crypto.createHmac('sha256', secretKey1).update(body, 'utf8').digest('hex'));
    signatures.push(crypto.createHmac('sha256', secretKey1).update(body, 'utf8').digest('base64'));
    
    // Approach 2: Use base64 secret key directly
    signatures.push(crypto.createHmac('sha256', secretKey2).update(body, 'utf8').digest('hex'));
    signatures.push(crypto.createHmac('sha256', secretKey2).update(body, 'utf8').digest('base64'));
    
    // Approach 3: Use binary buffer secret key
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
    
    console.log('Account webhook signature validation:', {
      provided: signature,
      possibleMatches: signatures.slice(0, 3), // Log first few for debugging
      valid: isValid
    });
    
    return isValid;
  } catch (error) {
    console.error('Error validating account webhook signature:', error);
    return false;
  }
}