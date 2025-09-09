// Performance monitoring utility for tracking and reporting metrics

export interface PerformanceMetrics {
  fcp: number | null; // First Contentful Paint
  lcp: number | null; // Largest Contentful Paint
  fid: number | null; // First Input Delay
  cls: number | null; // Cumulative Layout Shift
  ttfb: number | null; // Time to First Byte
  tti: number | null; // Time to Interactive
  bundleSize: number | null;
  memoryUsage: number | null;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    fcp: null,
    lcp: null,
    fid: null,
    cls: null,
    ttfb: null,
    tti: null,
    bundleSize: null,
    memoryUsage: null,
  };

  constructor() {
    if (typeof window !== 'undefined') {
      this.initializeObservers();
      this.measureTTFB();
      this.measureMemory();
    }
  }

  private initializeObservers() {
    // Observe FCP and LCP
    if ('PerformanceObserver' in window) {
      // First Contentful Paint
      const fcpObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.name === 'first-contentful-paint') {
            this.metrics.fcp = Math.round(entry.startTime);
            this.reportMetric('FCP', this.metrics.fcp);
          }
        }
      });

      try {
        fcpObserver.observe({ entryTypes: ['paint'] });
      } catch (e) {
        console.warn('Paint observer not supported');
      }

      // Largest Contentful Paint
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const lastEntry = entries[entries.length - 1];
        this.metrics.lcp = Math.round(lastEntry.startTime);
        this.reportMetric('LCP', this.metrics.lcp);
      });

      try {
        lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });
      } catch (e) {
        console.warn('LCP observer not supported');
      }

      // First Input Delay
      const fidObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const fidEntry = entry as any;
          this.metrics.fid = Math.round(fidEntry.processingStart - fidEntry.startTime);
          this.reportMetric('FID', this.metrics.fid);
        }
      });

      try {
        fidObserver.observe({ entryTypes: ['first-input'] });
      } catch (e) {
        console.warn('FID observer not supported');
      }

      // Cumulative Layout Shift
      let clsValue = 0;
      let clsEntries: any[] = [];

      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const layoutShiftEntry = entry as any;
          if (!layoutShiftEntry.hadRecentInput) {
            clsEntries.push(entry);
            clsValue += layoutShiftEntry.value;
          }
        }
        this.metrics.cls = Math.round(clsValue * 1000) / 1000;
        this.reportMetric('CLS', this.metrics.cls);
      });

      try {
        clsObserver.observe({ entryTypes: ['layout-shift'] });
      } catch (e) {
        console.warn('CLS observer not supported');
      }
    }
  }

  private measureTTFB() {
    if (window.performance && window.performance.timing) {
      const timing = window.performance.timing;
      const ttfb = timing.responseStart - timing.navigationStart;
      this.metrics.ttfb = Math.round(ttfb);
      this.reportMetric('TTFB', this.metrics.ttfb);
    }
  }

  private measureMemory() {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      this.metrics.memoryUsage = Math.round(memory.usedJSHeapSize / 1048576); // Convert to MB
      this.reportMetric('Memory', this.metrics.memoryUsage, 'MB');
    }
  }

  private reportMetric(name: string, value: number | null, unit: string = 'ms') {
    if (value === null) return;
    
    const status = this.getMetricStatus(name, value);
    const color = status === 'good' ? 'green' : status === 'needs-improvement' ? 'orange' : 'red';
    
    console.log(
      `%c[Performance] ${name}: ${value}${unit} (${status})`,
      `color: ${color}; font-weight: bold`
    );
  }

  private getMetricStatus(metric: string, value: number): 'good' | 'needs-improvement' | 'poor' {
    const thresholds: Record<string, { good: number; poor: number }> = {
      FCP: { good: 1800, poor: 3000 },
      LCP: { good: 2500, poor: 4000 },
      FID: { good: 100, poor: 300 },
      CLS: { good: 0.1, poor: 0.25 },
      TTFB: { good: 800, poor: 1800 },
    };

    const threshold = thresholds[metric];
    if (!threshold) return 'good';

    if (value <= threshold.good) return 'good';
    if (value <= threshold.poor) return 'needs-improvement';
    return 'poor';
  }

  public getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  public async measureBundleSize(): Promise<number | null> {
    try {
      const resources = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
      const jsResources = resources.filter(r => r.name.endsWith('.js'));
      const totalSize = jsResources.reduce((sum, r) => sum + (r.transferSize || 0), 0);
      this.metrics.bundleSize = Math.round(totalSize / 1024); // Convert to KB
      this.reportMetric('Bundle Size', this.metrics.bundleSize, 'KB');
      return this.metrics.bundleSize;
    } catch (e) {
      console.warn('Unable to measure bundle size');
      return null;
    }
  }

  public reportToAnalytics() {
    const metrics = this.getMetrics();
    
    // Send to analytics endpoint
    if (process.env.NODE_ENV === 'production') {
      fetch('/api/analytics/performance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metrics,
          timestamp: new Date().toISOString(),
          userAgent: navigator.userAgent,
          url: window.location.href,
        }),
      }).catch(console.error);
    }

    // Log summary to console
    console.table(metrics);
  }

  // Helper to track component render times
  public measureComponentRender(componentName: string, startTime: number) {
    const endTime = performance.now();
    const renderTime = Math.round(endTime - startTime);
    
    console.log(
      `%c[Render] ${componentName}: ${renderTime}ms`,
      renderTime < 16 ? 'color: green' : renderTime < 50 ? 'color: orange' : 'color: red'
    );
    
    return renderTime;
  }
}

// Singleton instance
let performanceMonitor: PerformanceMonitor | null = null;

export function getPerformanceMonitor(): PerformanceMonitor {
  if (!performanceMonitor && typeof window !== 'undefined') {
    performanceMonitor = new PerformanceMonitor();
  }
  return performanceMonitor!;
}

// React hook for performance monitoring
export function usePerformanceMonitor(componentName: string) {
  const startTime = typeof window !== 'undefined' ? performance.now() : 0;
  
  if (typeof window !== 'undefined') {
    const monitor = getPerformanceMonitor();
    
    // Measure render time after component mounts
    if (monitor) {
      requestAnimationFrame(() => {
        monitor.measureComponentRender(componentName, startTime);
      });
    }
  }
  
  return getPerformanceMonitor();
}