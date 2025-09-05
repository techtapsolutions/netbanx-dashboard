'use client';

import { useState, useEffect } from 'react';
import { Transaction, PaymentSummary } from '@/types/paysafe';
import { WebhookEvent, WebhookStats } from '@/types/webhook';
import { WebhookHeader } from './WebhookHeader';
import { StatsCards } from './StatsCards';
import { TransactionTable } from './TransactionTable';
import { Charts } from './Charts';
import { LoadingSpinner } from './LoadingSpinner';
import { WebhookEventsList } from './WebhookEventsList';
import { WebhookConfig } from './WebhookConfig';

export function WebhookDashboard() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [summary, setSummary] = useState<PaymentSummary | null>(null);
  const [webhookEvents, setWebhookEvents] = useState<WebhookEvent[]>([]);
  const [webhookStats, setWebhookStats] = useState<WebhookStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'dashboard' | 'webhooks' | 'config'>('dashboard');

  const fetchData = async () => {
    try {
      setLoading(true);
      setError('');

      console.log('Fetching webhook data...');

      const [transactionsResponse, webhooksResponse] = await Promise.all([
        fetch('/api/data?type=transactions'),
        fetch('/api/data?type=webhooks&limit=50')
      ]);

      console.log('Response status:', {
        transactions: transactionsResponse.status,
        webhooks: webhooksResponse.status
      });

      if (!transactionsResponse.ok) {
        const errorText = await transactionsResponse.text();
        console.error('Transactions API error:', errorText);
        throw new Error(`Failed to fetch transactions: ${transactionsResponse.status}`);
      }

      if (!webhooksResponse.ok) {
        const errorText = await webhooksResponse.text();
        console.error('Webhooks API error:', errorText);
        throw new Error(`Failed to fetch webhooks: ${webhooksResponse.status}`);
      }

      const transactionsData = await transactionsResponse.json();
      const webhooksData = await webhooksResponse.json();

      console.log('Fetched data:', {
        transactionsCount: transactionsData.transactions?.length || 0,
        webhooksCount: webhooksData.events?.length || 0,
        transactionsSuccess: transactionsData.success,
        webhooksSuccess: webhooksData.success
      });

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

    } catch (error) {
      console.error('Error fetching webhook data:', error);
      setError(error instanceof Error ? error.message : 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const generateTestWebhook = async (eventType: string = 'random', count: number = 1) => {
    try {
      const response = await fetch('/api/webhooks/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ eventType, count }),
      });

      if (response.ok) {
        // Refresh data after generating test webhooks
        setTimeout(fetchData, 1000);
      }
    } catch (error) {
      console.error('Error generating test webhook:', error);
    }
  };

  const clearAllData = async () => {
    try {
      const response = await fetch('/api/data', {
        method: 'DELETE',
      });

      if (response.ok) {
        fetchData();
      }
    } catch (error) {
      console.error('Error clearing data:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <WebhookHeader 
        onRefresh={fetchData}
        onGenerateTest={generateTestWebhook}
        onClearData={clearAllData}
        isLoading={loading}
        webhookStats={webhookStats}
        activeTab={activeTab}
        onTabChange={setActiveTab}
      />
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-8">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <div className="space-y-8">
                {summary && <StatsCards summary={summary} />}
                
                {transactions.length > 0 && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <Charts transactions={transactions} />
                  </div>
                )}

                <TransactionTable 
                  transactions={transactions}
                  onExport={() => {}}
                />
              </div>
            )}

            {activeTab === 'webhooks' && (
              <WebhookEventsList 
                events={webhookEvents}
                stats={webhookStats}
                onRefresh={fetchData}
              />
            )}

            {activeTab === 'config' && (
              <WebhookConfig 
                onGenerateTest={generateTestWebhook}
                onClearData={clearAllData}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}