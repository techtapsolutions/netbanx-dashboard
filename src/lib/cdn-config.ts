/**
 * CDN Configuration and Optimization Settings
 * Provides centralized CDN configuration for the Netbanx Dashboard
 */

export const CDN_CONFIG = {
  // Vercel Edge Network configuration
  edge: {
    // Enable Vercel's global edge network
    enabled: true,
    // Regions for edge caching (Vercel automatically handles this)
    regions: ['global'],
  },

  // Cache control settings for different asset types
  cacheControl: {
    // Immutable assets (hashed filenames)
    immutable: {
      maxAge: 31536000, // 1 year
      sMaxAge: 31536000,
      staleWhileRevalidate: 86400,
      immutable: true,
    },
    // Static assets (images, fonts)
    static: {
      maxAge: 86400, // 1 day
      sMaxAge: 604800, // 1 week
      staleWhileRevalidate: 86400,
    },
    // Dynamic content
    dynamic: {
      maxAge: 0,
      sMaxAge: 60, // 1 minute edge cache
      staleWhileRevalidate: 60,
    },
    // API responses
    api: {
      maxAge: 0,
      sMaxAge: 30, // 30 seconds edge cache
      staleWhileRevalidate: 30,
    },
  },

  // Image optimization settings
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920, 2048, 3840],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    quality: 85,
    minimumCacheTTL: 31536000, // 1 year
  },

  // Font optimization
  fonts: {
    // Preconnect to font providers
    preconnect: [
      'https://fonts.googleapis.com',
      'https://fonts.gstatic.com',
    ],
    // Font display strategy
    display: 'swap', // Prevents FOIT (Flash of Invisible Text)
    // Subset fonts for performance
    subset: ['latin', 'latin-ext'],
  },

  // Resource hints
  resourceHints: {
    // DNS prefetch for external domains
    dnsPrefetch: [
      'https://fonts.googleapis.com',
      'https://fonts.gstatic.com',
      'https://vercel.live',
    ],
    // Preconnect for critical origins
    preconnect: [
      { href: 'https://fonts.googleapis.com', crossOrigin: 'anonymous' },
      { href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
    ],
  },

  // Compression settings
  compression: {
    // Enable Brotli compression
    brotli: true,
    // Gzip as fallback
    gzip: true,
    // Minimum size for compression (bytes)
    threshold: 1024,
  },

  // Performance monitoring
  monitoring: {
    // Web Vitals thresholds
    webVitals: {
      LCP: { good: 2500, needsImprovement: 4000 }, // Largest Contentful Paint
      FID: { good: 100, needsImprovement: 300 },    // First Input Delay
      CLS: { good: 0.1, needsImprovement: 0.25 },   // Cumulative Layout Shift
      FCP: { good: 1800, needsImprovement: 3000 },  // First Contentful Paint
      TTFB: { good: 800, needsImprovement: 1800 },  // Time to First Byte
    },
    // Cache hit rate targets
    cacheTargets: {
      static: 0.95,   // 95% cache hit rate for static assets
      images: 0.90,   // 90% for images
      api: 0.70,      // 70% for API responses
    },
  },
};

/**
 * Generate cache control header based on asset type
 */
export function getCacheControlHeader(assetType: keyof typeof CDN_CONFIG.cacheControl): string {
  const config = CDN_CONFIG.cacheControl[assetType];
  const parts = [
    'public',
    `max-age=${config.maxAge}`,
    `s-maxage=${config.sMaxAge}`,
    `stale-while-revalidate=${config.staleWhileRevalidate}`,
  ];
  
  if ('immutable' in config && config.immutable) {
    parts.push('immutable');
  }
  
  return parts.join(', ');
}

/**
 * Get optimized image loader configuration
 */
export function getImageLoaderConfig() {
  return {
    loader: 'default',
    path: '/_next/image',
    domains: [],
    formats: CDN_CONFIG.images.formats,
    deviceSizes: CDN_CONFIG.images.deviceSizes,
    imageSizes: CDN_CONFIG.images.imageSizes,
    minimumCacheTTL: CDN_CONFIG.images.minimumCacheTTL,
  };
}

/**
 * Generate resource hints for HTML head
 */
export function getResourceHints() {
  const hints = [];
  
  // DNS prefetch
  for (const href of CDN_CONFIG.resourceHints.dnsPrefetch) {
    hints.push({ rel: 'dns-prefetch', href });
  }
  
  // Preconnect
  for (const { href, crossOrigin } of CDN_CONFIG.resourceHints.preconnect) {
    hints.push({ rel: 'preconnect', href, crossOrigin });
  }
  
  return hints;
}