import { NextRequest, NextResponse } from 'next/server';
import { webhookStore } from '@/lib/webhook-store';

export async function POST(request: NextRequest) {
  try {
    const { eventType = 'PAYMENT_COMPLETED', count = 1 } = await request.json();
    
    const eventTypes = [
      'PAYMENT_COMPLETED',
      'PAYMENT_PENDING', 
      'PAYMENT_FAILED',
      'PAYMENT_CANCELLED',
      'PAYMENT_REFUNDED'
    ];
    
    const generatedEvents = [];
    
    for (let i = 0; i < Math.min(count, 10); i++) {
      const randomEventType = eventType === 'random' 
        ? eventTypes[Math.floor(Math.random() * eventTypes.length)]
        : eventType;
        
      const mockEvent = webhookStore.generateMockWebhook(randomEventType);
      webhookStore.addWebhookEvent(mockEvent);
      generatedEvents.push(mockEvent);
    }
    
    return NextResponse.json({
      success: true,
      message: `Generated ${generatedEvents.length} mock webhook event(s)`,
      events: generatedEvents,
    });
    
  } catch (error) {
    console.error('Error generating test webhooks:', error);
    return NextResponse.json(
      { error: 'Failed to generate test webhooks' },
      { status: 500 }
    );
  }
}

export async function GET() {
  // Return current webhook stats and recent events
  const stats = webhookStore.getWebhookStats();
  const recentEvents = webhookStore.getWebhookEvents(5);
  
  return NextResponse.json({
    stats,
    recentEvents,
    availableEventTypes: [
      'PAYMENT_COMPLETED',
      'PAYMENT_PENDING', 
      'PAYMENT_FAILED',
      'PAYMENT_CANCELLED',
      'PAYMENT_REFUNDED'
    ],
  });
}