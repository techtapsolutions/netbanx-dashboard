'use client';

import { memo, useMemo, useState, useCallback } from 'react';
import { FixedSizeList as List } from 'react-window';
import { Transaction } from '@/types/paysafe';
import { formatCurrency, formatDate } from '@/lib/utils';
import { ChevronUp, ChevronDown, Download } from 'lucide-react';

interface OptimizedTransactionTableProps {
  transactions: Transaction[];
  onExport: () => void;
}

type SortField = 'createdAt' | 'amount' | 'status';
type SortOrder = 'asc' | 'desc';

// Row component for virtualized list
const TransactionRow = memo(({ index, style, data }: any) => {
  const transaction = data[index];
  
  return (
    <div style={style} className="flex items-center border-b border-gray-200 hover:bg-gray-50">
      <div className="flex-1 px-6 py-4 grid grid-cols-6 gap-4">
        <div className="text-sm text-gray-900">{transaction.id}</div>
        <div className="text-sm text-gray-500">{formatDate(transaction.createdAt)}</div>
        <div className="text-sm text-gray-900">{formatCurrency(transaction.amount)}</div>
        <div className="text-sm text-gray-500">{transaction.paymentMethod || 'N/A'}</div>
        <div>
          <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
            transaction.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
            transaction.status === 'PENDING' ? 'bg-yellow-100 text-yellow-800' :
            transaction.status === 'FAILED' ? 'bg-red-100 text-red-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {transaction.status}
          </span>
        </div>
        <div className="text-sm text-gray-500">{transaction.customerId || 'N/A'}</div>
      </div>
    </div>
  );
});

TransactionRow.displayName = 'TransactionRow';

export const OptimizedTransactionTable = memo(function OptimizedTransactionTable({ 
  transactions, 
  onExport 
}: OptimizedTransactionTableProps) {
  const [sortField, setSortField] = useState<SortField>('createdAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  const [searchTerm, setSearchTerm] = useState('');

  // Memoize filtered transactions
  const filteredTransactions = useMemo(() => {
    if (!searchTerm) return transactions;
    
    const term = searchTerm.toLowerCase();
    return transactions.filter(t => 
      t.id.toLowerCase().includes(term) ||
      t.customerId?.toLowerCase().includes(term) ||
      t.status.toLowerCase().includes(term) ||
      t.paymentMethod?.toLowerCase().includes(term)
    );
  }, [transactions, searchTerm]);

  // Memoize sorted transactions
  const sortedTransactions = useMemo(() => {
    const sorted = [...filteredTransactions].sort((a, b) => {
      let aVal: any = a[sortField];
      let bVal: any = b[sortField];

      if (sortField === 'createdAt') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }

      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
    return sorted;
  }, [filteredTransactions, sortField, sortOrder]);

  const handleSort = useCallback((field: SortField) => {
    if (sortField === field) {
      setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  }, [sortField]);

  const SortIcon = useCallback(({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return <div className="w-4 h-4" />;
    }
    return sortOrder === 'asc' ? 
      <ChevronUp className="w-4 h-4" /> : 
      <ChevronDown className="w-4 h-4" />;
  }, [sortField, sortOrder]);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200">
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900">Recent Transactions</h2>
          <button
            onClick={onExport}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
        
        {/* Search input */}
        <div className="max-w-md">
          <input
            type="text"
            placeholder="Search transactions..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Table Header */}
      <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
        <div className="grid grid-cols-6 gap-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Transaction ID
          </div>
          <button
            onClick={() => handleSort('createdAt')}
            className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700"
          >
            Date
            <SortIcon field="createdAt" />
          </button>
          <button
            onClick={() => handleSort('amount')}
            className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700"
          >
            Amount
            <SortIcon field="amount" />
          </button>
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Method
          </div>
          <button
            onClick={() => handleSort('status')}
            className="flex items-center gap-1 text-xs font-medium text-gray-500 uppercase tracking-wider hover:text-gray-700"
          >
            Status
            <SortIcon field="status" />
          </button>
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wider">
            Customer
          </div>
        </div>
      </div>

      {/* Virtualized Table Body */}
      <div className="bg-white">
        {sortedTransactions.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-gray-500">No transactions found</p>
          </div>
        ) : (
          <List
            height={400}
            itemCount={sortedTransactions.length}
            itemSize={65}
            width="100%"
            itemData={sortedTransactions}
            overscanCount={5}
          >
            {TransactionRow}
          </List>
        )}
      </div>

      {/* Table Footer */}
      <div className="px-6 py-4 border-t border-gray-200">
        <p className="text-sm text-gray-500">
          Showing {sortedTransactions.length} of {transactions.length} transactions
        </p>
      </div>
    </div>
  );
});