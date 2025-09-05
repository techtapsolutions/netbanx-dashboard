'use client';

import { useState } from 'react';
import { ReportFilter } from '@/types/paysafe';
import { getDateRange } from '@/lib/utils';
import { Calendar, Filter, X } from 'lucide-react';
import { format } from 'date-fns';

interface ReportFiltersProps {
  filter: ReportFilter;
  onChange: (filter: ReportFilter) => void;
  disabled?: boolean;
}

export function ReportFilters({ filter, onChange, disabled }: ReportFiltersProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [localFilter, setLocalFilter] = useState(filter);

  const applyFilter = () => {
    onChange(localFilter);
    setIsExpanded(false);
  };

  const resetFilter = () => {
    const defaultFilter = getDateRange(30);
    setLocalFilter(defaultFilter);
    onChange(defaultFilter);
  };

  const quickRanges = [
    { label: 'Last 7 days', days: 7 },
    { label: 'Last 30 days', days: 30 },
    { label: 'Last 90 days', days: 90 },
  ];

  const statuses = [
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'PENDING', label: 'Pending' },
    { value: 'FAILED', label: 'Failed' },
    { value: 'CANCELLED', label: 'Cancelled' },
  ];

  const currencies = ['USD', 'EUR', 'GBP', 'CAD', 'AUD'];

  return (
    <div className="bg-white shadow-sm rounded-lg border border-gray-200">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Filter className="h-5 w-5 text-gray-400" />
            <h3 className="text-lg font-medium text-gray-900">Report Filters</h3>
          </div>
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            disabled={disabled}
            className="text-sm text-blue-600 hover:text-blue-800 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExpanded ? 'Hide Filters' : 'Show Filters'}
          </button>
        </div>
      </div>

      <div className="px-6 py-4">
        <div className="flex flex-wrap gap-2 mb-4">
          {quickRanges.map((range) => (
            <button
              key={range.days}
              onClick={() => {
                const newFilter = { ...localFilter, ...getDateRange(range.days) };
                setLocalFilter(newFilter);
                onChange(newFilter);
              }}
              disabled={disabled}
              className="px-3 py-1 text-sm bg-gray-100 text-gray-800 rounded-md hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {range.label}
            </button>
          ))}
        </div>

        {isExpanded && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-2">
                  Start Date
                </label>
                <input
                  type="date"
                  value={localFilter.startDate?.split('T')[0] || ''}
                  onChange={(e) => setLocalFilter({
                    ...localFilter,
                    startDate: new Date(e.target.value).toISOString()
                  })}
                  disabled={disabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-2">
                  End Date
                </label>
                <input
                  type="date"
                  value={localFilter.endDate?.split('T')[0] || ''}
                  onChange={(e) => setLocalFilter({
                    ...localFilter,
                    endDate: new Date(e.target.value).toISOString()
                  })}
                  disabled={disabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-2">
                  Status
                </label>
                <select
                  multiple
                  value={localFilter.status || []}
                  onChange={(e) => {
                    const values = Array.from(e.target.selectedOptions, option => option.value);
                    setLocalFilter({ ...localFilter, status: values });
                  }}
                  disabled={disabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                  size={4}
                >
                  {statuses.map((status) => (
                    <option key={status.value} value={status.value}>
                      {status.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-2">
                  Currency
                </label>
                <select
                  value={localFilter.currency || ''}
                  onChange={(e) => setLocalFilter({ ...localFilter, currency: e.target.value || undefined })}
                  disabled={disabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">All Currencies</option>
                  {currencies.map((currency) => (
                    <option key={currency} value={currency}>
                      {currency}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-800">
                  Amount Range
                </label>
                <input
                  type="number"
                  placeholder="Min amount"
                  value={localFilter.minAmount || ''}
                  onChange={(e) => setLocalFilter({
                    ...localFilter,
                    minAmount: e.target.value ? parseFloat(e.target.value) : undefined
                  })}
                  disabled={disabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                />
                <input
                  type="number"
                  placeholder="Max amount"
                  value={localFilter.maxAmount || ''}
                  onChange={(e) => setLocalFilter({
                    ...localFilter,
                    maxAmount: e.target.value ? parseFloat(e.target.value) : undefined
                  })}
                  disabled={disabled}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>
            </div>

            <div className="flex space-x-3 pt-4">
              <button
                onClick={applyFilter}
                disabled={disabled}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Apply Filters
              </button>
              <button
                onClick={resetFilter}
                disabled={disabled}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}