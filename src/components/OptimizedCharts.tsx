'use client';

import { memo, useMemo, lazy, Suspense } from 'react';
import { Transaction } from '@/types/paysafe';
import { formatCurrency } from '@/lib/utils';
import { format, parseISO, startOfDay } from 'date-fns';
import dynamic from 'next/dynamic';

// Dynamically import heavy chart components with no SSR
const ResponsiveContainer = dynamic(
  () => import('recharts').then(mod => mod.ResponsiveContainer),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-gray-100" /> }
);

const PieChart = dynamic(
  () => import('recharts').then(mod => mod.PieChart),
  { ssr: false }
);

const Pie = dynamic(
  () => import('recharts').then(mod => mod.Pie),
  { ssr: false }
);

const Cell = dynamic(
  () => import('recharts').then(mod => mod.Cell),
  { ssr: false }
);

const BarChart = dynamic(
  () => import('recharts').then(mod => mod.BarChart),
  { ssr: false }
);

const Bar = dynamic(
  () => import('recharts').then(mod => mod.Bar),
  { ssr: false }
);

const LineChart = dynamic(
  () => import('recharts').then(mod => mod.LineChart),
  { ssr: false }
);

const Line = dynamic(
  () => import('recharts').then(mod => mod.Line),
  { ssr: false }
);

const XAxis = dynamic(
  () => import('recharts').then(mod => mod.XAxis),
  { ssr: false }
);

const YAxis = dynamic(
  () => import('recharts').then(mod => mod.YAxis),
  { ssr: false }
);

const CartesianGrid = dynamic(
  () => import('recharts').then(mod => mod.CartesianGrid),
  { ssr: false }
);

const Tooltip = dynamic(
  () => import('recharts').then(mod => mod.Tooltip),
  { ssr: false }
);

interface ChartsProps {
  transactions: Transaction[];
}

// Memoized custom tooltip component
const CustomTooltip = memo(({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
        <p className="font-medium text-gray-900">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-sm font-medium" style={{ color: entry.color }}>
            {entry.dataKey === 'amount' ? formatCurrency(entry.value) : entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
});

CustomTooltip.displayName = 'CustomTooltip';

// Individual chart components with memoization
const StatusChart = memo(({ statusData }: { statusData: any[] }) => (
  <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
    <h3 className="text-lg font-medium text-gray-900 mb-4">Transaction Status Distribution</h3>
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={statusData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={({ name, value }) => `${name}: ${value}`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {statusData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  </div>
));

StatusChart.displayName = 'StatusChart';

const PaymentMethodChart = memo(({ paymentMethodData }: { paymentMethodData: any[] }) => (
  <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
    <h3 className="text-lg font-medium text-gray-900 mb-4">Payment Methods</h3>
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={paymentMethodData}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" />
          <YAxis />
          <Tooltip content={<CustomTooltip />} />
          <Bar dataKey="value" fill="#3B82F6" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  </div>
));

PaymentMethodChart.displayName = 'PaymentMethodChart';

const DailyVolumeChart = memo(({ dailyTransactions }: { dailyTransactions: any[] }) => {
  if (dailyTransactions.length === 0) return null;
  
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200 lg:col-span-2">
      <h3 className="text-lg font-medium text-gray-900 mb-4">Daily Transaction Volume</h3>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={dailyTransactions}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="day" />
            <YAxis yAxisId="left" />
            <YAxis yAxisId="right" orientation="right" />
            <Tooltip content={<CustomTooltip />} />
            <Bar yAxisId="left" dataKey="count" fill="#10B981" name="Transaction Count" />
            <Line yAxisId="right" type="monotone" dataKey="amount" stroke="#F59E0B" strokeWidth={2} name="Amount" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

DailyVolumeChart.displayName = 'DailyVolumeChart';

export const OptimizedCharts = memo(function OptimizedCharts({ transactions }: ChartsProps) {
  // Memoize expensive calculations
  const statusData = useMemo(() => {
    const data = [
      {
        name: 'Completed',
        value: transactions.filter(t => t.status === 'COMPLETED').length,
        color: '#10B981'
      },
      {
        name: 'Pending',
        value: transactions.filter(t => t.status === 'PENDING').length,
        color: '#F59E0B'
      },
      {
        name: 'Failed',
        value: transactions.filter(t => t.status === 'FAILED').length,
        color: '#EF4444'
      },
      {
        name: 'Cancelled',
        value: transactions.filter(t => t.status === 'CANCELLED').length,
        color: '#6B7280'
      }
    ];
    return data.filter(item => item.value > 0);
  }, [transactions]);

  const paymentMethodData = useMemo(() => {
    return transactions.reduce((acc, transaction) => {
      const method = transaction.paymentMethod || 'Unknown';
      const existing = acc.find(item => item.name === method);
      if (existing) {
        existing.value += 1;
        existing.amount += transaction.amount;
      } else {
        acc.push({
          name: method,
          value: 1,
          amount: transaction.amount
        });
      }
      return acc;
    }, [] as { name: string; value: number; amount: number }[]);
  }, [transactions]);

  const dailyTransactions = useMemo(() => {
    const data = transactions.reduce((acc, transaction) => {
      const day = format(startOfDay(parseISO(transaction.createdAt)), 'MMM dd');
      const existing = acc.find(item => item.day === day);
      
      if (existing) {
        existing.count += 1;
        existing.amount += transaction.amount;
      } else {
        acc.push({
          day,
          count: 1,
          amount: transaction.amount
        });
      }
      return acc;
    }, [] as { day: string; count: number; amount: number }[]);

    return data.sort((a, b) => 
      new Date(a.day + ', 2024').getTime() - new Date(b.day + ', 2024').getTime()
    );
  }, [transactions]);

  return (
    <>
      <StatusChart statusData={statusData} />
      <PaymentMethodChart paymentMethodData={paymentMethodData} />
      <DailyVolumeChart dailyTransactions={dailyTransactions} />
    </>
  );
});