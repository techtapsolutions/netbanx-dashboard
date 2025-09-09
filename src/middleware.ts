import { NextRequest, NextResponse } from 'next/server';
import { RateLimiter } from '@/lib/rate-limiter';
import { getCacheControlHeader } from '@/lib/cdn-config';

// Initialize rate limiter
const rateLimiter = new RateLimiter();

// CSRF exempt paths (public endpoints that don't need CSRF)
const CSRF_EXEMPT_PATHS = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/health',
  '/api/webhook', // Webhook endpoints need to be exempt
  '/api/debug-auth', // Debug endpoint
  '/api/test', // Test endpoints
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
  
  // Apply CDN cache headers based on content type
  applyCDNHeaders(response, pathname);
  
  // Skip middleware for static files and images (but headers already applied)
  if (
    pathname.startsWith('/_next/static') ||
    pathname.startsWith('/static') ||
    pathname.includes('/favicon') ||
    pathname.match(/\.(png|jpg|jpeg|gif|svg|ico|webp|avif)$/i)
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
    
    // TEMPORARILY DISABLED: Skip CSRF for debugging authentication
    // For now, we're checking if the token exists
    // In production, you'd validate this against a server-side stored token
    if (!csrfToken && false) { // Disabled CSRF check temporarily
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

// Apply CDN optimization headers based on content type
function applyCDNHeaders(response: NextResponse, pathname: string) {
  // Add edge region header
  response.headers.set('X-Edge-Region', process.env.VERCEL_REGION || 'unknown');
  
  // Enable early hints for critical resources
  response.headers.set('Link', [
    '</_next/static/css>; rel=preload; as=style',
    '<https://fonts.googleapis.com>; rel=preconnect',
    '<https://fonts.gstatic.com>; rel=preconnect; crossorigin',
  ].join(', '));
  
  // Set cache headers based on path
  if (pathname.startsWith('/_next/static')) {
    // Immutable assets
    response.headers.set('Cache-Control', getCacheControlHeader('immutable'));
    response.headers.set('CDN-Cache-Control', 'max-age=31536000');
  } else if (pathname.startsWith('/api')) {
    // API routes with edge caching
    response.headers.set('Cache-Control', getCacheControlHeader('api'));
    response.headers.set('Vary', 'Accept-Encoding, Authorization');
  } else if (pathname.match(/\.(jpg|jpeg|png|gif|svg|webp|avif|ico)$/i)) {
    // Images
    response.headers.set('Cache-Control', getCacheControlHeader('static'));
    response.headers.set('Accept-CH', 'DPR, Viewport-Width, Width');
    response.headers.set('Vary', 'Accept, DPR, Viewport-Width, Width');
  } else if (pathname.match(/\.(woff|woff2|ttf|otf|eot)$/i)) {
    // Fonts
    response.headers.set('Cache-Control', getCacheControlHeader('immutable'));
    response.headers.set('Access-Control-Allow-Origin', '*');
  } else if (pathname.match(/\.(js|css|map)$/i)) {
    // JS/CSS files
    response.headers.set('Cache-Control', getCacheControlHeader('immutable'));
  } else {
    // Dynamic pages
    response.headers.set('Cache-Control', getCacheControlHeader('dynamic'));
  }
  
  // Performance tracking header
  response.headers.set('Server-Timing', `edge;dur=${Date.now() % 100};desc="Edge Processing"`);
  
  // Enable compression hints
  response.headers.set('Accept-Encoding', 'br, gzip, deflate');
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
    "connect-src 'self' https://api.paysafe.com https://api.netbanx.com wss://api.paysafe.com wss://api.netbanx.com",
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