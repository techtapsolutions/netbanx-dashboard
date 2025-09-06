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
      description: 'Paysafe Account Status Webhooks (Account Onboarding & Management)',
      methods: ['POST', 'GET'],
      features: ['Account status updates', 'Account approval/rejection', 'Onboarding status changes'],
      supportedStatuses: ['Approved', 'Deferred', 'Disabled', 'Enabled', 'Pending', 'Processing', 'Rejected', 'Returned', 'Submitted', 'Waiting', 'Withdrawn'],
      supportedEventTypes: ['ACCT_APPROVED', 'ACCT_ENABLED', 'ACCT_DISABLED', 'ACCT_PENDING', 'ACCT_REJECTED', 'ACCT_DEFERRED', 'ACCT_PROCESSING', 'ACCT_RETURNED', 'ACCT_SUBMITTED', 'ACCT_WAITING', 'ACCT_WITHDRAWN']
    },
    {
      path: '/api/webhooks/direct-debit',
      description: 'Paysafe Direct Debit Payment Webhooks',
      methods: ['POST', 'GET'],
      features: ['Direct debit transactions', 'Mandate management', 'Bank account payments'],
      supportedEventTypes: ['DD_PAYMENT_COMPLETED', 'DD_PAYMENT_FAILED', 'DD_PAYMENT_PENDING', 'DD_PAYMENT_RETURNED', 'DD_PAYMENT_CANCELLED', 'DD_MANDATE_CREATED', 'DD_MANDATE_CANCELLED', 'DD_MANDATE_FAILED'],
      supportedStatuses: ['COMPLETED', 'FAILED', 'PENDING', 'RETURNED', 'CANCELLED', 'PROCESSING', 'SETTLED', 'DISPUTED']
    },
    {
      path: '/api/webhooks/alternate-payments',
      description: 'Paysafe Alternate Payment Webhooks',
      methods: ['POST', 'GET'],
      features: ['Digital wallets', 'Alternative payment methods', 'Third-party payments'],
      supportedPaymentMethods: ['PAYPAL', 'APPLE_PAY', 'GOOGLE_PAY', 'VENMO', 'SKRILL', 'NETELLER', 'PAYSAFECARD', 'SOFORT', 'GIROPAY', 'IDEAL', 'BANCONTACT', 'EPS', 'P24', 'MULTIBANCO', 'MYBANK'],
      supportedEventTypes: ['AP_PAYMENT_COMPLETED', 'AP_PAYMENT_FAILED', 'AP_PAYMENT_PENDING', 'AP_PAYMENT_CANCELLED', 'AP_REFUND_COMPLETED', 'AP_REFUND_FAILED', 'AP_REFUND_PENDING'],
      supportedStatuses: ['COMPLETED', 'FAILED', 'PENDING', 'CANCELLED', 'PROCESSING', 'SETTLED', 'REFUNDED']
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