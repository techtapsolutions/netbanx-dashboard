import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';
import { AuthService } from '@/lib/auth';
import { withCache, CACHE_CONFIGS } from '@/lib/api-cache';

/**
 * @swagger
 * /api/v1/transactions:
 *   get:
 *     summary: Get transactions
 *     description: Retrieve paginated list of transactions with optional filters
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           minimum: 1
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 20
 *         description: Number of transactions per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [COMPLETED, PENDING, FAILED, CANCELLED]
 *         description: Filter by transaction status
 *       - in: query
 *         name: currency
 *         schema:
 *           type: string
 *         description: Filter by currency code
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter transactions from this date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Filter transactions until this date
 *     responses:
 *       200:
 *         description: Successful response
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
 *                     transactions:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Transaction'
 *                     pagination:
 *                       $ref: '#/components/schemas/Pagination'
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 */
// Cached transactions endpoint
const transactionsHandler = withCache({
  ...CACHE_CONFIGS.TRANSACTIONS,
  varyBy: ['authorization', 'page', 'limit', 'status', 'currency', 'startDate', 'endDate'],
})(async function GET(request: NextRequest) {
  try {
    // Authenticate API request
    const authResult = await authenticateApiRequest(request);
    if (!authResult.success) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const { user, company } = authResult;

    // Parse query parameters
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 100);
    const status = searchParams.get('status');
    const currency = searchParams.get('currency');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    // Build filters
    const filters: any = {};
    if (status) filters.status = status;
    if (currency) filters.currency = currency;
    if (startDate) filters.startDate = new Date(startDate);
    if (endDate) filters.endDate = new Date(endDate);

    // Get transactions with company restriction
    const result = await DatabaseService.getTransactionsPaginated(
      page,
      limit,
      {
        ...filters,
        companyId: company?.id, // Restrict to company's transactions
      }
    );

    // Log API usage
    await logApiUsage(user.id, company?.id, 'GET /api/v1/transactions');

    return NextResponse.json({
      success: true,
      data: result,
      cached: true,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('API error:', error);
    
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});

export { transactionsHandler as GET };


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