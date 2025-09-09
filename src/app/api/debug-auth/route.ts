import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import bcrypt from 'bcryptjs';

export async function GET() {
  try {
    console.log('🔍 Testing database connection...');
    
    // Test database connection
    const userCount = await db.user.count();
    console.log('✅ Database connected. User count:', userCount);
    
    // List all users
    const users = await db.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true,
        role: true
      }
    });
    console.log('👥 Users in database:', users);
    
    return NextResponse.json({
      success: true,
      database: { connected: true, userCount },
      users: users,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString()
    }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();
    
    console.log('🔐 Testing login for email:', email);
    
    // Find user
    const user = await db.user.findUnique({
      where: { email: email?.toLowerCase() }
    });
    
    if (!user) {
      console.log('❌ User not found');
      return NextResponse.json({
        success: false,
        error: 'User not found',
        email: email?.toLowerCase(),
        availableUsers: await db.user.findMany({ 
          select: { email: true } 
        })
      }, { status: 404 });
    }
    
    console.log('✅ User found:', { 
      id: user.id, 
      email: user.email, 
      isActive: user.isActive,
      hasPassword: !!user.passwordHash 
    });
    
    // Test password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    console.log('🔑 Password valid:', isValid);
    
    return NextResponse.json({
      success: isValid,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isActive: user.isActive,
        role: user.role
      },
      passwordValid: isValid,
      debug: {
        passwordProvided: !!password,
        hashInDb: !!user.passwordHash,
        hashLength: user.passwordHash?.length
      }
    });
    
  } catch (error) {
    console.error('❌ Login test failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack?.substring(0, 500) + '...' : undefined
    }, { status: 500 });
  }
}