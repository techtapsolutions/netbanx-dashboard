'use client';

import { PaymentSummary } from '@/types/paysafe';
import { formatCurrency } from '@/lib/utils';
import { CreditCard, TrendingUp, AlertTriangle, Clock } from 'lucide-react';

interface StatsCardsProps {
  summary: PaymentSummary;
}

export function StatsCards({ summary }: StatsCardsProps) {
  const successRate = summary.totalTransactions > 0 
    ? (summary.successfulTransactions / summary.totalTransactions) * 100 
    : 0;

  const cards = [
    {
      title: 'Total Transactions',
      value: summary.totalTransactions.toLocaleString(),
      icon: CreditCard,
      color: 'text-blue-600',
      bgColor: 'bg-blue-100',
    },
    {
      title: 'Total Amount',
      value: formatCurrency(summary.totalAmount, summary.currency),
      icon: TrendingUp,
      color: 'text-green-600',
      bgColor: 'bg-green-100',
    },
    {
      title: 'Success Rate',
      value: `${successRate.toFixed(1)}%`,
      icon: TrendingUp,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-100',
      subtitle: `${summary.successfulTransactions} successful`,
    },
    {
      title: 'Failed Transactions',
      value: summary.failedTransactions.toString(),
      icon: AlertTriangle,
      color: 'text-red-600',
      bgColor: 'bg-red-100',
    },
    {
      title: 'Pending Transactions',
      value: summary.pendingTransactions.toString(),
      icon: Clock,
      color: 'text-yellow-600',
      bgColor: 'bg-yellow-100',
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
      {cards.map((card, index) => (
        <div
          key={index}
          className="bg-white overflow-hidden shadow-sm rounded-lg border border-gray-200"
        >
          <div className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className={`p-3 rounded-lg ${card.bgColor}`}>
                  <card.icon className={`h-6 w-6 ${card.color}`} />
                </div>
              </div>
              <div className="ml-4 flex-1">
                <div className="text-sm font-medium text-gray-800">
                  {card.title}
                </div>
                <div className="text-2xl font-semibold text-gray-900">
                  {card.value}
                </div>
                {card.subtitle && (
                  <div className="text-sm text-gray-800">
                    {card.subtitle}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}