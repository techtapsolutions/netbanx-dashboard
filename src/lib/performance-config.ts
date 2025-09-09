// Performance optimization configuration

export const performanceConfig = {
  // Lazy loading configuration
  lazyLoading: {
    // Intersection Observer options for lazy loading
    rootMargin: '50px',
    threshold: 0.01,
  },

  // Image optimization
  images: {
    // Preload critical images
    preloadCritical: true,
    // Use WebP format when supported
    preferWebP: true,
    // Lazy load images below the fold
    lazyLoadBelowFold: true,
  },

  // Bundle optimization targets
  bundleTargets: {
    // Maximum initial bundle size in KB
    maxInitialBundleSize: 120,
    // Maximum chunk size in KB
    maxChunkSize: 244,
    // Minimum chunk size in KB
    minChunkSize: 20,
  },

  // Performance budgets
  performanceBudgets: {
    // Core Web Vitals targets
    fcp: 1800, // First Contentful Paint (ms)
    lcp: 2500, // Largest Contentful Paint (ms)
    fid: 100, // First Input Delay (ms)
    cls: 0.1, // Cumulative Layout Shift
    ttfb: 800, // Time to First Byte (ms)
    tti: 3000, // Time to Interactive (ms)
  },

  // Caching strategies
  caching: {
    // API response cache duration in seconds
    apiCacheDuration: 60,
    // Static asset cache duration in seconds
    staticAssetCacheDuration: 31536000, // 1 year
    // Use stale-while-revalidate for dynamic content
    useStaleWhileRevalidate: true,
  },

  // Prefetching configuration
  prefetching: {
    // Prefetch links on hover
    prefetchOnHover: true,
    // Prefetch visible links
    prefetchVisible: true,
    // Delay before prefetching (ms)
    prefetchDelay: 100,
  },

  // Resource hints
  resourceHints: {
    // DNS prefetch for external domains
    dnsPrefetch: [
      'https://fonts.googleapis.com',
      'https://fonts.gstatic.com',
    ],
    // Preconnect to critical third-party origins
    preconnect: [
      'https://fonts.googleapis.com',
      'https://fonts.gstatic.com',
    ],
  },

  // Code splitting strategies
  codeSplitting: {
    // Vendor libraries to split into separate chunks
    vendorChunks: [
      'react',
      'react-dom',
      'recharts',
      '@headlessui/react',
      'lucide-react',
    ],
    // Routes to preload
    preloadRoutes: ['/'],
    // Maximum parallel requests
    maxParallelRequests: 6,
  },

  // Runtime optimizations
  runtime: {
    // Use React concurrent features
    useConcurrentFeatures: true,
    // Enable time slicing for large lists
    useTimeSlicing: true,
    // Batch DOM updates
    batchDOMUpdates: true,
  },
};

// Helper function to check if a metric meets the performance budget
export function checkPerformanceBudget(metric: string, value: number): boolean {
  const budget = (performanceConfig.performanceBudgets as any)[metric];
  return budget ? value <= budget : true;
}

// Helper function to get optimization recommendations
export function getOptimizationRecommendations(metrics: Record<string, number>): string[] {
  const recommendations: string[] = [];

  if (metrics.fcp > performanceConfig.performanceBudgets.fcp) {
    recommendations.push('Reduce server response time and optimize critical rendering path');
  }

  if (metrics.lcp > performanceConfig.performanceBudgets.lcp) {
    recommendations.push('Optimize largest content element loading (images, fonts, or large text blocks)');
  }

  if (metrics.fid > performanceConfig.performanceBudgets.fid) {
    recommendations.push('Reduce JavaScript execution time and break up long tasks');
  }

  if (metrics.cls > performanceConfig.performanceBudgets.cls) {
    recommendations.push('Add size attributes to images and videos, avoid inserting content above existing content');
  }

  if (metrics.ttfb > performanceConfig.performanceBudgets.ttfb) {
    recommendations.push('Optimize server response time, use CDN, enable caching');
  }

  return recommendations;
}