'use client';

import { useState, useEffect } from 'react';
import { Copy, Check, ExternalLink, Zap, Trash2 } from 'lucide-react';

interface WebhookConfigProps {
  onGenerateTest: (eventType?: string, count?: number) => void;
  onClearData: () => void;
}

export function WebhookConfig({ onGenerateTest, onClearData }: WebhookConfigProps) {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [testEventType, setTestEventType] = useState('PAYMENT_COMPLETED');
  const [testCount, setTestCount] = useState(1);

  useEffect(() => {
    // Get the current domain for webhook URL
    const protocol = window.location.protocol;
    const host = window.location.host;
    const url = `${protocol}//${host}/api/webhooks/netbanx`;
    setWebhookUrl(url);
  }, []);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(webhookUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const eventTypes = [
    'PAYMENT_COMPLETED',
    'PAYMENT_PENDING', 
    'PAYMENT_FAILED',
    'PAYMENT_CANCELLED',
    'PAYMENT_REFUNDED',
    'PAYMENT_AUTHORIZED',
    'PAYMENT_CAPTURED',
    'random'
  ];

  return (
    <div className="space-y-6">
      {/* Webhook Endpoint Configuration */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Webhook Endpoint Configuration</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Webhook URL
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={webhookUrl}
                readOnly
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm"
              />
              <button
                onClick={copyToClipboard}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Use this URL as your webhook endpoint in Netbanx/Paysafe configuration
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                HTTP Method
              </label>
              <div className="px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm">
                POST
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Content Type
              </label>
              <div className="px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm">
                application/json
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Webhook Testing */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Test Webhook Events</h3>
        
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Event Type
              </label>
              <select
                value={testEventType}
                onChange={(e) => setTestEventType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {eventTypes.map(type => (
                  <option key={type} value={type}>
                    {type === 'random' ? 'Random Event Type' : type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Number of Events
              </label>
              <input
                type="number"
                min="1"
                max="10"
                value={testCount}
                onChange={(e) => setTestCount(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          
          <div className="flex space-x-3">
            <button
              onClick={() => onGenerateTest(testEventType, testCount)}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Zap className="h-4 w-4" />
              <span>Generate Test Events</span>
            </button>
            
            <button
              onClick={onClearData}
              className="inline-flex items-center space-x-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              <Trash2 className="h-4 w-4" />
              <span>Clear All Data</span>
            </button>
          </div>
        </div>
      </div>

      {/* Setup Instructions */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Setup Instructions</h3>
        
        <div className="space-y-4 text-sm text-gray-600">
          <div>
            <h4 className="font-medium text-gray-900 mb-2">1. Configure Webhook in Paysafe/Netbanx</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>Log in to your Paysafe/Netbanx merchant portal</li>
              <li>Navigate to Developer Settings or Webhook Configuration</li>
              <li>Add the webhook URL provided above</li>
              <li>Select the events you want to receive (payments, refunds, etc.)</li>
              <li>Save the configuration</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-gray-900 mb-2">2. Supported Event Types</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>Payment events (completed, failed, pending)</li>
              <li>Refund events</li>
              <li>Authorization and capture events</li>
              <li>Chargeback notifications</li>
              <li>Account status changes</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium text-gray-900 mb-2">3. Security</h4>
            <ul className="list-disc pl-5 space-y-1">
              <li>Webhook signatures are validated when provided</li>
              <li>All webhook data is processed and stored temporarily</li>
              <li>Use HTTPS endpoints in production</li>
              <li>Monitor webhook logs for security issues</li>
            </ul>
          </div>
          
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <h4 className="font-medium text-blue-900 mb-2">💡 Testing</h4>
            <p className="text-blue-800">
              Use the "Generate Test Events" button above to simulate webhook data while you set up 
              your Paysafe configuration. This helps you verify your dashboard is working correctly.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}