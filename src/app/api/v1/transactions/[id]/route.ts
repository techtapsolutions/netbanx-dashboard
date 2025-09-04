import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { AuthService } from '@/lib/auth';

/**
 * @swagger
 * /api/v1/transactions/{id}:
 *   get:
 *     summary: Get transaction by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID
 *     responses:
 *       200:
 *         description: Transaction details
 *       404:
 *         description: Transaction not found
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const authResult = await authenticateApiRequest(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const { user, company } = authResult;
    const { id } = params;

    const transaction = await db.transaction.findFirst({
      where: {
        id,
        companyId: company?.id,
      },
    });

    if (!transaction) {
      return NextResponse.json(
        { error: 'Transaction not found' },
        { status: 404 }
      );
    }

    await logApiUsage(user.id, company?.id, `GET /api/v1/transactions/${id}`);

    return NextResponse.json({
      success: true,
      data: transaction,
    });

  } catch (error) {
    console.error('API error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// API Authentication helper
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
      const apiToken = await db.apiToken.findUnique({
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
      await db.apiToken.update({
        where: { id: apiToken.id },
        data: { lastUsedAt: new Date() },
      });

      // Check permissions
      const permissions = apiToken.permissions as string[];
      if (!permissions.includes('read:transactions')) {
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
      if (!AuthService.hasPermission(user, 'read:transactions')) {
        return {
          success: false,
          error: 'Insufficient permissions',
          status: 403,
        };
      }

      const company = user.companyId ? await db.company.findUnique({
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
    await db.auditLog.create({
      data: {
        action: 'API_CALL',
        resource: 'API',
        userId: userId.startsWith('api-token-') ? undefined : userId,
        companyId,
        details: { endpoint },
      },
    });
  } catch (error) {
    console.error('Failed to log API usage:', error);
  }
}