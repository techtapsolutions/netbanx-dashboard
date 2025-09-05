import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

export async function POST(request: NextRequest) {
  try {
    // Security check - only allow this in production with proper auth
    const authHeader = request.headers.get('authorization');
    const expectedToken = process.env.SETUP_TOKEN || 'setup-admin-token-2024';
    
    if (!authHeader || authHeader !== `Bearer ${expectedToken}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get admin details from environment or request body
    const body = await request.json().catch(() => ({}));
    
    const email = body.email || process.env.ADMIN_EMAIL;
    const password = body.password || process.env.ADMIN_PASSWORD;
    const firstName = body.firstName || process.env.ADMIN_FIRST_NAME || 'Super';
    const lastName = body.lastName || process.env.ADMIN_LAST_NAME || 'Admin';

    if (!email || !password) {
      return NextResponse.json({ 
        error: 'Missing email or password in environment variables or request body' 
      }, { status: 400 });
    }

    // Check if super admin already exists
    const existingSuperAdmin = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
    });

    if (existingSuperAdmin) {
      return NextResponse.json({ 
        error: 'Super admin already exists',
        existingAdmin: {
          email: existingSuperAdmin.email,
          name: `${existingSuperAdmin.firstName} ${existingSuperAdmin.lastName}`,
          createdAt: existingSuperAdmin.createdAt
        }
      }, { status: 409 });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: 'Invalid email format' }, { status: 400 });
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json({ 
        error: 'Password must be at least 8 characters long' 
      }, { status: 400 });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create the super admin user
    const superAdmin = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash: hashedPassword,
        firstName: firstName,
        lastName: lastName,
        role: 'SUPER_ADMIN',
        isActive: true,
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      }
    });

    return NextResponse.json({
      success: true,
      message: 'Super admin created successfully!',
      admin: {
        email: superAdmin.email,
        name: `${superAdmin.firstName} ${superAdmin.lastName}`,
        role: superAdmin.role,
        createdAt: superAdmin.createdAt
      }
    });

  } catch (error) {
    console.error('Error creating super admin:', error);
    return NextResponse.json({ 
      error: 'Failed to create super admin',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}

// Disable this endpoint in development for security
export async function GET() {
  return NextResponse.json({ 
    error: 'This endpoint is only available via POST request' 
  }, { status: 405 });
}