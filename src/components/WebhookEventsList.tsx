'use client';

import { useState } from 'react';
import { WebhookEvent, WebhookStats } from '@/types/webhook';
import { formatDateTime, getStatusColor } from '@/lib/utils';
import { ChevronDown, ChevronRight, AlertCircle, CheckCircle, Search } from 'lucide-react';

interface WebhookEventsListProps {
  events: WebhookEvent[];
  stats: WebhookStats | null;
  onRefresh: () => void;
}

export function WebhookEventsList({ events, stats, onRefresh }: WebhookEventsListProps) {
  const [expandedEvent, setExpandedEvent] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterEventType, setFilterEventType] = useState('');

  const filteredEvents = events.filter(event => {
    const matchesSearch = event.eventType.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         event.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         event.payload.eventData.merchantRefNum?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesFilter = !filterEventType || event.eventType.includes(filterEventType);
    
    return matchesSearch && matchesFilter;
  });

  const uniqueEventTypes = [...new Set(events.map(e => e.eventType))];

  const toggleExpanded = (eventId: string) => {
    setExpandedEvent(expandedEvent === eventId ? null : eventId);
  };

  return (
    <div className="space-y-6">
      {/* Stats Summary */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-sm font-medium text-gray-500">Total Webhooks</div>
            <div className="text-2xl font-bold text-gray-900">{stats.totalReceived}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-sm font-medium text-gray-500">Processed</div>
            <div className="text-2xl font-bold text-green-600">{stats.successfullyProcessed}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-sm font-medium text-gray-500">Failed</div>
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow-sm border">
            <div className="text-sm font-medium text-gray-500">Last Received</div>
            <div className="text-lg font-medium text-gray-900">
              {stats.lastReceived ? formatDateTime(stats.lastReceived) : 'Never'}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow-sm border">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search events..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>
          <div className="md:w-64">
            <select
              value={filterEventType}
              onChange={(e) => setFilterEventType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Event Types</option>
              {uniqueEventTypes.map(type => (
                <option key={type} value={type}>{type}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Events List */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Webhook Events ({filteredEvents.length})
          </h3>
        </div>

        {filteredEvents.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-gray-500">No webhook events received yet.</p>
            <p className="text-sm text-gray-400 mt-2">
              Use the "Test Webhook" button to generate sample events.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200">
            {filteredEvents.map((event) => (
              <div key={event.id} className="p-4 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4">
                    <button
                      onClick={() => toggleExpanded(event.id)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      {expandedEvent === event.id ? (
                        <ChevronDown className="h-5 w-5" />
                      ) : (
                        <ChevronRight className="h-5 w-5" />
                      )}
                    </button>
                    
                    <div className="flex items-center space-x-2">
                      {event.error ? (
                        <AlertCircle className="h-5 w-5 text-red-500" />
                      ) : (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      )}
                    </div>
                    
                    <div>
                      <div className="font-medium text-gray-900">{event.eventType}</div>
                      <div className="text-sm text-gray-500">{formatDateTime(event.timestamp)}</div>
                    </div>
                  </div>
                  
                  <div className="flex items-center space-x-4 text-sm text-gray-500">
                    <span className="font-mono">{event.id}</span>
                    {event.payload.eventData.merchantRefNum && (
                      <span>{event.payload.eventData.merchantRefNum}</span>
                    )}
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      event.processed && !event.error 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {event.error ? 'Failed' : 'Processed'}
                    </span>
                  </div>
                </div>
                
                {expandedEvent === event.id && (
                  <div className="mt-4 ml-9">
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="font-medium text-gray-900 mb-2">Event Data</h4>
                      <pre className="text-sm text-gray-600 overflow-x-auto">
                        {JSON.stringify(event.payload, null, 2)}
                      </pre>
                      {event.error && (
                        <div className="mt-2 p-2 bg-red-50 rounded border border-red-200">
                          <h5 className="font-medium text-red-800">Error</h5>
                          <p className="text-sm text-red-600">{event.error}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}