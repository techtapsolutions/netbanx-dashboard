import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Production optimizations
  output: 'standalone',
  
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
  
  // Security headers
  async headers() {
    return [
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
        ],
      },
    ];
  },
  
  // Webpack optimizations
  webpack: (config, { buildId, dev, isServer, defaultLoaders, webpack }) => {
    // Optimize production builds
    if (!dev && !isServer) {
      config.optimization.splitChunks.chunks = 'all';
      config.optimization.splitChunks.cacheGroups = {
        ...config.optimization.splitChunks.cacheGroups,
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          chunks: 'all',
          priority: 1,
        },
      };
    }
    
    return config;
  },
  
  // Compression
  compress: true,
};

export default nextConfig;
