import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import bcrypt from 'bcryptjs';

export async function POST(request: NextRequest) {
  try {
    console.log('🚀 Creating admin user in live database...');
    
    // Get setup details from request
    let setupData;
    try {
      setupData = await request.json();
    } catch (e) {
      setupData = {}; // Use defaults if no JSON provided
    }
    
    const email = setupData.email || 'admin@netbanx.com';
    const password = setupData.password || 'LiveAdmin123!';
    const firstName = setupData.firstName || 'Live';
    const lastName = setupData.lastName || 'Admin';
    
    console.log('📧 Creating admin with email:', email);
    
    // Check current user count
    const userCount = await db.user.count();
    console.log('📊 Current user count:', userCount);
    
    // List existing users (if any)
    const existingUsers = await db.user.findMany({
      select: { email: true, firstName: true, lastName: true, role: true }
    });
    console.log('👥 Existing users:', existingUsers);
    
    // Check if admin already exists
    const existingAdmin = await db.user.findUnique({
      where: { email: email.toLowerCase() }
    });
    
    if (existingAdmin) {
      console.log('✅ Admin already exists, updating password...');
      
      const hashedPassword = await bcrypt.hash(password, 12);
      
      const updatedUser = await db.user.update({
        where: { email: email.toLowerCase() },
        data: {
          passwordHash: hashedPassword,
          updatedAt: new Date()
        },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true
        }
      });
      
      return NextResponse.json({
        success: true,
        message: 'Admin password updated',
        user: updatedUser,
        credentials: {
          email: email.toLowerCase(),
          password
        }
      });
      
    } else {
      console.log('🔐 Creating new admin user...');
      
      const hashedPassword = await bcrypt.hash(password, 12);
      
      const newUser = await db.user.create({
        data: {
          email: email.toLowerCase(),
          passwordHash: hashedPassword,
          firstName,
          lastName,
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
          role: true
        }
      });
      
      console.log('✅ Admin user created successfully!');
      
      return NextResponse.json({
        success: true,
        message: 'Admin user created',
        user: newUser,
        credentials: {
          email: email.toLowerCase(),
          password
        }
      });
    }
    
  } catch (error) {
    console.error('❌ Error creating admin:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    console.log('🔍 Checking live database state...');
    
    // Get database info
    const userCount = await db.user.count();
    const users = await db.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true
      }
    });
    
    return NextResponse.json({
      success: true,
      database: {
        connected: true,
        userCount,
        users
      },
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Error checking database:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}