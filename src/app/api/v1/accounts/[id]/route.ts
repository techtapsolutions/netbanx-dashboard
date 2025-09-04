import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { AuthService } from '@/lib/auth';

const prisma = new PrismaClient();

/**
 * @swagger
 * /api/v1/accounts/{id}:
 *   get:
 *     summary: Get account by ID
 *     description: Retrieve detailed account information including payment method IDs and onboarding history
 *     security:
 *       - BearerAuth: []
 *       - ApiKeyAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Account external ID (Paysafe account ID)
 *     responses:
 *       200:
 *         description: Account details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     externalId:
 *                       type: string
 *                     creditCardId:
 *                       type: string
 *                       description: Critical CC ID for payment processing
 *                     directDebitId:
 *                       type: string
 *                       description: Critical DD ID for direct debit processing
 *                     status:
 *                       type: string
 *                     onboardingStage:
 *                       type: string
 *                     paymentMethods:
 *                       type: array
 *                       items:
 *                         type: object
 *                     statusHistory:
 *                       type: array
 *                       items:
 *                         type: object
 *       404:
 *         description: Account not found
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const authResult = await authenticateApiRequest(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const { user, company } = authResult;
    const { id } = await params;

    // Build query with company restriction if needed
    const whereClause: any = { externalId: id };
    if (company && user.role !== 'SUPER_ADMIN') {
      whereClause.companyId = company.id;
    }

    const account = await prisma.account.findFirst({
      where: whereClause,
      include: {
        paymentMethods: {
          select: {
            id: true,
            type: true,
            externalId: true,
            name: true,
            status: true,
            isDefault: true,
            capabilities: true,
            limits: true,
            createdAt: true,
            activatedAt: true,
          },
        },
        statusHistory: {
          orderBy: { timestamp: 'desc' },
          select: {
            fromStatus: true,
            toStatus: true,
            subStatus: true,
            stage: true,
            reason: true,
            description: true,
            changedBy: true,
            timestamp: true,
          },
        },
      },
    });

    if (!account) {
      return NextResponse.json(
        { error: 'Account not found' },
        { status: 404 }
      );
    }

    await logApiUsage(user.id, company?.id, `GET /api/v1/accounts/${id}`);

    return NextResponse.json({
      success: true,
      data: account,
    });

  } catch (error) {
    console.error('Account API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// API Authentication helper (reused from accounts route)
async function authenticateApiRequest(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader) {
      return {
        success: false,
        error: 'Authorization header required',
        status: 401,
      };
    }

    let token: string;
    let isApiToken = false;

    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.replace('Bearer ', '');
    } else if (authHeader.startsWith('Api-Key ')) {
      token = authHeader.replace('Api-Key ', '');
      isApiToken = true;
    } else {
      return {
        success: false,
        error: 'Invalid authorization header format',
        status: 401,
      };
    }

    if (isApiToken) {
      // API Token authentication
      const apiToken = await prisma.apiToken.findUnique({
        where: { token },
        include: { company: true },
      });

      if (!apiToken || !apiToken.isActive || (apiToken.expiresAt && apiToken.expiresAt < new Date())) {
        return {
          success: false,
          error: 'Invalid or expired API token',
          status: 401,
        };
      }

      // Update last used timestamp
      await prisma.apiToken.update({
        where: { id: apiToken.id },
        data: { lastUsedAt: new Date() },
      });

      // Check permissions
      const permissions = apiToken.permissions as string[];
      if (!permissions.includes('read:accounts')) {
        return {
          success: false,
          error: 'Insufficient permissions',
          status: 403,
        };
      }

      return {
        success: true,
        user: {
          id: `api-token-${apiToken.id}`,
          email: apiToken.company.email,
          role: 'API_TOKEN',
          companyId: apiToken.companyId,
        },
        company: apiToken.company,
      };

    } else {
      // Session token authentication
      const user = await AuthService.verifySession(token);
      
      if (!user) {
        return {
          success: false,
          error: 'Invalid or expired session token',
          status: 401,
        };
      }

      // Check permission
      if (!AuthService.hasPermission(user, 'read:accounts')) {
        return {
          success: false,
          error: 'Insufficient permissions',
          status: 403,
        };
      }

      const company = user.companyId ? await prisma.company.findUnique({
        where: { id: user.companyId },
      }) : null;

      return {
        success: true,
        user,
        company,
      };
    }

  } catch (error) {
    console.error('Authentication error:', error);
    return {
      success: false,
      error: 'Authentication failed',
      status: 500,
    };
  }
}

// Log API usage for monitoring
async function logApiUsage(userId: string, companyId: string | undefined, endpoint: string) {
  try {
    await prisma.auditLog.create({
      data: {
        action: 'API_CALL',
        resource: 'ACCOUNTS_API',
        userId: userId.startsWith('api-token-') ? undefined : userId,
        companyId,
        details: { endpoint },
      },
    });
  } catch (error) {
    console.error('Failed to log API usage:', error);
  }
}