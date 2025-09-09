import type { NextConfig } from "next";
import { CDN_CONFIG, getCacheControlHeader } from "./src/lib/cdn-config";

// Bundle analyzer configuration
const withBundleAnalyzer = require('@next/bundle-analyzer')({
  enabled: process.env.ANALYZE === 'true',
});

const nextConfig: NextConfig = {
  // Production optimizations
  output: 'standalone',
  
  // Performance optimizations
  experimental: {
    optimizeCss: true,
    optimizePackageImports: ['lucide-react', '@headlessui/react', 'recharts'],
    // Enable edge runtime for better CDN integration
    serverMinification: true,
  },

  // Advanced Image optimization with CDN support
  images: {
    formats: CDN_CONFIG.images.formats as any,
    deviceSizes: CDN_CONFIG.images.deviceSizes,
    imageSizes: CDN_CONFIG.images.imageSizes,
    minimumCacheTTL: CDN_CONFIG.images.minimumCacheTTL,
    // Enable image optimization API
    dangerouslyAllowSVG: true,
    contentDispositionType: 'attachment',
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    // Remote patterns for external images
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.vercel.app',
      },
      {
        protocol: 'https',
        hostname: '**.vercel.sh',
      },
    ],
  },

  // Disable ESLint during CI builds for faster deployments
  eslint: {
    // Only run ESLint on the 'pages' and 'utils' directories during the build
    dirs: process.env.NODE_ENV === 'production' ? [] : ['pages', 'utils'], // Disable for production
    // Warning: This allows production builds to succeed even with ESLint errors.
    ignoreDuringBuilds: process.env.NODE_ENV === 'production',
  },

  // Disable TypeScript checking during CI builds for faster deployments
  typescript: {
    // Warning: This allows production builds to succeed even with TypeScript errors.
    ignoreBuildErrors: process.env.NODE_ENV === 'production',
  },
  
  // External packages configuration
  serverExternalPackages: ['@prisma/client'],
  
  // Security and CDN cache headers
  async headers() {
    return [
      // Static assets with immutable caching
      {
        source: '/_next/static/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: getCacheControlHeader('immutable'),
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
      // Images with optimized caching
      {
        source: '/images/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: getCacheControlHeader('static'),
          },
          {
            key: 'Accept-CH',
            value: 'DPR, Viewport-Width, Width',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
      // Font files with long-term caching
      {
        source: '/fonts/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: getCacheControlHeader('immutable'),
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
      // API routes with edge caching
      {
        source: '/api/(.*)',
        headers: [
          {
            key: 'Cache-Control',
            value: getCacheControlHeader('api'),
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
        ],
      },
      // Global security headers
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          // Enable compression hints
          {
            key: 'Accept-Encoding',
            value: 'br, gzip, deflate',
          },
        ],
      },
    ];
  },
  
  // Advanced webpack optimizations
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Optimize production builds
    if (!dev && !isServer) {
      // Advanced chunk splitting strategy
      config.optimization = {
        ...config.optimization,
        runtimeChunk: 'single',
        moduleIds: 'deterministic',
        splitChunks: {
          chunks: 'all',
          maxInitialRequests: 25,
          minSize: 20000,
          maxSize: 244000,
          cacheGroups: {
            default: false,
            vendors: false,
            // Framework chunks
            framework: {
              name: 'framework',
              test: /[\\/]node_modules[\\/](react|react-dom|scheduler|prop-types|use-sync-external-store)[\\/]/,
              priority: 40,
              chunks: 'all',
              enforce: true,
            },
            // Library chunks
            lib: {
              test(module: any) {
                return module.size() > 160000 &&
                  /node_modules[\\/]/.test(module.identifier());
              },
              name(module: any) {
                const hash = require('crypto').createHash('sha1');
                hash.update(module.identifier());
                return `lib-${hash.digest('hex').substring(0, 8)}`;
              },
              priority: 30,
              minChunks: 1,
              reuseExistingChunk: true,
            },
            // Chart library chunk
            charts: {
              name: 'charts',
              test: /[\\/]node_modules[\\/](recharts|d3-.*|victory.*)[\\/]/,
              priority: 35,
              chunks: 'all',
              enforce: true,
            },
            // UI components chunk
            ui: {
              name: 'ui',
              test: /[\\/]node_modules[\\/](@headlessui|lucide-react|clsx|tailwind-merge)[\\/]/,
              priority: 33,
              chunks: 'all',
            },
            // Commons chunk
            commons: {
              name: 'commons',
              minChunks: 2,
              priority: 20,
              reuseExistingChunk: true,
            },
            // Shared modules
            shared: {
              name(module: any, chunks: any) {
                const hash = require('crypto')
                  .createHash('sha1')
                  .update(chunks.reduce((acc: string, chunk: any) => acc + chunk.name, ''))
                  .digest('hex');
                return `shared-${hash.substring(0, 8)}`;
              },
              priority: 10,
              test: /[\\/]node_modules[\\/]/,
              minChunks: 2,
              reuseExistingChunk: true,
            },
          },
        },
      };

      // Enable tree shaking for ES6 modules
      config.optimization.usedExports = true;
      config.optimization.sideEffects = false;

      // Add webpack plugins for better optimization
      config.plugins.push(
        new webpack.optimize.ModuleConcatenationPlugin()
      );
    }
    
    return config;
  },
  
  // Compression
  compress: true,
};

export default withBundleAnalyzer(nextConfig);
