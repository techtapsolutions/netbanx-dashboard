'use client';

import { RefreshCw, LogOut, TestTube } from 'lucide-react';

interface HeaderProps {
  onLogout: () => void;
  onRefresh: () => void;
  isLoading: boolean;
  isMockMode: boolean;
}

export function Header({ onLogout, onRefresh, isLoading, isMockMode }: HeaderProps) {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center space-x-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Netbanx Dashboard</h1>
              <p className="text-sm text-gray-500">Payment data and reporting portal</p>
            </div>
            {isMockMode && (
              <div className="flex items-center space-x-2 bg-yellow-100 text-yellow-800 px-3 py-1 rounded-full text-sm">
                <TestTube className="h-4 w-4" />
                <span>Demo Mode</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-4">
            <button
              onClick={onRefresh}
              disabled={isLoading}
              className="inline-flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
            
            <button
              onClick={onLogout}
              className="inline-flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-lg hover:bg-red-700 focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}