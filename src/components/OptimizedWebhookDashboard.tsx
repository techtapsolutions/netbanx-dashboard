'use client';

import { Suspense, lazy, useState, useEffect, useMemo, useCallback } from 'react';
import { Transaction, PaymentSummary } from '@/types/paysafe';
import { WebhookEvent, WebhookStats } from '@/types/webhook';
import { LoadingSpinner } from './LoadingSpinner';
import { DashboardSkeleton } from './skeletons/DashboardSkeleton';

// Lazy load components
const WebhookHeader = lazy(() => import('./WebhookHeader').then(module => ({ default: module.WebhookHeader })));
const StatsCards = lazy(() => import('./StatsCards').then(module => ({ default: module.StatsCards })));
const TransactionTable = lazy(() => import('./OptimizedTransactionTable').then(module => ({ default: module.OptimizedTransactionTable })));
const Charts = lazy(() => import('./OptimizedCharts').then(module => ({ default: module.OptimizedCharts })));
const WebhookEventsList = lazy(() => import('./WebhookEventsList').then(module => ({ default: module.WebhookEventsList })));
const WebhookConfig = lazy(() => import('./WebhookConfig').then(module => ({ default: module.WebhookConfig })));

// Custom hook for data fetching with caching
const useWebhookData = () => {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([]);
  const [webhookStats, setWebhookStats] = useState<WebhookStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lastFetch, setLastFetch] = useState<number>(0);

  const fetchData = useCallback(async (force: boolean = false) => {
    // Implement simple caching - don't refetch if data is less than 5 seconds old
    const now = Date.now();
    if (!force && lastFetch && (now - lastFetch) < 5000) {
      return;
    }

    try {
      setLoading(true);
      setError('');

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const [transactionsResponse, webhooksResponse] = await Promise.all([
        fetch('/api/data?type=transactions', { signal: controller.signal }),
        fetch('/api/data?type=webhooks&limit=50', { signal: controller.signal })
      ]);

      clearTimeout(timeout);

      if (!transactionsResponse.ok) {
        throw new Error(`Failed to fetch transactions: ${transactionsResponse.status}`);
      }

      if (!webhooksResponse.ok) {
        throw new Error(`Failed to fetch webhooks: ${webhooksResponse.status}`);
      }

      const transactionsData = await transactionsResponse.json();
      const webhooksData = await webhooksResponse.json();

      setTransactions(transactionsData.transactions || []);
      setSummary(transactionsData.summary || {
        totalTransactions: 0,
        totalAmount: 0,
        successfulTransactions: 0,
        failedTransactions: 0,
        pendingTransactions: 0,
        currency: 'USD',
        period: 'No data available',
      });
      setWebhookEvents(webhooksData.events || []);
      setWebhookStats(webhooksData.stats || {
        totalReceived: 0,
        successfullyProcessed: 0,
        failed: 0,
      });
      setLastFetch(now);

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        setError('Request timed out. Please try again.');
      } else {
        console.error('Error fetching webhook data:', error);
        setError(error instanceof Error ? error.message : 'Failed to fetch data');
      }
    } finally {
      setLoading(false);
    }
  }, [lastFetch]);

  return {
    transactions,
    summary,
    webhookEvents,
    webhookStats,
    loading,
    error,
    fetchData
  };
};

export function OptimizedWebhookDashboard() {
  const {
    transactions,
    summary,
    webhookEvents,
    webhookStats,
    loading,
    error,
    fetchData
  } = useWebhookData();

  const [activeTab, setActiveTab] = useState<'dashboard' | 'webhooks' | 'config'>('dashboard');

  useEffect(() => {
    fetchData();
    
    // Auto-refresh every 30 seconds with visibility check
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
    }, 30000);
    
    // Cleanup
    return () => clearInterval(interval);
  }, [fetchData]);

  // Handle page visibility changes for smart refresh
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchData();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [fetchData]);

  const generateTestWebhook = useCallback(async (eventType: string = 'random', count: number = 1) => {
    try {
      const response = await fetch('/api/webhooks/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ eventType, count }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate test webhook');
      }

      // Refresh data after generating test webhook
      setTimeout(() => fetchData(true), 1000);
    } catch (error) {
      console.error('Error generating test webhook:', error);
    }
  }, [fetchData]);

  const handleRefresh = useCallback(() => {
    fetchData(true);
  }, [fetchData]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Suspense fallback={<div className="h-16 bg-white shadow animate-pulse" />}>
        <WebhookHeader 
          onRefresh={handleRefresh}
          onGenerateTest={generateTestWebhook}
          onClearData={() => {
            // Implement clear data functionality if needed
            console.log('Clear data functionality not implemented');
          }}
          isLoading={loading}
          webhookStats={webhookStats}
          activeTab={activeTab}
          onTabChange={setActiveTab}
        />
      </Suspense>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {loading && activeTab === 'dashboard' ? (
          <DashboardSkeleton />
        ) : (
          <div className="space-y-8">
            {activeTab === 'dashboard' && (
              <>
                <Suspense fallback={<div className="h-32 bg-white rounded-lg animate-pulse" />}>
                  {summary && <StatsCards summary={summary} />}
                </Suspense>
                
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  <Suspense fallback={
                    <div className="lg:col-span-2 space-y-4">
                      <div className="h-64 bg-white rounded-lg animate-pulse" />
                      <div className="h-64 bg-white rounded-lg animate-pulse" />
                    </div>
                  }>
                    <Charts transactions={transactions} />
                  </Suspense>
                </div>

                <Suspense fallback={<div className="h-96 bg-white rounded-lg animate-pulse" />}>
                  <TransactionTable 
                    transactions={transactions}
                    onExport={() => {
                      // Implement CSV export
                      const csv = transactions.map(t => 
                        `${t.id},${t.createdAt},${t.amount},${t.status},${t.paymentMethod},${t.customerId}`
                      ).join('\\n');
                      
                      const blob = new Blob([csv], { type: 'text/csv' });
                      const url = window.URL.createObjectURL(blob);
                      const a = document.createElement('a');
                      a.href = url;
                      a.download = `transactions-${new Date().toISOString().split('T')[0]}.csv`;
                      a.click();
                      window.URL.revokeObjectURL(url);
                    }}
                  />
                </Suspense>
              </>
            )}

            {activeTab === 'webhooks' && (
              <Suspense fallback={<LoadingSpinner />}>
                <WebhookEventsList 
                  events={webhookEvents}
                  stats={webhookStats}
                />
              </Suspense>
            )}

            {activeTab === 'config' && (
              <Suspense fallback={<LoadingSpinner />}>
                <WebhookConfig />
              </Suspense>
            )}
          </div>
        )}
      </div>
    </div>
  );
}