import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import bcrypt from 'bcryptjs';

export async function GET(request: NextRequest) {
  try {
    // Test with known credentials
    const email = 'test@netbanx.com';
    const password = 'TestPass123!';
    
    console.log('🔍 Testing login for:', email);
    
    // Find user using Prisma
    const user = await db.user.findUnique({
      where: { 
        email: email.toLowerCase() 
      }
    });

    if (!user) {
      return NextResponse.json({
        success: false,
        error: 'User not found',
        email: email.toLowerCase(),
      });
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
      success: true,
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