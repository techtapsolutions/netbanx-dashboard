'use client';

import { useState } from 'react';
import { PaysafeCredentials } from '@/types/paysafe';
import { PaysafeAPI } from '@/lib/paysafe-api';
import { Eye, EyeOff, Lock, Key } from 'lucide-react';

interface AuthFormProps {
  onAuthenticate: (credentials: PaysafeCredentials) => void;
}

export function AuthForm({ onAuthenticate }: AuthFormProps) {
  const [formData, setFormData] = useState({
    apiKey: '',
    apiSecret: '',
    environment: 'sandbox' as 'sandbox' | 'production',
  });
  const [showSecret, setShowSecret] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [useMockData, setUseMockData] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (useMockData) {
        onAuthenticate({
          apiKey: 'mock-api-key',
          apiSecret: 'mock-api-secret',
          environment: 'sandbox',
        });
        return;
      }

      if (!formData.apiKey.trim() || !formData.apiSecret.trim()) {
        throw new Error('Please provide both API Key and API Secret');
      }

      const credentials: PaysafeCredentials = {
        apiKey: formData.apiKey.trim(),
        apiSecret: formData.apiSecret.trim(),
        environment: formData.environment,
      };

      const api = new PaysafeAPI(credentials);
      const isConnected = await api.testConnection();

      if (!isConnected) {
        throw new Error('Failed to connect to Paysafe API. Please check your credentials.');
      }

      onAuthenticate(credentials);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Authentication failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="bg-white shadow-xl rounded-lg p-8">
        <div className="text-center mb-8">
          <div className="mx-auto h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center mb-4">
            <Lock className="h-6 w-6 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Netbanx Dashboard</h2>
          <p className="text-gray-600 mt-2">Enter your Paysafe API credentials to continue</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="apiKey" className="block text-sm font-medium text-gray-700 mb-2">
              API Key
            </label>
            <div className="relative">
              <Key className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                id="apiKey"
                type="text"
                value={formData.apiKey}
                onChange={(e) => setFormData({ ...formData, apiKey: e.target.value })}
                className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your API Key"
                disabled={isLoading || useMockData}
              />
            </div>
          </div>

          <div>
            <label htmlFor="apiSecret" className="block text-sm font-medium text-gray-700 mb-2">
              API Secret
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
              <input
                id="apiSecret"
                type={showSecret ? 'text' : 'password'}
                value={formData.apiSecret}
                onChange={(e) => setFormData({ ...formData, apiSecret: e.target.value })}
                className="pl-10 pr-10 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Enter your API Secret"
                disabled={isLoading || useMockData}
              />
              <button
                type="button"
                onClick={() => setShowSecret(!showSecret)}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                disabled={isLoading || useMockData}
              >
                {showSecret ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="environment" className="block text-sm font-medium text-gray-700 mb-2">
              Environment
            </label>
            <select
              id="environment"
              value={formData.environment}
              onChange={(e) => setFormData({ ...formData, environment: e.target.value as 'sandbox' | 'production' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading || useMockData}
            >
              <option value="sandbox">Sandbox</option>
              <option value="production">Production</option>
            </select>
          </div>

          <div className="flex items-center">
            <input
              id="useMockData"
              type="checkbox"
              checked={useMockData}
              onChange={(e) => setUseMockData(e.target.checked)}
              className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
              disabled={isLoading}
            />
            <label htmlFor="useMockData" className="ml-2 block text-sm text-gray-700">
              Use mock data for demonstration
            </label>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? 'Connecting...' : 'Connect to Dashboard'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-xs text-gray-500">
            Your credentials are stored locally and never transmitted to third parties.
          </p>
        </div>
      </div>
    </div>
  );
}