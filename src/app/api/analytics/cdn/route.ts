import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

// CDN Analytics endpoint
export async function POST(request: Request) {
  try {
    const data = await request.json();
    const headersList = headers();
    
    // Get client information
    const clientIp = headersList.get('x-forwarded-for') || 'unknown';
    const edgeRegion = headersList.get('x-vercel-edge-region') || 'unknown';
    const cacheStatus = headersList.get('x-vercel-cache') || 'unknown';
    
    // In production, you would store this in a time-series database
    // For now, we'll just log it
    if (process.env.NODE_ENV === 'production') {
      console.log('CDN Analytics:', {
        ...data,
        clientIp,
        edgeRegion,
        cacheStatus,
        receivedAt: new Date().toISOString(),
      });
      
      // You could send to services like:
      // - Vercel Analytics
      // - Google Analytics
      // - Custom monitoring solution
      // - Time-series database (InfluxDB, TimescaleDB)
    }
    
    // Check for performance issues and alert if needed
    const { metrics, vitals } = data;
    
    // Alert if cache hit rate is below target
    if (metrics.cacheHitRate < 0.9) {
      console.warn(`⚠️ Low cache hit rate: ${(metrics.cacheHitRate * 100).toFixed(2)}%`);
    }
    
    // Alert if Web Vitals are poor
    if (vitals.LCP > 4000) {
      console.warn(`⚠️ Poor LCP: ${vitals.LCP}ms`);
    }
    
    if (vitals.FID > 300) {
      console.warn(`⚠️ Poor FID: ${vitals.FID}ms`);
    }
    
    if (vitals.CLS > 0.25) {
      console.warn(`⚠️ Poor CLS: ${vitals.CLS}`);
    }
    
    return NextResponse.json(
      { success: true, message: 'Analytics received' },
      {
        headers: {
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (error) {
    console.error('CDN Analytics Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process analytics' },
      { status: 500 }
    );
  }
}

// GET endpoint to retrieve current CDN status
export async function GET() {
  const headersList = headers();
  
  // Get Vercel edge information
  const edgeRegion = headersList.get('x-vercel-edge-region') || 'unknown';
  const cacheStatus = headersList.get('x-vercel-cache') || 'unknown';
  const deploymentId = headersList.get('x-vercel-deployment-url') || 'unknown';
  
  return NextResponse.json({
    status: 'healthy',
    edge: {
      region: edgeRegion,
      cacheStatus: cacheStatus,
      deploymentId: deploymentId,
    },
    cacheHeaders: {
      static: 'public, max-age=31536000, immutable',
      images: 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
      api: 'public, max-age=0, s-maxage=30, stale-while-revalidate=30',
    },
    timestamp: new Date().toISOString(),
  }, {
    headers: {
      'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=60',
    },
  });
}