import { NextResponse } from 'next/server';
import { sessionCleanup } from '@/lib/session-cleanup';

// Initialize services on application start
export async function GET() {
  try {
    // Start session cleanup service
    sessionCleanup.start();
    
    return NextResponse.json({
      success: true,
      message: 'Services initialized',
      services: {
        sessionCleanup: 'started',
      },
    });
  } catch (error) {
    console.error('Service initialization error:', error);
    return NextResponse.json(
      { error: 'Failed to initialize services' },
      { status: 500 }
    );
  }
}