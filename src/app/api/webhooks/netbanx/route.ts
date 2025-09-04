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
    
    // Get headers for validation
    const signature = request.headers.get('x-paysafe-signature');
    const eventType = request.headers.get('x-paysafe-event-type');
    
    // Log incoming webhook for debugging
    console.log('Received Netbanx webhook:', {
      eventType,
      signature: signature ? 'present' : 'missing',
      bodyLength: body.length,
      timestamp,
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

// Simple signature validation (in production, use proper HMAC verification)
function validateSignature(body: string, signature: string | null): boolean {
  if (!signature) {
    // Allow webhooks without signatures in development
    return process.env.NODE_ENV !== 'production';
  }
  
  // In production, you would verify the signature using your webhook secret:
  // const expectedSignature = crypto
  //   .createHmac('sha256', process.env.WEBHOOK_SECRET!)
  //   .update(body)
  //   .digest('hex');
  // return `sha256=${expectedSignature}` === signature;
  
  // For demo purposes, accept any signature
  return true;
}