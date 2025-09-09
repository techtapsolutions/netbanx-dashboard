import { NextRequest, NextResponse } from 'next/server';
import { webhookStorePersistent } from '@/lib/webhook-store-persistent';
import { WebhookEvent } from '@/types/webhook';
import { v4 as uuidv4 } from 'uuid';
import { WebhookQueueManager, webhookDeduplicator } from '@/lib/webhook-queue';

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  
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
    
    // Parse the JSON payload early for webhook ID extraction
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

    // Create webhook event with additional metadata
    const webhookEvent: WebhookEvent = {
      id: payload.id || payload.eventData?.id || uuidv4(),
      timestamp,
      eventType: eventType || payload.eventType || 'UNKNOWN',
      source: 'netbanx',
      payload,
      processed: false, // Will be set to true during async processing
      signature,
      ipAddress: request.ip || 
                 request.headers.get('x-forwarded-for') || 
                 request.headers.get('x-real-ip') || 
                 'unknown',
      userAgent: request.headers.get('user-agent') || undefined,
    };

    // Quick deduplication check (fast Redis lookup)
    const isDuplicate = await webhookDeduplicator.isDuplicate(webhookEvent.id, signature);
    if (isDuplicate) {
      console.log(`Rejected duplicate webhook: ${webhookEvent.id}`);
      return NextResponse.json(
        { 
          success: true, 
          message: 'Webhook already processed (duplicate)',
          webhookId: webhookEvent.id,
          duplicate: true
        },
        { status: 200 }
      );
    }

    // Add to async processing queue (non-blocking)
    const jobId = await WebhookQueueManager.addWebhookJob(
      webhookEvent,
      body,
      signature,
      Object.fromEntries(request.headers.entries())
    );

    const processingTime = Date.now() - startTime;

    console.log('Webhook accepted for processing:', {
      id: webhookEvent.id,
      eventType: webhookEvent.eventType,
      jobId,
      processingTime,
      paymentId: payload.eventData?.id,
    });

    // Return immediate success response (async processing)
    return NextResponse.json(
      { 
        success: true, 
        message: 'Webhook accepted for processing',
        webhookId: webhookEvent.id,
        jobId,
        processingTime
      },
      { status: 200 }
    );

  } catch (error) {
    const processingTime = Date.now() - startTime;
    console.error('Error accepting webhook:', error);
    
    return NextResponse.json(
      { 
        error: 'Failed to accept webhook',
        processingTime
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Health check endpoint with database stats and queue status
    const [stats, queueStats] = await Promise.all([
      webhookStorePersistent.getWebhookStats(),
      WebhookQueueManager.getQueueStats(),
    ]);
    
    return NextResponse.json({
      status: 'active',
      endpoint: '/api/webhooks/netbanx',
      processing: 'async',
      stats,
      queue: queueStats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Health check failed:', error);
    
    return NextResponse.json({
      status: 'error',
      endpoint: '/api/webhooks/netbanx',
      error: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString(),
    }, { status: 500 });
  }
}

// Note: Signature validation is now handled asynchronously in the webhook queue processor
// This provides better performance and eliminates the expensive multiple-attempt validation