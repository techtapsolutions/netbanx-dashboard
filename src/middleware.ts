import { NextRequest, NextResponse } from 'next/server';
import { RateLimiter } from '@/lib/rate-limiter';

// Initialize rate limiter
const rateLimiter = new RateLimiter();

// CSRF exempt paths (public endpoints that don't need CSRF)
const CSRF_EXEMPT_PATHS = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/health',
  '/api/webhook', // Webhook endpoints need to be exempt
];

// Rate limit configurations per endpoint
const RATE_LIMITS = {
  '/api/auth/login': { requests: 20, windowMs: 60 * 1000 }, // 20 requests per minute for testing
  '/api/auth/refresh': { requests: 10, windowMs: 60 * 1000 }, // 10 requests per minute
  '/api/auth/password-reset': { requests: 3, windowMs: 60 * 60 * 1000 }, // 3 requests per hour
  'default': { requests: 100, windowMs: 60 * 1000 }, // 100 requests per minute default
};

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  
  // Create response with security headers
  const response = NextResponse.next();
  
  // Apply security headers to all responses
  applySecurityHeaders(response);
  
  // Skip middleware for static files and images
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/static') ||
    pathname.includes('/favicon') ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp)$/i)
  ) {
    return response;
  }

  // Apply rate limiting for API routes
  if (pathname.startsWith('/api')) {
    const rateLimitResult = await checkRateLimit(request, pathname);
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { 
          error: 'Too many requests. Please try again later.',
          retryAfter: rateLimitResult.retryAfter 
        },
        { 
          status: 429,
          headers: {
            'Retry-After': String(rateLimitResult.retryAfter),
            'X-RateLimit-Limit': String(rateLimitResult.limit),
            'X-RateLimit-Remaining': String(rateLimitResult.remaining),
            'X-RateLimit-Reset': new Date(rateLimitResult.resetTime).toISOString(),
          }
        }
      );
    }
  }

  // CSRF Protection for state-changing operations
  if (
    pathname.startsWith('/api') && 
    !CSRF_EXEMPT_PATHS.includes(pathname) &&
    ['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method)
  ) {
    const csrfToken = request.headers.get('X-CSRF-Token');
    
    // For now, we're checking if the token exists
    // In production, you'd validate this against a server-side stored token
    if (!csrfToken && process.env.NODE_ENV === 'production') {
      return NextResponse.json(
        { error: 'CSRF token required' },
        { status: 403 }
      );
    }
  }

  // Protected routes authentication check
  // IMPORTANT: Only check for token existence, don't verify here to avoid circular calls
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/admin')) {
    const token = request.cookies.get('session_token')?.value;
    
    if (!token) {
      // Check if there's a token in Authorization header (for API calls)
      const authHeader = request.headers.get('authorization');
      const hasBearer = authHeader?.startsWith('Bearer ');
      
      if (!hasBearer) {
        // No authentication found, redirect to login
        return NextResponse.redirect(new URL('/', request.url));
      }
    }
    
    // Token exists, let the route handle verification
    // This avoids circular dependencies and race conditions
  }

  return response;
}

// Apply security headers to response
function applySecurityHeaders(response: NextResponse) {
  // Content Security Policy
  const cspDirectives = [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net https://unpkg.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://api.paysafe.com https://api.netbanx.com wss://",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join('; ');

  response.headers.set('Content-Security-Policy', cspDirectives);
  
  // Other security headers
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  // Strict Transport Security (only in production)
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }
}

// Check rate limiting
async function checkRateLimit(
  request: NextRequest,
  pathname: string
): Promise<{
  allowed: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
}> {
  // Get client identifier (IP address or user ID)
  const clientId = request.ip || 
    request.headers.get('x-forwarded-for')?.split(',')[0] || 
    'unknown';
  
  // Get rate limit config for this endpoint
  const config = RATE_LIMITS[pathname] || RATE_LIMITS.default;
  
  // Check rate limit
  return rateLimiter.checkLimit(clientId, pathname, config);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};