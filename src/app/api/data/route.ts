import { NextRequest, NextResponse } from 'next/server';
import { webhookStore } from '@/lib/webhook-store';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'transactions';
    
    switch (type) {
      case 'transactions':
        // Use async methods for database-backed data
        const transactions = await webhookStore.getTransactionsAsync();
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
        
      case 'webhooks':
        const limit = parseInt(searchParams.get('limit') || '50');
        // Use async methods for database-backed data
        const events = await webhookStore.getWebhookEventsAsync(limit);
        const stats = await webhookStore.getWebhookStatsAsync();
        
        return NextResponse.json({
          success: true,
          events,
          stats,
        });
        
      case 'stats':
        return NextResponse.json({
          success: true,
          stats: await webhookStore.getWebhookStatsAsync(),
        });
        
      default:
        return NextResponse.json(
          { error: 'Invalid data type. Use: transactions, webhooks, or stats' },
          { status: 400 }
        );
    }
    
  } catch (error) {
    console.error('Error fetching data:', error);
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