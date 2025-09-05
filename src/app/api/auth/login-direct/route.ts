import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'pg';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Use direct PostgreSQL connection to avoid Prisma prepared statement issues
    const client = new Client({
      connectionString: process.env.DATABASE_URL
    });

    await client.connect();

    try {
      // Find user
      const userResult = await client.query(
        'SELECT id, email, "passwordHash", "firstName", "lastName", role, "isActive", "emailVerified", "companyId" FROM "User" WHERE email = $1',
        [email.toLowerCase()]
      );

      if (userResult.rows.length === 0) {
        return NextResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        );
      }

      const user = userResult.rows[0];

      if (!user.isActive) {
        return NextResponse.json(
          { error: 'Account is not active' },
          { status: 401 }
        );
      }

      // Verify password
      const isValid = await bcrypt.compare(password, user.passwordHash);
      if (!isValid) {
        return NextResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        );
      }

      // Update last login
      await client.query(
        'UPDATE "User" SET "lastLoginAt" = $1, "updatedAt" = $2 WHERE id = $3',
        [new Date(), new Date(), user.id]
      );

      // Create session token
      const token = crypto.randomBytes(48).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Insert session
      await client.query(`
        INSERT INTO "Session" (token, "userId", "expiresAt", "ipAddress", "userAgent", "createdAt", "updatedAt")
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        token,
        user.id,
        expiresAt,
        request.ip || request.headers.get('x-forwarded-for') || 'unknown',
        request.headers.get('user-agent') || 'unknown',
        new Date(),
        new Date()
      ]);

      // Get company info if user has one
      let company = null;
      if (user.companyId) {
        const companyResult = await client.query(
          'SELECT id, name FROM "Company" WHERE id = $1',
          [user.companyId]
        );
        if (companyResult.rows.length > 0) {
          company = companyResult.rows[0];
        }
      }

      // Create audit log entry
      try {
        await client.query(`
          INSERT INTO "AuditLog" (action, "userId", "companyId", "ipAddress", "userAgent", "createdAt")
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [
          'LOGIN',
          user.id,
          user.companyId,
          request.ip || request.headers.get('x-forwarded-for'),
          request.headers.get('user-agent'),
          new Date()
        ]);
      } catch (auditError) {
        // Don't fail login if audit log fails
        console.error('Audit log failed:', auditError);
      }

      const response = NextResponse.json({
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            companyId: user.companyId,
            company: company,
          },
          expiresAt,
        },
      });

      // Set session cookie
      response.cookies.set('session-token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 24 * 60 * 60, // 24 hours
        path: '/',
      });

      return response;

    } finally {
      await client.end();
    }

  } catch (error) {
    console.error('Direct login error:', error);
    
    return NextResponse.json(
      { error: 'Login failed. Please try again.' },
      { status: 500 }
    );
  }
}