import { NextRequest, NextResponse } from 'next/server';

// Direct Netbanx webhook endpoint
export async function POST(request: NextRequest) {
  console.log('Received webhook at /netbanx - forwarding to /api/webhooks/netbanx');
  
  try {
    // Forward the request to the actual webhook handler
    const url = new URL('/api/webhooks/netbanx', request.url);
    const body = await request.text();
    
    const response = await fetch(url.toString(), {
      method: 'POST',
      headers: Object.fromEntries(request.headers.entries()),
      body: body,
    });
    
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
    
  } catch (error) {
    console.error('Error forwarding webhook from /netbanx:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Netbanx webhook endpoint active',
    redirect: 'This endpoint forwards to /api/webhooks/netbanx',
    timestamp: new Date().toISOString(),
  });
}