import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Mimic what the frontend AuthContext does
    console.log('🔍 Debug frontend auth check...');
    console.log('Cookies:', request.cookies.toString());
    console.log('Headers:', Object.fromEntries(request.headers.entries()));
    
    // Check if session token cookie exists
    const sessionCookie = request.cookies.get('session_token');
    console.log('Session Cookie:', sessionCookie ? 'Present' : 'Missing');
    
    // Check CSRF token
    const csrfToken = request.headers.get('X-CSRF-Token');
    console.log('CSRF Token:', csrfToken ? 'Present' : 'Missing');
    
    return NextResponse.json({
      success: true,
      debug: {
        sessionCookie: sessionCookie ? {
          name: sessionCookie.name,
          valueLength: sessionCookie.value.length,
          hasValue: !!sessionCookie.value
        } : null,
        csrfToken: csrfToken ? 'present' : 'missing',
        allCookies: request.cookies.getAll().map(c => ({ name: c.name, hasValue: !!c.value })),
        headers: {
          contentType: request.headers.get('content-type'),
          userAgent: request.headers.get('user-agent'),
          origin: request.headers.get('origin'),
          referer: request.headers.get('referer')
        }
      }
    });
    
  } catch (error) {
    console.error('❌ Debug frontend error:', error);
    
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}