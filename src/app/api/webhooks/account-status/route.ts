import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface AccountStatusWebhook {
  eventType: string;
  timestamp: string;
  account: {
    id: string; // External Paysafe account ID
    merchantId?: string;
    name: string;
    businessName?: string;
    email: string;
    phone?: string;
    status: string;
    subStatus?: string;
    onboardingStage?: string;
    creditCardId?: string; // Critical CC ID
    directDebitId?: string; // Critical DD ID
    businessType?: string;
    industry?: string;
    website?: string;
    riskLevel?: string;
    complianceStatus?: string;
    approvedAt?: string;
    activatedAt?: string;
  };
  paymentMethods?: Array<{
    type: string;
    externalId: string; // CC ID or DD ID
    name?: string;
    status: string;
    isDefault: boolean;
    capabilities: string[];
    limits?: any;
  }>;
  statusChange?: {
    fromStatus?: string;
    toStatus: string;
    reason?: string;
    description?: string;
    changedBy?: string;
  };
  metadata?: any;
}

export async function POST(request: NextRequest) {
  try {
    const body: AccountStatusWebhook = await request.json();
    const ipAddress = request.headers.get('x-forwarded-for') || 
                      request.headers.get('x-real-ip') || 
                      'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Log the webhook event
    const webhookEvent = await prisma.webhookEvent.create({
      data: {
        eventType: body.eventType || 'ACCOUNT_STATUS_UPDATE',
        source: 'netbanx',
        payload: body,
        ipAddress,
        userAgent,
        processed: false,
      },
    });

    // Process the webhook synchronously for now
    try {
      await processAccountStatusWebhook(body, webhookEvent.id);
    } catch (processError) {
      console.error('Failed to process account webhook:', processError);
      // Don't fail the webhook response, just log the error
    }

    return NextResponse.json({
      success: true,
      message: 'Account status webhook received and processed',
      eventId: webhookEvent.id,
    });

  } catch (error) {
    console.error('Account webhook error:', error);
    
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to process account webhook',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

// Process account status webhook (called by queue worker)
export async function processAccountStatusWebhook(payload: AccountStatusWebhook, webhookId: string) {
  try {
    const { account, paymentMethods, statusChange } = payload;
    
    // Find or create the account
    const existingAccount = await prisma.account.findUnique({
      where: { externalId: account.id },
      include: { paymentMethods: true, statusHistory: true },
    });

    let accountRecord;
    
    if (existingAccount) {
      // Update existing account
      accountRecord = await prisma.account.update({
        where: { externalId: account.id },
        data: {
          merchantId: account.merchantId,
          accountName: account.name,
          businessName: account.businessName,
          email: account.email,
          phone: account.phone,
          status: account.status,
          subStatus: account.subStatus,
          onboardingStage: account.onboardingStage,
          creditCardId: account.creditCardId,
          directDebitId: account.directDebitId,
          businessType: account.businessType,
          industry: account.industry,
          website: account.website,
          riskLevel: account.riskLevel,
          complianceStatus: account.complianceStatus,
          approvedAt: account.approvedAt ? new Date(account.approvedAt) : null,
          activatedAt: account.activatedAt ? new Date(account.activatedAt) : null,
          webhookEventId: webhookId,
          metadata: payload.metadata,
        },
      });
    } else {
      // Create new account
      accountRecord = await prisma.account.create({
        data: {
          externalId: account.id,
          merchantId: account.merchantId,
          accountName: account.name,
          businessName: account.businessName,
          email: account.email,
          phone: account.phone,
          status: account.status,
          subStatus: account.subStatus,
          onboardingStage: account.onboardingStage,
          creditCardId: account.creditCardId,
          directDebitId: account.directDebitId,
          businessType: account.businessType,
          industry: account.industry,
          website: account.website,
          riskLevel: account.riskLevel,
          complianceStatus: account.complianceStatus,
          approvedAt: account.approvedAt ? new Date(account.approvedAt) : null,
          activatedAt: account.activatedAt ? new Date(account.activatedAt) : null,
          webhookEventId: webhookId,
          metadata: payload.metadata,
        },
      });
    }

    // Record status change history
    if (statusChange) {
      await prisma.accountStatusHistory.create({
        data: {
          accountId: accountRecord.id,
          fromStatus: statusChange.fromStatus,
          toStatus: statusChange.toStatus,
          subStatus: account.subStatus,
          stage: account.onboardingStage,
          reason: statusChange.reason,
          description: statusChange.description,
          changedBy: statusChange.changedBy || 'webhook',
          metadata: payload.metadata,
        },
      });
    }

    // Update payment methods if provided
    if (paymentMethods && paymentMethods.length > 0) {
      for (const pm of paymentMethods) {
        // Try to find existing payment method
        const existingPM = await prisma.paymentMethod.findFirst({
          where: {
            accountId: accountRecord.id,
            externalId: pm.externalId,
          },
        });

        if (existingPM) {
          // Update existing payment method
          await prisma.paymentMethod.update({
            where: { id: existingPM.id },
            data: {
              type: pm.type,
              name: pm.name,
              status: pm.status,
              isDefault: pm.isDefault,
              capabilities: pm.capabilities,
              limits: pm.limits,
              activatedAt: pm.status === 'ACTIVE' ? new Date() : undefined,
            },
          });
        } else {
          // Create new payment method
          await prisma.paymentMethod.create({
            data: {
              accountId: accountRecord.id,
              type: pm.type,
              externalId: pm.externalId,
              name: pm.name,
              status: pm.status,
              isDefault: pm.isDefault,
              capabilities: pm.capabilities,
              limits: pm.limits,
              activatedAt: pm.status === 'ACTIVE' ? new Date() : undefined,
            },
          });
        }
      }
    }

    // Mark webhook as processed
    await prisma.webhookEvent.update({
      where: { id: webhookId },
      data: { processed: true },
    });

    console.log(`Successfully processed account webhook for account ${account.id}`);
    
  } catch (error) {
    console.error('Error processing account webhook:', error);
    
    // Mark webhook as failed
    await prisma.webhookEvent.update({
      where: { id: webhookId },
      data: { 
        processed: false,
        error: error instanceof Error ? error.message : 'Processing failed',
      },
    });
    
    throw error;
  }
}