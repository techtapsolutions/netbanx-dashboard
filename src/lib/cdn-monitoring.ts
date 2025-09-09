/**
 * CDN Performance Monitoring and Analytics
 * Tracks cache hit rates, asset load times, and CDN performance metrics
 */

import { CDN_CONFIG } from './cdn-config';

// Performance metrics interface
interface PerformanceMetrics {
  cacheHitRate: number;
  avgLoadTime: number;
  totalRequests: number;
  cachedRequests: number;
  failedRequests: number;
  bandwidth: number;
  edgeLocations: string[];
}

// Asset performance interface
interface AssetPerformance {
  url: string;
  loadTime: number;
  size: number;
  cached: boolean;
  contentType: string;
  timestamp: number;
}

// Web Vitals interface
interface WebVitals {
  LCP?: number; // Largest Contentful Paint
  FID?: number; // First Input Delay
  CLS?: number; // Cumulative Layout Shift
  FCP?: number; // First Contentful Paint
  TTFB?: number; // Time to First Byte
}

class CDNMonitor {
  private metrics: AssetPerformance[] = [];
  private webVitals: WebVitals = {};

  /**
   * Initialize CDN monitoring
   */
  initialize() {
    if (typeof window === 'undefined') return;

    // Monitor resource timing
    this.observeResourceTiming();
    
    // Monitor Web Vitals
    this.observeWebVitals();
    
    // Set up periodic reporting
    this.setupReporting();
  }

