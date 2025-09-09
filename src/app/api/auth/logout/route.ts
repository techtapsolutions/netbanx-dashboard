import { NextRequest, NextResponse } from 'next/server';
import { AuthService } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    // Get token from cookie or header
    const cookieToken = request.cookies.get('session_token')?.value;
    const authHeader = request.headers.get('authorization');
    const bearerToken = authHeader?.startsWith('Bearer ') 
      ? authHeader.replace('Bearer ', '') 
      : null;
    
    const token = cookieToken || bearerToken;

    // If we have a token, invalidate it in the database
    if (token) {
      try {
        await AuthService.logout(token);
      } catch (error) {
        // Log but don't fail the logout
        console.error('Failed to invalidate session in database:', error);
      }
    }

    // Create response
    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });

    // Clear all auth-related cookies
    response.cookies.delete('session_token');
    response.cookies.set('session_token', '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 0, // Immediately expire
      path: '/',
    });

    // Clear any CSRF token cookie if it exists
    response.cookies.delete('csrf_token');

    return response;

  } catch (error) {
    console.error('Logout error:', error);
    
    // Even if there's an error, clear the cookies
    const response = NextResponse.json(
      { error: 'Logout failed', success: false },
      { status: 500 }
    );
    
    response.cookies.delete('session_token');
    response.cookies.delete('csrf_token');
    
    return response;
  }
}