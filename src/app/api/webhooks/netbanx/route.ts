import { NextRequest, NextResponse } from 'next/server';
import { webhookStore } from '@/lib/webhook-store';
import { WebhookEvent } from '@/types/webhook';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

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
    console.log('Received Netbanx webhook:', {
      url: request.url,
      method: request.method,
      eventType,
      signature: signature ? 'present' : 'missing',
      bodyLength: body.length,
      timestamp,
      headers: Object.fromEntries(request.headers.entries()),
    });

    // Parse the JSON payload
    let payload;
    try {
      payload = JSON.parse(body);
    } catch (error) {
      console.error('Invalid JSON payload:', error);
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }

    // Validate webhook signature if present (in production you'd verify against a secret)
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
      eventType: eventType || payload.eventType || 'UNKNOWN',
      source: 'netbanx',
      payload,
      processed: true,
    };

    // Store the webhook event
    webhookStore.addWebhookEvent(webhookEvent);

    console.log('Successfully processed webhook:', {
      id: webhookEvent.id,
      eventType: webhookEvent.eventType,
      paymentId: payload.eventData?.id,
    });

    // Return success response
    return NextResponse.json(
      { 
        success: true, 
        message: 'Webhook processed successfully',
        webhookId: webhookEvent.id 
      },
      { status: 200 }
    );

  } catch (error) {
    console.error('Error processing webhook:', error);
    
    // Log failed webhook event
    const failedEvent: WebhookEvent = {
      id: uuidv4(),
      timestamp: new Date().toISOString(),
      eventType: 'WEBHOOK_ERROR',
      source: 'netbanx',
      payload: { id: 'error', eventType: 'ERROR', eventData: { id: 'error', merchantRefNum: 'error' } },
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
  // Health check endpoint
  const stats = webhookStore.getWebhookStats();
  
  return NextResponse.json({
    status: 'active',
    endpoint: '/api/webhooks/netbanx',
    stats,
    timestamp: new Date().toISOString(),
  });
}

// HMAC signature validation using Netbanx secret key
function validateSignature(body: string, signature: string | null): boolean {
  if (!signature) {
    console.warn('No signature provided in webhook request');
    // Allow webhooks without signatures in development only
    return process.env.NODE_ENV !== 'production';
  }
  
  try {
    // Netbanx HMAC secret key (base64 encoded)
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
    
    console.log('Signature validation:', {
      provided: signature,
      possibleMatches: signatures.slice(0, 3), // Log first few for debugging
      valid: isValid
    });
    
    return isValid;
  } catch (error) {
    console.error('Error validating signature:', error);
    return false;
  }
}