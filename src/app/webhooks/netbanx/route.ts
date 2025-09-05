import { NextRequest, NextResponse } from 'next/server';

// Redirect to the proper API endpoint
export async function POST(request: NextRequest) {
  console.log('Received webhook at /webhooks/netbanx - redirecting to /api/webhooks/netbanx');
  
  // Forward the request to the actual webhook handler
  const url = new URL('/api/webhooks/netbanx', request.url);
  
  return fetch(url.toString(), {
    method: 'POST',
    headers: Object.fromEntries(request.headers.entries()),
    body: request.body,
  }).then(response => response.json()).then(data => 
    NextResponse.json(data, { status: 200 })
  ).catch(error => {
    console.error('Error forwarding webhook:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  });
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: 'Webhook endpoint active',
    redirect: 'This endpoint forwards to /api/webhooks/netbanx',
    timestamp: new Date().toISOString(),
  });
}