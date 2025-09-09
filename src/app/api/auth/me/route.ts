import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/auth';
import crypto from 'crypto';

// Generate CSRF token
function generateCSRFToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export async function GET(request: NextRequest) {
  try {
    let token: string | null = null;
    
    // 1. First try to get token from httpOnly cookie (most secure)
    const cookieToken = request.cookies.get('session_token')?.value;
    
    // 2. If no cookie, check Authorization header (fallback)
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') 
      ? authHeader.replace('Bearer ', '') 
      : null;
    
    // Use cookie token if available, otherwise use bearer token
    token = cookieToken || bearerToken;
    
    if (!token) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Verify session with the token
    const user = await AuthService.verifySession(token);

    if (!user) {
      // Clear invalid cookie if it exists
      const response = NextResponse.json(
        { error: 'Invalid or expired session' },
        { status: 401 }
      );
      
      if (cookieToken) {
        response.cookies.delete('session_token');
      }
      
      return response;
    }

    // Generate CSRF token for this session
    const csrfToken = generateCSRFToken();
    
    // Create response with user data
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        companyId: user.companyId,
        isActive: user.isActive,
      },
    });

    // Add CSRF token to response header
    response.headers.set('X-CSRF-Token', csrfToken);
    
    // Refresh cookie expiration if using cookie auth
    if (cookieToken) {
      response.cookies.set('session_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60, // 24 hours
        path: '/',
      });
    }

    return response;

  } catch (error) {
    console.error('Auth verification error:', error);
    return NextResponse.json(
      { error: 'Authentication failed' },
      { status: 500 }
    );
  }
}