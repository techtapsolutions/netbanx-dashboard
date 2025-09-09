import { NextResponse } from 'next/server';
import { optimizedWebhookSecretStore } from '@/lib/webhook-secret-store-optimized';

export async function GET() {
  try {
    const cacheStats = optimizedWebhookSecretStore.getCacheStats();
    
    return NextResponse.json({
      success: true,
      cache: {
        ...cacheStats,
        performance: {
          estimatedQueryReduction: cacheStats.totalSecrets > 0 
            ? `${cacheStats.totalSecrets} individual DB queries avoided per batch`
            : 'No secrets cached',
          optimizationStatus: cacheStats.isHealthy 
            ? 'OPTIMAL - Cache is healthy and eliminating N+1 queries'
            : 'WARNING - Cache may be stale or empty',
        }
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error getting webhook secrets cache status:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to get cache status',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    await optimizedWebhookSecretStore.invalidateCache();
    
    return NextResponse.json({
      success: true,
      message: 'Webhook secrets cache invalidated and refreshed',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error invalidating webhook secrets cache:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: 'Failed to invalidate cache',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}