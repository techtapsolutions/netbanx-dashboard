import { NextRequest, NextResponse } from 'next/server';
import { webhookStore } from '@/lib/webhook-store';
import { Transaction } from '@/types/paysafe';
import { WebhookEvent } from '@/types/webhook';

export async function GET(request: NextRequest) {
  try {
    console.log('📊 Data API called');
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'transactions';
    console.log('📋 Data type requested:', type);
    
    switch (type) {
      case 'transactions':
        try {
          console.log('💳 Fetching transactions from database...');
          // Use async methods for database-backed data with timeout
          const transactions = await Promise.race([
            webhookStore.getTransactionsAsync(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Database timeout')), 10000)
            )
          ]) as Transaction[];
          
          console.log('✅ Transactions fetched:', transactions.length);
          
          const summary = {
            totalTransactions: transactions.length,
            totalAmount: transactions.reduce((sum, t) => sum + t.amount, 0),
            successfulTransactions: transactions.filter(t => t.status === 'COMPLETED').length,
            failedTransactions: transactions.filter(t => t.status === 'FAILED').length,
            pendingTransactions: transactions.filter(t => t.status === 'PENDING').length,
            currency: 'USD',
            period: 'Real-time data from database',
          };
          
          return NextResponse.json({
            success: true,
            transactions,
            summary,
          });
        } catch (dbError) {
          console.warn('⚠️ Database error, returning empty transactions:', dbError);
          // Fallback to empty data if database fails
          const emptyTransactions: Transaction[] = [];
          const emptySummary = {
            totalTransactions: 0,
            totalAmount: 0,
            successfulTransactions: 0,
            failedTransactions: 0,
            pendingTransactions: 0,
            currency: 'USD',
            period: 'No data available (database initializing)',
          };
          
          return NextResponse.json({
            success: true,
            transactions: emptyTransactions,
            summary: emptySummary,
            warning: 'Database is initializing, showing empty data',
          });
        }
        
      case 'webhooks':
        try {
          console.log('🔄 Fetching webhooks from database...');
          const limit = parseInt(searchParams.get('limit') || '50');
          // Use async methods for database-backed data with timeout
          const events = await Promise.race([
            webhookStore.getWebhookEventsAsync(limit),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Database timeout')), 10000)
            )
          ]) as WebhookEvent[];
          
          const stats = await Promise.race([
            webhookStore.getWebhookStatsAsync(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Stats timeout')), 5000)
            )
          ]) as any;
          
          console.log('✅ Webhooks fetched:', events.length);
          
          return NextResponse.json({
            success: true,
            events,
            stats,
          });
        } catch (dbError) {
          console.warn('⚠️ Database error, returning empty webhooks:', dbError);
          // Fallback to empty data if database fails
          return NextResponse.json({
            success: true,
            events: [],
            stats: {
              totalReceived: 0,
              totalProcessed: 0,
              totalFailed: 0,
              avgProcessingTime: 0,
              lastProcessed: null,
            },
            warning: 'Database is initializing, showing empty data',
          });
        }
        
      case 'stats':
        try {
          console.log('📈 Fetching stats from database...');
          const stats = await Promise.race([
            webhookStore.getWebhookStatsAsync(),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Stats timeout')), 5000)
            )
          ]);
          
          return NextResponse.json({
            success: true,
            stats,
          });
        } catch (dbError) {
          console.warn('⚠️ Database error, returning empty stats:', dbError);
          return NextResponse.json({
            success: true,
            stats: {
              totalReceived: 0,
              totalProcessed: 0,
              totalFailed: 0,
              avgProcessingTime: 0,
              lastProcessed: null,
            },
            warning: 'Database is initializing, showing empty data',
          });
        }
        
      default:
        return NextResponse.json(
          { error: 'Invalid data type. Use: transactions, webhooks, or stats' },
          { status: 400 }
        );
    }
    
  } catch (error) {
    console.error('❌ Critical error in data API:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return NextResponse.json(
      { 
        error: 'Failed to fetch data', 
        details: errorMessage,
        success: false 
      },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    // Use async method for database-backed clearing
    await webhookStore.clearDataAsync();
    
    return NextResponse.json({
      success: true,
      message: 'All webhook data cleared from database',
    });
    
  } catch (error) {
    console.error('Error clearing data:', error);
    return NextResponse.json(
      { error: 'Failed to clear data' },
      { status: 500 }
    );
  }
}