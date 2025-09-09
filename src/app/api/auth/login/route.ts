import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function POST(request: NextRequest) {
  try {
    // Add detailed logging for JSON parsing issues
    console.log('🔍 Login request received');
    console.log('Content-Type:', request.headers.get('content-type'));
    
    let body;
    try {
      body = await request.json();
      console.log('✅ JSON parsed successfully');
    } catch (parseError) {
      console.error('❌ JSON parsing failed:', parseError);
      // Try to read the raw text to see what we're dealing with
      try {
        const rawText = await request.text();
        console.log('Raw request body:', rawText.substring(0, 200) + '...');
      } catch (textError) {
        console.error('Could not read raw text:', textError);
      }
      
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }
    
    const { email, password } = body;

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    try {
      // Find user using Prisma
      const user = await db.user.findUnique({
        where: { 
          email: email.toLowerCase() 
        },
        include: {
          company: true
        }
      });

      if (!user) {
        return NextResponse.json(
          { error: 'Invalid credentials' },
          { status: 401 }
        );
      }

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
      await db.user.update({
        where: { id: user.id },
        data: { 
          lastLoginAt: new Date(),
          updatedAt: new Date()
        }
      });

      // Create session token
      const token = crypto.randomBytes(48).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

      // Insert session using Prisma
      await db.session.create({
        data: {
          token,
          userId: user.id,
          expiresAt,
          ipAddress: request.ip || request.headers.get('x-forwarded-for') || 'unknown',
          userAgent: request.headers.get('user-agent') || 'unknown',
        }
      });

      // Create audit log entry
      try {
        await db.auditLog.create({
          data: {
            action: 'LOGIN',
            userId: user.id,
            companyId: user.companyId,
            ipAddress: request.ip || request.headers.get('x-forwarded-for'),
            userAgent: request.headers.get('user-agent'),
          }
        });
      } catch (auditError) {
        // Don't fail login if audit log fails
        console.error('Audit log failed:', auditError);
      }

      const response = NextResponse.json({
        success: true,
        data: {
          sessionToken: token, // Fixed: Changed from 'token' to 'sessionToken' to match frontend expectation
          user: {
            id: user.id,
            email: user.email,
            firstName: user.firstName,
            lastName: user.lastName,
            role: user.role,
            companyId: user.companyId,
            company: user.company,
          },
          expiresAt,
        },
      });

      // Set secure httpOnly cookie for session management
      response.cookies.set('session_token', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', // Changed from 'strict' to 'lax' for better compatibility
        maxAge: 24 * 60 * 60, // 24 hours
        path: '/',
      });

      return response;

    } catch (dbError) {
      console.error('Database error during login:', dbError);
      return NextResponse.json(
        { error: 'Login failed. Please try again.' },
        { status: 500 }
      );
    }

  } catch (error) {
    console.error('Login error:', error);
    
    return NextResponse.json(
      { error: 'Login failed. Please try again.' },
      { status: 500 }
    );
  }
}