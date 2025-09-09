'use client';

import { Transaction } from '@/types/paysafe';
import { formatCurrency } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { format, parseISO, startOfDay } from 'date-fns';

interface ChartsProps {
  transactions: Transaction[];
}

export function Charts({ transactions }: ChartsProps) {
  const statusData = [
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
  ].filter(item => item.value > 0);

  const paymentMethodData = transactions.reduce((acc, transaction) => {
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

  const dailyTransactions = transactions.reduce((acc, transaction) => {
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

  dailyTransactions.sort((a, b) => new Date(a.day + ', 2024').getTime() - new Date(b.day + ', 2024').getTime());

  const CustomTooltip = ({ active, payload, label }: any) => {
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
  };

  return (
    <>
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

      {dailyTransactions.length > 0 && (
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
                <Line yAxisId="left" type="monotone" dataKey="count" stroke="#10B981" strokeWidth={2} name="Transaction Count" />
                <Line yAxisId="right" type="monotone" dataKey="amount" stroke="#F59E0B" strokeWidth={2} name="Amount" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </>
  );
}