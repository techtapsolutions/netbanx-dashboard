import { NextRequest, NextResponse } from 'next/server';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();

/**
 * @swagger
 * /api/setup/admin:
 *   post:
 *     summary: Initialize super admin user (one-time setup)
 *     description: Creates the first super admin user. Only works if no super admin exists.
 *     tags:
 *       - Setup
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - firstName
 *               - lastName
 *               - setupKey
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Admin email address
 *               password:
 *                 type: string
 *                 minLength: 8
 *                 description: Admin password (min 8 characters)
 *               firstName:
 *                 type: string
 *                 description: Admin first name
 *               lastName:
 *                 type: string
 *                 description: Admin last name
 *               setupKey:
 *                 type: string
 *                 description: Setup key from environment (SETUP_KEY)
 *     responses:
 *       201:
 *         description: Super admin created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 admin:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     email:
 *                       type: string
 *                     firstName:
 *                       type: string
 *                     lastName:
 *                       type: string
 *                     role:
 *                       type: string
 *       400:
 *         description: Invalid request data
 *       403:
 *         description: Setup not allowed or already completed
 *       500:
 *         description: Internal server error
 */
export async function POST(request: NextRequest) {
  try {
    // Check if super admin already exists
    const existingSuperAdmin = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
    });

    if (existingSuperAdmin) {
      return NextResponse.json(
        {
          success: false,
          error: 'Super admin already exists. Setup has already been completed.',
        },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { email, password, firstName, lastName, setupKey } = body;

    // Validate setup key
    const expectedSetupKey = process.env.SETUP_KEY;
    if (!expectedSetupKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Setup is disabled. SETUP_KEY environment variable not configured.',
        },
        { status: 403 }
      );
    }

    if (setupKey !== expectedSetupKey) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid setup key.',
        },
        { status: 403 }
      );
    }

    // Validate required fields
    if (!email || !password || !firstName || !lastName) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: email, password, firstName, lastName',
        },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid email format',
        },
        { status: 400 }
      );
    }

    // Validate password strength
    if (password.length < 8) {
      return NextResponse.json(
        {
          success: false,
          error: 'Password must be at least 8 characters long',
        },
        { status: 400 }
      );
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Create the super admin user
    const superAdmin = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash: hashedPassword,
        firstName,
        lastName,
        role: 'SUPER_ADMIN',
        isActive: true,
        emailVerified: true, // Auto-verify for super admin
        emailVerifiedAt: new Date(),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        createdAt: true,
      },
    });

    // Log the setup action
    await prisma.auditLog.create({
      data: {
        action: 'SUPER_ADMIN_SETUP',
        resource: 'USER',
        userId: superAdmin.id,
        details: {
          email: superAdmin.email,
          setupTimestamp: new Date(),
        },
      },
    });

    return NextResponse.json(
      {
        success: true,
        message: 'Super admin created successfully',
        admin: superAdmin,
      },
      { status: 201 }
    );

  } catch (error) {
    console.error('Admin setup error:', error);

    // Handle duplicate email error
    if (error instanceof Error && error.message.includes('Unique constraint')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Email address already exists',
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

/**
 * @swagger
 * /api/setup/admin:
 *   get:
 *     summary: Check if admin setup is required
 *     description: Returns whether super admin setup is needed
 *     tags:
 *       - Setup
 *     responses:
 *       200:
 *         description: Setup status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 setupRequired:
 *                   type: boolean
 *                   description: Whether admin setup is needed
 *                 setupEnabled:
 *                   type: boolean  
 *                   description: Whether setup endpoint is enabled
 *                 message:
 *                   type: string
 */
export async function GET(request: NextRequest) {
  try {
    // Check if super admin exists
    const existingSuperAdmin = await prisma.user.findFirst({
      where: { role: 'SUPER_ADMIN' },
      select: { id: true },
    });

    const setupEnabled = !!process.env.SETUP_KEY;
    const setupRequired = !existingSuperAdmin;

    return NextResponse.json({
      setupRequired,
      setupEnabled,
      message: setupRequired
        ? setupEnabled
          ? 'Admin setup is required and enabled'
          : 'Admin setup is required but disabled (SETUP_KEY not configured)'
        : 'Admin setup already completed',
    });

  } catch (error) {
    console.error('Setup status check error:', error);
    return NextResponse.json(
      {
        error: 'Failed to check setup status',
      },
      { status: 500 }
    );
  }
}