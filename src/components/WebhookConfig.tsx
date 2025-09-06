'use client';

import { useState, useEffect } from 'react';
import { Copy, Check, ExternalLink, Zap, Trash2, Key, Save, AlertCircle } from 'lucide-react';

interface WebhookConfigProps {
  onGenerateTest: (eventType?: string, count?: number) => void;
  onClearData: () => void;
}

interface WebhookSecretData {
  endpoint: string;
  name: string;
  description: string;
  hasSecret: boolean;
  lastUsedAt?: string;
  usageCount?: number;
}

export function WebhookConfig({ onGenerateTest, onClearData }: WebhookConfigProps) {
  const [webhookUrl, setWebhookUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [testEventType, setTestEventType] = useState('PAYMENT_COMPLETED');
  const [testCount, setTestCount] = useState(1);
  
  // HMAC key management state
  const [webhookSecrets, setWebhookSecrets] = useState<WebhookSecretData[]>([]);
  const [showSecretForm, setShowSecretForm] = useState(false);
  const [selectedEndpoint, setSelectedEndpoint] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [secretName, setSecretName] = useState('');
  const [secretDescription, setSecretDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Get the current domain for webhook URL
    const protocol = window.location.protocol;
    const host = window.location.host;
    const url = `${protocol}//${host}/api/webhooks/netbanx`;
    setWebhookUrl(url);
    
    // Load webhook secrets
    loadWebhookSecrets();
  }, []);

  // Load webhook secrets from API
  const loadWebhookSecrets = async () => {
    try {
      const response = await fetch('/api/webhook-secrets');
      const data = await response.json();
      
      if (data.success) {
        // Transform API data to match our interface
        const secretsData: WebhookSecretData[] = [
          { endpoint: 'netbanx', name: 'Credit Card Payments', description: 'Primary Netbanx webhook endpoint', hasSecret: false },
          { endpoint: 'account-status', name: 'Account Status Updates', description: 'Account onboarding and status changes', hasSecret: false },
          { endpoint: 'direct-debit', name: 'Direct Debit Payments', description: 'Direct debit transactions and mandates', hasSecret: false },
          { endpoint: 'alternate-payments', name: 'Alternate Payments', description: 'Digital wallets and alternative payment methods', hasSecret: false },
        ];

        // Mark endpoints that have secrets configured
        data.secrets.forEach((secret: any) => {
          const endpointData = secretsData.find(s => s.endpoint === secret.endpoint);
          if (endpointData) {
            endpointData.hasSecret = true;
            endpointData.lastUsedAt = secret.lastUsedAt;
            endpointData.usageCount = secret.usageCount;
          }
        });

        setWebhookSecrets(secretsData);
      }
    } catch (error) {
      console.error('Error loading webhook secrets:', error);
    }
  };

  // Save HMAC secret key
  const saveSecretKey = async () => {
    if (!selectedEndpoint || !secretKey || !secretName) {
      setError('Please fill in all required fields');
      return;
    }

    setSaving(true);
    setError('');

    try {
      const response = await fetch('/api/webhook-secrets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          endpoint: selectedEndpoint,
          name: secretName,
          description: secretDescription,
          secretKey: secretKey,
          algorithm: 'sha256',
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Reset form
        setShowSecretForm(false);
        setSelectedEndpoint('');
        setSecretKey('');
        setSecretName('');
        setSecretDescription('');
        
        // Reload secrets
        await loadWebhookSecrets();
      } else {
        setError(data.error || 'Failed to save secret key');
      }
    } catch (error) {
      setError('Failed to save secret key');
      console.error('Error saving secret key:', error);
    } finally {
      setSaving(false);
    }
  };

  // Open secret form for specific endpoint
  const openSecretForm = (endpoint: string) => {
    const endpointData = webhookSecrets.find(s => s.endpoint === endpoint);
    if (endpointData) {
      setSelectedEndpoint(endpoint);
      setSecretName(endpointData.name);
      setSecretDescription(endpointData.description);
      setShowSecretForm(true);
      setError('');
    }
  };

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
        
        <div className="space-y-6">
          {/* Primary Webhook URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Primary Webhook URL
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={webhookUrl}
                readOnly
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 font-mono text-sm text-gray-900"
              />
              <button
                onClick={copyToClipboard}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Primary endpoint with HMAC verification and comprehensive logging
            </p>
          </div>

          {/* All Available Endpoints */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-3">
              All Available Webhook Endpoints
            </label>
            <div className="space-y-3">
              {/* Credit Card Payment Endpoints */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">Credit Card Payment Webhooks</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-gray-900">/api/webhooks/netbanx</span>
                    <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">PRIMARY</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-gray-600">/webhooks/netbanx</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">ALIAS</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-gray-600">/netbanx</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">ALIAS</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-gray-600">/webhook</span>
                    <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">ALIAS</span>
                  </div>
                </div>
              </div>

              {/* Account Status Webhooks */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">Account Status Webhooks</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-gray-900">/api/webhooks/account-status</span>
                    <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">SPECIALIZED</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">Account onboarding, approval, rejection, status changes</p>
                </div>
              </div>

              {/* Direct Debit Webhooks */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">Direct Debit Payment Webhooks</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-gray-900">/api/webhooks/direct-debit</span>
                    <span className="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded">SPECIALIZED</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">Direct debit transactions, mandate management, bank payments</p>
                </div>
              </div>

              {/* Alternate Payment Webhooks */}
              <div className="border border-gray-200 rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">Alternate Payment Webhooks</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-gray-900">/api/webhooks/alternate-payments</span>
                    <span className="text-xs bg-orange-100 text-orange-800 px-2 py-1 rounded">SPECIALIZED</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">PayPal, Apple Pay, Google Pay, Venmo, Skrill, and other digital wallets</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* HMAC Secret Key Management */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-medium text-gray-900">HMAC Secret Key Management</h3>
          <button
            onClick={() => setShowSecretForm(!showSecretForm)}
            className="inline-flex items-center space-x-2 px-3 py-2 text-sm border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50"
          >
            <Key className="h-4 w-4" />
            <span>Add/Update Keys</span>
          </button>
        </div>

        {/* Secret Management Form */}
        {showSecretForm && (
          <div className="mb-6 p-4 bg-gray-50 rounded-lg border">
            <h4 className="font-medium text-gray-900 mb-4">Configure HMAC Secret</h4>
            
            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
                <AlertCircle className="h-4 w-4 text-red-500" />
                <span className="text-sm text-red-700">{error}</span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Webhook Endpoint
                </label>
                <select
                  value={selectedEndpoint}
                  onChange={(e) => setSelectedEndpoint(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">Select an endpoint...</option>
                  {webhookSecrets.map(secret => (
                    <option key={secret.endpoint} value={secret.endpoint}>
                      {secret.name} ({secret.endpoint})
                    </option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Display Name
                </label>
                <input
                  type="text"
                  value={secretName}
                  onChange={(e) => setSecretName(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="e.g., Credit Card Webhook Key"
                />
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                HMAC Secret Key *
              </label>
              <input
                type="password"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                placeholder="Enter your HMAC secret key from Paysafe/Netbanx"
              />
              <p className="text-xs text-gray-500 mt-1">
                Key will be encrypted and stored securely. Minimum 32 characters required.
              </p>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Description (Optional)
              </label>
              <input
                type="text"
                value={secretDescription}
                onChange={(e) => setSecretDescription(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="Additional notes about this key"
              />
            </div>

            <div className="flex space-x-3">
              <button
                onClick={saveSecretKey}
                disabled={saving || !selectedEndpoint || !secretKey || !secretName}
                className="inline-flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                <Save className="h-4 w-4" />
                <span>{saving ? 'Saving...' : 'Save Secret Key'}</span>
              </button>
              
              <button
                onClick={() => {
                  setShowSecretForm(false);
                  setError('');
                  setSelectedEndpoint('');
                  setSecretKey('');
                  setSecretName('');
                  setSecretDescription('');
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Existing Secrets Display */}
        <div className="space-y-3">
          {webhookSecrets.map(secret => (
            <div key={secret.endpoint} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <h4 className="font-medium text-gray-900">{secret.name}</h4>
                    <span className="text-sm font-mono text-gray-600">/{secret.endpoint}</span>
                    {secret.hasSecret ? (
                      <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">CONFIGURED</span>
                    ) : (
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">NO SECRET</span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">{secret.description}</p>
                  {secret.hasSecret && (
                    <div className="text-xs text-gray-500 mt-2">
                      {secret.usageCount !== undefined && (
                        <span className="mr-4">Used: {secret.usageCount} times</span>
                      )}
                      {secret.lastUsedAt && (
                        <span>Last used: {new Date(secret.lastUsedAt).toLocaleDateString()}</span>
                      )}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => openSecretForm(secret.endpoint)}
                  className="inline-flex items-center space-x-1 px-3 py-2 text-sm border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  <Key className="h-4 w-4" />
                  <span>{secret.hasSecret ? 'Update' : 'Add'}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Webhook Testing */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Test Webhook Events</h3>
        
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                HTTP Method
              </label>
              <div className="px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-900 font-medium">
                POST
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Content Type
              </label>
              <div className="px-3 py-2 border border-gray-300 rounded-lg bg-gray-50 text-sm text-gray-900 font-medium">
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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