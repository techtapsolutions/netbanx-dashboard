import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const ipAddress = request.ip || request.headers.get('x-forwarded-for') || 'unknown';
    const userAgent = request.headers.get('user-agent') || 'unknown';

    const sessionInfo = await AuthService.login(
      { email, password },
      ipAddress,
      userAgent
    );

    return NextResponse.json({
      success: true,
      data: sessionInfo,
    });

  } catch (error) {
    console.error('Login error:', error);
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Login failed' },
      { status: 401 }
    );
  }
}