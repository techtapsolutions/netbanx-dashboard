import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const baseUrl = new URL(request.url).origin;
  
  const webhookEndpoints = [
    {
      path: '/api/webhooks/netbanx',
      description: 'Primary Netbanx webhook endpoint with HMAC verification',
      methods: ['POST', 'GET'],
      features: ['HMAC SHA-256 verification', 'Multiple signature formats', 'Comprehensive logging']
    },
    {
      path: '/webhooks/netbanx',
      description: 'Alternative webhook endpoint (forwards to primary)',
      methods: ['POST', 'GET'],
      features: ['Request forwarding', 'Backwards compatibility']
    },
    {
      path: '/netbanx',
      description: 'Direct Netbanx endpoint (forwards to primary)',
      methods: ['POST', 'GET'],
      features: ['Request forwarding', 'Simple path']
    },
    {
      path: '/webhook',
      description: 'Generic webhook endpoint (forwards to primary)',
      methods: ['POST', 'GET'],
      features: ['Request forwarding', 'Generic path']
    },
    {
      path: '/api/webhooks/account-status',
      description: 'Paysafe Account Status Webhooks',
      methods: ['POST', 'GET'],
      features: ['Account status updates', 'Account approval/rejection', 'Multiple status types'],
      supportedStatuses: ['Approved', 'Deferred', 'Disabled', 'Enabled', 'Pending', 'Processing', 'Rejected', 'Returned', 'Submitted', 'Waiting', 'Withdrawn'],
      supportedEventTypes: ['ACCT_APPROVED', 'ACCT_ENABLED', 'ACCT_DISABLED', 'ACCT_PENDING', 'ACCT_REJECTED', 'ACCT_DEFERRED', 'ACCT_PROCESSING', 'ACCT_RETURNED', 'ACCT_SUBMITTED', 'ACCT_WAITING', 'ACCT_WITHDRAWN']
    }
  ];

  const hmacInfo = {
    algorithm: 'HMAC-SHA256',
    secretKey: 'YzM2ZjA4OGYyMjAxODA3MmRkYjBkZjA1ZmY2MzM2MjNmZmVjZDAzZjFiYWMyMjlkZTc0YTg3MGEyNDg1NjIxNg== (base64)',
    supportedHeaders: [
      'x-paysafe-signature',
      'x-netbanx-signature', 
      'x-signature',
      'signature'
    ],
    supportedFormats: [
      'sha256={hash}',
      'SHA256={hash}',
      '{hash}',
      '{HASH}'
    ]
  };

  return NextResponse.json({
    status: 'active',
    timestamp: new Date().toISOString(),
    baseUrl,
    endpoints: webhookEndpoints.map(endpoint => ({
      ...endpoint,
      fullUrl: `${baseUrl}${endpoint.path}`
    })),
    security: hmacInfo,
    testEndpoint: `${baseUrl}/api/webhooks/test`,
    documentation: `${baseUrl}/api/docs`
  }, { status: 200 });
}