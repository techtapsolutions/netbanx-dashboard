'use client';

import { Suspense, lazy, useState, useEffect, useMemo, useCallback } from 'react';
import { PaysafeCredentials, Transaction, PaymentSummary, ReportFilter } from '@/types/paysafe';
import { PaysafeAPI, createMockData } from '@/lib/paysafe-api';
import { getDateRange } from '@/lib/utils';
import { LoadingSpinner } from './LoadingSpinner';
import { DashboardSkeleton } from './skeletons/DashboardSkeleton';

// Lazy load heavy components
const Header = lazy(() => import('./Header').then(module => ({ default: module.Header })));
const StatsCards = lazy(() => import('./StatsCards').then(module => ({ default: module.StatsCards })));
const TransactionTable = lazy(() => import('./TransactionTable').then(module => ({ default: module.TransactionTable })));
const ReportFilters = lazy(() => import('./ReportFilters').then(module => ({ default: module.ReportFilters })));
const Charts = lazy(() => import('./OptimizedCharts').then(module => ({ default: module.OptimizedCharts })));

interface OptimizedDashboardProps {
  credentials: PaysafeCredentials;
  onLogout: () => void;
}

export function OptimizedDashboard({ credentials, onLogout }: OptimizedDashboardProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<ReportFilter>(() => getDateRange(30));
  
  // Memoize API instance to prevent recreation
  const api = useMemo(() => new PaysafeAPI(credentials), [credentials]);
  const isMockMode = useMemo(() => credentials.apiKey === 'mock-api-key', [credentials.apiKey]);

  // Memoize fetch function to prevent unnecessary recreations
  const fetchData = useCallback(async (currentFilter: ReportFilter) => {
    try {
      setLoading(true);
      setError('');

      if (isMockMode) {
        // Use requestIdleCallback for non-critical mock data processing
        if ('requestIdleCallback' in window) {
          window.requestIdleCallback(() => {
            const mockTransactions = createMockData();
            setTransactions(mockTransactions);
            
            const mockSummary: PaymentSummary = {
              totalTransactions: mockTransactions.length,
              totalAmount: mockTransactions.reduce((sum, t) => sum + t.amount, 0),
              successfulTransactions: mockTransactions.filter(t => t.status === 'COMPLETED').length,
              failedTransactions: mockTransactions.filter(t => t.status === 'FAILED').length,
              pendingTransactions: mockTransactions.filter(t => t.status === 'PENDING').length,
              currency: 'USD',
              period: `${currentFilter.startDate} - ${currentFilter.endDate}`,
            };
            setSummary(mockSummary);
          });
        } else {
          const mockTransactions = createMockData();
          setTransactions(mockTransactions);
          
          const mockSummary: PaymentSummary = {
            totalTransactions: mockTransactions.length,
            totalAmount: mockTransactions.reduce((sum, t) => sum + t.amount, 0),
            successfulTransactions: mockTransactions.filter(t => t.status === 'COMPLETED').length,
            failedTransactions: mockTransactions.filter(t => t.status === 'FAILED').length,
            pendingTransactions: mockTransactions.filter(t => t.status === 'PENDING').length,
            currency: 'USD',
            period: `${currentFilter.startDate} - ${currentFilter.endDate}`,
          };
          setSummary(mockSummary);
        }
        return;
      }

      const [fetchedTransactions, fetchedSummary] = await Promise.all([
        api.getTransactions(currentFilter),
        api.getPaymentSummary(currentFilter)
      ]);

      setTransactions(fetchedTransactions);
      setSummary(fetchedSummary);
    } catch (error) {
      console.error('Error fetching data:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  }, [api, isMockMode]);

  useEffect(() => {
    fetchData(filter);
  }, [filter, fetchData]);

  const handleFilterChange = useCallback((newFilter: ReportFilter) => {
    setFilter(newFilter);
  }, []);

  const handleRefresh = useCallback(() => {
    fetchData(filter);
  }, [fetchData, filter]);

  return (
    <div className="min-h-screen bg-gray-50">
      <Suspense fallback={<div className="h-16 bg-white shadow animate-pulse" />}>
        <Header 
          onLogout={onLogout} 
          onRefresh={handleRefresh}
          isLoading={loading}
          isMockMode={isMockMode}
        />
      </Suspense>
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          <Suspense fallback={<div className="h-20 bg-white rounded-lg animate-pulse" />}>
            <ReportFilters 
              filter={filter}
              onChange={handleFilterChange}
              disabled={loading}
            />
          </Suspense>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {loading ? (
            <DashboardSkeleton />
          ) : (
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
                  onExport={() => {}}
                />
              </Suspense>
            </>
          )}
        </div>
      </div>
    </div>
  );
}