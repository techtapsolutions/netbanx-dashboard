'use client';

import { useEffect } from 'react';
import { cdnMonitor } from '@/lib/cdn-monitoring';

export function CDNMonitor() {
  useEffect(() => {
    // Initialize CDN monitoring
    cdnMonitor.initialize();

    // Log initial performance metrics after page load
    if (typeof window !== 'undefined') {
      window.addEventListener('load', () => {
        setTimeout(() => {
          const metrics = cdnMonitor.getMetrics();
          const vitals = cdnMonitor.getWebVitals();
          
          // Log performance in development
          if (process.env.NODE_ENV === 'development') {
            console.group('🚀 Initial Page Load Performance');
            console.log('Cache Hit Rate:', `${(metrics.cacheHitRate * 100).toFixed(2)}%`);
            console.log('Avg Load Time:', `${metrics.avgLoadTime.toFixed(2)}ms`);
            console.log('Web Vitals:', vitals);
            console.groupEnd();
          }
        }, 2000); // Wait 2 seconds after load to gather metrics
      });
    }

    // Cleanup
    return () => {
      cdnMonitor.clearMetrics();
    };
  }, []);

  // This component doesn't render anything
  return null;
}