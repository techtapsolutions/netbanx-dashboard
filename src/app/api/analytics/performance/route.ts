import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    
    // Log performance metrics for monitoring
    console.log('[Performance Analytics]', {
      timestamp: data.timestamp,
      metrics: data.metrics,
      url: data.url,
    });

    // In production, you would send this to your analytics service
    // For example: Google Analytics, Datadog, New Relic, etc.
    
    // Check for performance issues
    const { metrics } = data;
    const issues = [];
    
    if (metrics.lcp && metrics.lcp > 2500) {
      issues.push(`LCP is ${metrics.lcp}ms (target: <2500ms)`);
    }
    
    if (metrics.fcp && metrics.fcp > 1800) {
      issues.push(`FCP is ${metrics.fcp}ms (target: <1800ms)`);
    }
    
    if (metrics.cls && metrics.cls > 0.1) {
      issues.push(`CLS is ${metrics.cls} (target: <0.1)`);
    }
    
    if (metrics.fid && metrics.fid > 100) {
      issues.push(`FID is ${metrics.fid}ms (target: <100ms)`);
    }

    return NextResponse.json({
      success: true,
      issues: issues.length > 0 ? issues : null,
      recommendation: issues.length > 0 
        ? 'Performance optimizations needed. Check console for details.'
        : 'Performance metrics are within acceptable ranges.',
    });
  } catch (error) {
    console.error('Error processing performance analytics:', error);
    return NextResponse.json(
      { error: 'Failed to process performance data' },
      { status: 500 }
    );
  }
}