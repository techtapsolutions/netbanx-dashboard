import { NextRequest, NextResponse } from 'next/server';
import { Client } from 'pg';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Use direct database connection to avoid Prisma issues
    const client = new Client({
      connectionString: process.env.DATABASE_URL
    });

    await client.connect();

    // Find user
    const userResult = await client.query(
      'SELECT id, email, "passwordHash", "firstName", "lastName", role, "isActive", "emailVerified" FROM "User" WHERE email = $1',
      [email.toLowerCase()]
    );

    await client.end();

    if (userResult.rows.length === 0) {
      return NextResponse.json(
        { error: 'Invalid credentials', debug: 'User not found' },
        { status: 401 }
      );
    }

    const user = userResult.rows[0];

    if (!user.isActive) {
      return NextResponse.json(
        { error: 'Invalid credentials', debug: 'User not active' },
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid credentials', debug: 'Password mismatch' },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Login successful!',
      user: {
        id: user.id,
        email: user.email,
        name: `${user.firstName} ${user.lastName}`,
        role: user.role,
        isActive: user.isActive,
        emailVerified: user.emailVerified
      }
    });

  } catch (error) {
    console.error('Test login error:', error);
    
    return NextResponse.json(
      { 
        error: 'Login test failed', 
        debug: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}