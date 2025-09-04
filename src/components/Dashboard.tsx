'use client';

import { useState, useEffect } from 'react';
import { PaysafeCredentials, Transaction, PaymentSummary, ReportFilter } from '@/types/paysafe';
import { PaysafeAPI, createMockData } from '@/lib/paysafe-api';
import { getDateRange } from '@/lib/utils';
import { Header } from './Header';
import { StatsCards } from './StatsCards';
import { TransactionTable } from './TransactionTable';
import { ReportFilters } from './ReportFilters';
import { Charts } from './Charts';
import { LoadingSpinner } from './LoadingSpinner';

interface DashboardProps {
  credentials: PaysafeCredentials;
  onLogout: () => void;
}

export function Dashboard({ credentials, onLogout }: DashboardProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<ReportFilter>(() => getDateRange(30));
  const [api] = useState(() => new PaysafeAPI(credentials));

  const isMockMode = credentials.apiKey === 'mock-api-key';

  const fetchData = async (currentFilter: ReportFilter) => {
    try {
      setLoading(true);
      setError('');

      if (isMockMode) {
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
  };

  useEffect(() => {
    fetchData(filter);
  }, [filter]);

  const handleFilterChange = (newFilter: ReportFilter) => {
    setFilter(newFilter);
  };

  const handleRefresh = () => {
    fetchData(filter);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Header 
        onLogout={onLogout} 
        onRefresh={handleRefresh}
        isLoading={loading}
        isMockMode={isMockMode}
      />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="space-y-8">
          <ReportFilters 
            filter={filter}
            onChange={handleFilterChange}
            disabled={loading}
          />

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-red-600 text-sm">{error}</p>
            </div>
          )}

          {loading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : (
            <>
              {summary && <StatsCards summary={summary} />}
              
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <Charts transactions={transactions} />
              </div>

              <TransactionTable 
                transactions={transactions}
                onExport={() => {}}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
}