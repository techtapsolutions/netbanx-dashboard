import { NextRequest, NextResponse } from 'next/server';

// Test endpoint to simulate account status webhook
export async function POST(request: NextRequest) {
  try {
    // Sample account status webhook payload
    const testPayload = {
      eventType: 'ACCOUNT_STATUS_UPDATE',
      timestamp: new Date().toISOString(),
      account: {
        id: 'PAY_' + Math.random().toString(36).substring(2, 15),
        merchantId: 'MERCH_' + Math.random().toString(36).substring(2, 10),
        name: 'Test Merchant Account',
        businessName: 'Test Business LLC',
        email: 'merchant@testbusiness.com',
        phone: '+1-555-0123',
        status: 'APPROVED',
        subStatus: 'ACTIVE',
        onboardingStage: 'COMPLETE',
        creditCardId: 'CC_' + Math.random().toString(36).substring(2, 15), // Critical CC ID
        directDebitId: 'DD_' + Math.random().toString(36).substring(2, 15), // Critical DD ID
        businessType: 'LLC',
        industry: 'E_COMMERCE',
        website: 'https://testbusiness.com',
        riskLevel: 'LOW',
        complianceStatus: 'COMPLIANT',
        approvedAt: new Date().toISOString(),
        activatedAt: new Date().toISOString(),
      },
      paymentMethods: [
        {
          type: 'CREDIT_CARD',
          externalId: 'CC_' + Math.random().toString(36).substring(2, 15),
          name: 'Visa/Mastercard Processing',
          status: 'ACTIVE',
          isDefault: true,
          capabilities: ['PAYMENT', 'REFUND', 'RECURRING'],
          limits: {
            dailyLimit: 50000,
            monthlyLimit: 1000000,
            transactionLimit: 10000,
          },
        },
        {
          type: 'DIRECT_DEBIT',
          externalId: 'DD_' + Math.random().toString(36).substring(2, 15),
          name: 'Bank Transfer Processing',
          status: 'ACTIVE',
          isDefault: false,
          capabilities: ['PAYMENT', 'REFUND'],
          limits: {
            dailyLimit: 25000,
            monthlyLimit: 500000,
            transactionLimit: 5000,
          },
        },
      ],
      statusChange: {
        fromStatus: 'IN_REVIEW',
        toStatus: 'APPROVED',
        reason: 'KYC_COMPLETED',
        description: 'All verification documents approved',
        changedBy: 'system',
      },
      metadata: {
        source: 'test-webhook',
        processingTime: '2.5s',
        verificationLevel: 'ENHANCED',
      },
    };

    // Send the webhook to the actual account status endpoint
    const response = await fetch(`${request.nextUrl.origin}/api/webhooks/account-status`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testPayload),
    });

    const result = await response.json();

    return NextResponse.json({
      success: true,
      message: 'Test account status webhook sent',
      testPayload,
      result,
    });

  } catch (error) {
    console.error('Test webhook error:', error);
    return NextResponse.json(
      { error: 'Failed to send test webhook' },
      { status: 500 }
    );
  }
}

// Generate multiple test accounts
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const count = Math.min(parseInt(searchParams.get('count') || '3'), 10);

  const testAccounts = [];
  
  for (let i = 0; i < count; i++) {
    const statuses = ['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED'];
    const stages = ['KYC', 'DOCUMENTS', 'VERIFICATION', 'SETUP', 'COMPLETE'];
    const industries = ['E_COMMERCE', 'RETAIL', 'SERVICES', 'HEALTHCARE', 'FINANCE'];
    
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const stage = stages[Math.floor(Math.random() * stages.length)];
    
    testAccounts.push({
      eventType: 'ACCOUNT_STATUS_UPDATE',
      timestamp: new Date().toISOString(),
      account: {
        id: 'PAY_' + Math.random().toString(36).substring(2, 15),
        merchantId: 'MERCH_' + Math.random().toString(36).substring(2, 10),
        name: `Test Merchant ${i + 1}`,
        businessName: `Test Business ${i + 1} LLC`,
        email: `merchant${i + 1}@testbusiness.com`,
        phone: `+1-555-01${i.toString().padStart(2, '0')}`,
        status,
        subStatus: status === 'APPROVED' ? 'ACTIVE' : 'PENDING_REVIEW',
        onboardingStage: stage,
        creditCardId: status === 'APPROVED' ? 'CC_' + Math.random().toString(36).substring(2, 15) : null,
        directDebitId: status === 'APPROVED' ? 'DD_' + Math.random().toString(36).substring(2, 15) : null,
        businessType: 'LLC',
        industry: industries[Math.floor(Math.random() * industries.length)],
        website: `https://testbusiness${i + 1}.com`,
        riskLevel: Math.random() > 0.7 ? 'MEDIUM' : 'LOW',
        complianceStatus: status === 'APPROVED' ? 'COMPLIANT' : 'PENDING',
        approvedAt: status === 'APPROVED' ? new Date().toISOString() : null,
        activatedAt: status === 'APPROVED' ? new Date().toISOString() : null,
      },
      statusChange: {
        fromStatus: 'PENDING',
        toStatus: status,
        reason: `AUTOMATED_REVIEW_${i}`,
        description: `Account ${i + 1} status update`,
        changedBy: 'system',
      },
      metadata: {
        source: 'bulk-test-webhook',
        batchId: Date.now(),
      },
    });
  }

  return NextResponse.json({
    success: true,
    message: `Generated ${count} test account payloads`,
    accounts: testAccounts,
  });
}