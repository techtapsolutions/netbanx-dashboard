'use client';

import { RefreshCw, Zap, Trash2, BarChart3, Webhook, Settings } from 'lucide-react';
import { WebhookStats } from '@/types/webhook';

interface WebhookHeaderProps {
  onRefresh: () => void;
  onGenerateTest: (eventType?: string, count?: number) => void;
  onClearData: () => void;
  isLoading: boolean;
  webhookStats: WebhookStats | null;
  activeTab: 'dashboard' | 'webhooks' | 'config';
  onTabChange: (tab: 'dashboard' | 'webhooks' | 'config') => void;
}

export function WebhookHeader({ 
  onRefresh, 
  onGenerateTest, 
  onClearData, 
  isLoading, 
  webhookStats,
  activeTab,
  onTabChange
}: WebhookHeaderProps) {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Netbanx Webhook Dashboard</h1>
              <p className="text-sm text-gray-500">Real-time webhook data processing</p>
            </div>
            {webhookStats && (
              <div className="flex items-center space-x-4 text-sm">
                <div className="bg-green-100 text-green-800 px-2 py-1 rounded">
                  {webhookStats.totalReceived} received
                </div>
                <div className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                  {webhookStats.successfullyProcessed} processed
                </div>
                {webhookStats.failed > 0 && (
                  <div className="bg-red-100 text-red-800 px-2 py-1 rounded">
                    {webhookStats.failed} failed
                  </div>
                )}
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-4">
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="inline-flex items-center space-x-2 px-3 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            
            <button
              onClick={() => onGenerateTest('random', 1)}
              disabled={isLoading}
              className="inline-flex items-center space-x-2 px-3 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Zap className="h-4 w-4" />
              <span>Test Webhook</span>
            </button>
            
            <button
              onClick={onClearData}
              disabled={isLoading}
              className="inline-flex items-center space-x-2 px-3 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-lg hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Trash2 className="h-4 w-4" />
              <span>Clear Data</span>
            </button>
          </div>
        </div>
        
        {/* Tab Navigation */}
        <div className="border-t border-gray-200">
          <nav className="flex space-x-8" aria-label="Tabs">
            <button
              onClick={() => onTabChange('dashboard')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'dashboard'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <BarChart3 className="h-4 w-4" />
                <span>Dashboard</span>
              </div>
            </button>
            
            <button
              onClick={() => onTabChange('webhooks')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'webhooks'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Webhook className="h-4 w-4" />
                <span>Webhook Events</span>
              </div>
            </button>
            
            <button
              onClick={() => onTabChange('config')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'config'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Settings className="h-4 w-4" />
                <span>Configuration</span>
              </div>
            </button>
          </nav>
        </div>
      </div>
    </header>
  );
}