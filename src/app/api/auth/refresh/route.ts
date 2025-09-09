import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/auth';
import crypto from 'crypto';
import { Client } from 'pg';

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

    // Use direct PostgreSQL connection for atomic update
    const client = new Client({
      connectionString: process.env.DATABASE_URL
    });

    await client.connect();

    try {
      // Start transaction
      await client.query('BEGIN');

      // Delete old session
      await client.query(
        'DELETE FROM "Session" WHERE token = $1',
        [oldToken]
      );

      // Create new session
      await client.query(`
        INSERT INTO "Session" (token, "userId", "expiresAt", "ipAddress", "userAgent", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        newToken,
        user.id,
        expiresAt,
        request.ip || request.headers.get('x-forwarded-for') || 'unknown',
        request.headers.get('user-agent') || 'unknown',
        new Date(),
        new Date()
      ]);

      // Update user's last activity
      await client.query(
        'UPDATE "User" SET "lastLoginAt" = $1, "updatedAt" = $2 WHERE id = $3',
        [new Date(), new Date(), user.id]
      );

      // Commit transaction
      await client.query('COMMIT');

      // Create audit log entry
      try {
        await client.query(`
          INSERT INTO "AuditLog" (action, "userId", "companyId", "ipAddress", "userAgent", "createdAt")
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          'SESSION_REFRESH',
          user.id,
          user.companyId,
          request.ip || request.headers.get('x-forwarded-for'),
          request.headers.get('user-agent'),
          new Date()
        ]);
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

    } catch (error) {
      // Rollback on error
      await client.query('ROLLBACK');
      throw error;
    } finally {
      await client.end();
    }

  } catch (error) {
    console.error('Session refresh error:', error);
    return NextResponse.json(
      { error: 'Failed to refresh session' },
      { status: 500 }
    );
  }
}