  /**
   * Observe resource timing for CDN performance
   */
  private observeResourceTiming() {
    if (!('PerformanceObserver' in window)) return;

    try {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'resource') {
            const resourceEntry = entry as PerformanceResourceTiming;
            this.trackAssetPerformance({
              url: resourceEntry.name,
              loadTime: resourceEntry.responseEnd - resourceEntry.startTime,
              size: resourceEntry.transferSize || 0,
              cached: resourceEntry.transferSize === 0,
              contentType: this.getContentType(resourceEntry.name),
              timestamp: Date.now(),
            });
          }
        }
      });

      observer.observe({ entryTypes: ['resource'] });
    } catch (error) {
      console.error('Failed to observe resource timing:', error);
    }
  }

  /**
   * Observe Web Vitals metrics
   */
  private observeWebVitals() {
    if (!('PerformanceObserver' in window)) return;

    // Observe LCP
    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        if (lastEntry) {
          this.webVitals.LCP = (lastEntry as any).renderTime || (lastEntry as any).loadTime;
        }
      });
      lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
    } catch (error) {
      console.error('Failed to observe LCP:', error);
    }

    // Observe FID
    try {
      const fidObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.entryType === 'first-input') {
            this.webVitals.FID = (entry as any).processingStart - entry.startTime;
          }
        }
      });
      fidObserver.observe({ entryTypes: ['first-input'] });
    } catch (error) {
      console.error('Failed to observe FID:', error);
    }

    // Observe CLS
    try {
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (!(entry as any).hadRecentInput) {
            clsValue += (entry as any).value;
            this.webVitals.CLS = clsValue;
          }
        }
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
    } catch (error) {
      console.error('Failed to observe CLS:', error);
    }

    // Calculate TTFB
    if (window.performance && window.performance.timing) {
      const timing = window.performance.timing;
      this.webVitals.TTFB = timing.responseStart - timing.navigationStart;
    }

    // Calculate FCP
    try {
      const fcpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            this.webVitals.FCP = entry.startTime;
          }
        }
      });
      fcpObserver.observe({ entryTypes: ['paint'] });
    } catch (error) {
      console.error('Failed to observe FCP:', error);
    }
  }

  /**
   * Track asset performance metrics
   */
  private trackAssetPerformance(asset: AssetPerformance) {
    this.metrics.push(asset);
    
    // Keep only last 1000 entries to prevent memory bloat
    if (this.metrics.length > 1000) {
      this.metrics = this.metrics.slice(-1000);
    }
  }

  /**
   * Get content type from URL
   */
  private getContentType(url: string): string {
    if (url.match(/\.(js|mjs)$/i)) return 'javascript';
    if (url.match(/\.css$/i)) return 'stylesheet';
    if (url.match(/\.(jpg|jpeg|png|gif|webp|avif|svg|ico)$/i)) return 'image';
    if (url.match(/\.(woff|woff2|ttf|otf|eot)$/i)) return 'font';
    if (url.match(/\.json$/i)) return 'json';
    return 'other';
  }

  /**
   * Calculate performance metrics
   */
  public getMetrics(): PerformanceMetrics {
    const totalRequests = this.metrics.length;
    const cachedRequests = this.metrics.filter(m => m.cached).length;
    const failedRequests = this.metrics.filter(m => m.loadTime > 5000).length;
    
    const avgLoadTime = totalRequests > 0
      ? this.metrics.reduce((sum, m) => sum + m.loadTime, 0) / totalRequests
      : 0;
    
    const bandwidth = this.metrics.reduce((sum, m) => sum + m.size, 0);
    
    // Get unique edge locations from headers (mock for now)
    const edgeLocations = ['us-east-1', 'eu-west-1', 'ap-southeast-1'];

    return {
      cacheHitRate: totalRequests > 0 ? cachedRequests / totalRequests : 0,
      avgLoadTime,
      totalRequests,
      cachedRequests,
      failedRequests,
      bandwidth,
      edgeLocations,
    };
  }

  /**
   * Get Web Vitals metrics
   */
  public getWebVitals(): WebVitals {
    return { ...this.webVitals };
  }

  /**
   * Check if Web Vitals meet performance targets
   */
  public checkVitalsHealth(): { metric: string; value: number; status: 'good' | 'needs-improvement' | 'poor' }[] {
    const results = [];
    const thresholds = CDN_CONFIG.monitoring.webVitals;

    if (this.webVitals.LCP !== undefined) {
      const status = this.webVitals.LCP <= thresholds.LCP.good ? 'good' :
                     this.webVitals.LCP <= thresholds.LCP.needsImprovement ? 'needs-improvement' : 'poor';
      results.push({ metric: 'LCP', value: this.webVitals.LCP, status });
    }

    if (this.webVitals.FID !== undefined) {
      const status = this.webVitals.FID <= thresholds.FID.good ? 'good' :
                     this.webVitals.FID <= thresholds.FID.needsImprovement ? 'needs-improvement' : 'poor';
      results.push({ metric: 'FID', value: this.webVitals.FID, status });
    }

    if (this.webVitals.CLS !== undefined) {
      const status = this.webVitals.CLS <= thresholds.CLS.good ? 'good' :
                     this.webVitals.CLS <= thresholds.CLS.needsImprovement ? 'needs-improvement' : 'poor';
      results.push({ metric: 'CLS', value: this.webVitals.CLS, status });
    }

    if (this.webVitals.FCP !== undefined) {
      const status = this.webVitals.FCP <= thresholds.FCP.good ? 'good' :
                     this.webVitals.FCP <= thresholds.FCP.needsImprovement ? 'needs-improvement' : 'poor';
      results.push({ metric: 'FCP', value: this.webVitals.FCP, status });
    }

    if (this.webVitals.TTFB !== undefined) {
      const status = this.webVitals.TTFB <= thresholds.TTFB.good ? 'good' :
                     this.webVitals.TTFB <= thresholds.TTFB.needsImprovement ? 'needs-improvement' : 'poor';
      results.push({ metric: 'TTFB', value: this.webVitals.TTFB, status });
    }

    return results;
  }

  /**
   * Get asset performance by type
   */
  public getAssetsByType(type: string): AssetPerformance[] {
    return this.metrics.filter(m => m.contentType === type);
  }

  /**
   * Setup periodic reporting
   */
  private setupReporting() {
    // Report metrics every 30 seconds in development
    if (process.env.NODE_ENV === 'development') {
      setInterval(() => {
        const metrics = this.getMetrics();
        const vitals = this.checkVitalsHealth();
        
        console.group('📊 CDN Performance Report');
        console.log('Cache Hit Rate:', `${(metrics.cacheHitRate * 100).toFixed(2)}%`);
        console.log('Avg Load Time:', `${metrics.avgLoadTime.toFixed(2)}ms`);
        console.log('Total Requests:', metrics.totalRequests);
        console.log('Cached Requests:', metrics.cachedRequests);
        console.log('Bandwidth Used:', `${(metrics.bandwidth / 1024 / 1024).toFixed(2)}MB`);
        
        console.group('Web Vitals');
        vitals.forEach(({ metric, value, status }) => {
          const emoji = status === 'good' ? '✅' : status === 'needs-improvement' ? '⚠️' : '❌';
          console.log(`${emoji} ${metric}: ${value.toFixed(2)}ms (${status})`);
        });
        console.groupEnd();
        
        console.groupEnd();
      }, 30000);
    }

    // In production, send to analytics endpoint
    if (process.env.NODE_ENV === 'production') {
      setInterval(() => {
        this.sendAnalytics();
      }, 60000); // Every minute
    }
  }

  /**
   * Send analytics to monitoring service
   */
  private async sendAnalytics() {
    try {
      const metrics = this.getMetrics();
      const vitals = this.getWebVitals();
      
      // Send to your analytics endpoint
      await fetch('/api/analytics/cdn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metrics,
          vitals,
          timestamp: Date.now(),
          userAgent: navigator.userAgent,
        }),
      });
    } catch (error) {
      console.error('Failed to send CDN analytics:', error);
    }
  }

  /**
   * Clear metrics
   */
  public clearMetrics() {
    this.metrics = [];
    this.webVitals = {};
  }
}

// Export singleton instance
export const cdnMonitor = new CDNMonitor();

// Auto-initialize in browser
if (typeof window !== 'undefined') {
  cdnMonitor.initialize();
}