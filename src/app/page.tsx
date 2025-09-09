'use client';

import dynamic from 'next/dynamic';
import { Suspense, useEffect } from 'react';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { DashboardSkeleton } from '@/components/skeletons/DashboardSkeleton';
import { getPerformanceMonitor } from '@/lib/performance-monitor';

// Dynamically import the optimized dashboard with no SSR for better performance
const OptimizedWebhookDashboard = dynamic(
  () => import('@/components/OptimizedWebhookDashboard').then(mod => mod.OptimizedWebhookDashboard),
  { 
    ssr: false,
    loading: () => <DashboardSkeleton />
  }
);

export default function Home() {
  useEffect(() => {
    // Initialize performance monitoring
    if (typeof window !== 'undefined') {
      const monitor = getPerformanceMonitor();
      
      // Report metrics after page load
      window.addEventListener('load', () => {
        setTimeout(() => {
          monitor.measureBundleSize();
          monitor.reportToAnalytics();
        }, 2000);
      });
    }
  }, []);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <Suspense fallback={<DashboardSkeleton />}>
          <OptimizedWebhookDashboard />
        </Suspense>
      </div>
    </ProtectedRoute>
  );
}
