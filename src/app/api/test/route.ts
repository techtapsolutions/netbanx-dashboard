import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import bcrypt from 'bcryptjs';

export async function GET() {
  try {
    console.log('🔍 Testing database connection...');
    
    // Test database connection
    const userCount = await db.user.count();
    console.log('✅ Database connected. User count:', userCount);
    
    // Test bcrypt
    const testHash = await bcrypt.hash('test', 10);
    const testVerify = await bcrypt.compare('test', testHash);
    console.log('✅ bcrypt working. Hash test:', testVerify);
    
    return NextResponse.json({
      success: true,
      database: { connected: true, userCount },
      bcrypt: { working: testVerify },
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
        email: email?.toLowerCase()
      }, { status: 404 });
    }
    
    console.log('✅ User found:', { id: user.id, email: user.email, isActive: user.isActive });
    
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
        isActive: user.isActive
      },
      passwordValid: isValid
    });
    
  } catch (error) {
    console.error('❌ Login test failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
  }
}