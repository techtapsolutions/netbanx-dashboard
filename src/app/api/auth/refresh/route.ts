import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/auth';
import crypto from 'crypto';
import { db } from '@/lib/database';

export async function POST(request: NextRequest) {
  try {
    // Get token from cookie or header
    const cookieToken = request.cookies.get('session_token')?.value;
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') 
      ? authHeader.replace('Bearer ', '') 
      : null;
    
    const oldToken = cookieToken || bearerToken;
    
    if (!oldToken) {
      return NextResponse.json(
        { error: 'No session to refresh' },
        { status: 401 }
      );
    }

    // Verify the old session is still valid
    const user = await AuthService.verifySession(oldToken);
    
    if (!user) {
      const response = NextResponse.json(
        { error: 'Session expired or invalid' },
        { status: 401 }
      );
      
      // Clear invalid cookie
      if (cookieToken) {
        response.cookies.delete('session_token');
      }
      
      return response;
    }

    // Generate new session token
    const newToken = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    try {
      // Use Prisma transaction for atomic operations
      await db.$transaction(async (tx) => {
        // Delete old session
        await tx.session.delete({
          where: { token: oldToken }
        });

        // Create new session
        await tx.session.create({
          data: {
            token: newToken,
            userId: user.id,
            expiresAt,
            ipAddress: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
            userAgent: request.headers.get('user-agent') || 'unknown',
          }
        });

        // Update user's last activity
        await tx.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: new Date(),
            updatedAt: new Date()
          }
        });
      });

      // Create audit log entry (outside transaction)
      try {
        await db.auditLog.create({
          data: {
            action: 'SESSION_REFRESH',
            userId: user.id,
            companyId: user.companyId,
            ipAddress: request.ip || request.headers.get('x-forwarded-for'),
            userAgent: request.headers.get('user-agent'),
          }
        });
      } catch (auditError) {
        // Don't fail refresh if audit log fails
        console.error('Audit log failed:', auditError);
      }

      // Create response
      const response = NextResponse.json({
        success: true,
        sessionToken: newToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          companyId: user.companyId,
        },
        expiresAt,
      });

      // Set new cookie
      response.cookies.set('session_token', newToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60, // 24 hours
        path: '/',
      });

      return response;

    } catch (dbError) {
      console.error('Database error during refresh:', dbError);
      return NextResponse.json(
        { error: 'Failed to refresh session' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Session refresh error:', error);
    return NextResponse.json(
      { error: 'Failed to refresh session' },
      { status: 500 }
    );
  }
}