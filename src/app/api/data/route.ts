import { NextRequest, NextResponse } from 'next/server';
import { webhookStore } from '@/lib/webhook-store';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'transactions';
    
    switch (type) {
      case 'transactions':
        const transactions = webhookStore.getTransactions();
        const summary = {
          totalTransactions: transactions.length,
          totalAmount: transactions.reduce((sum, t) => sum + t.amount, 0),
          successfulTransactions: transactions.filter(t => t.status === 'COMPLETED').length,
          failedTransactions: transactions.filter(t => t.status === 'FAILED').length,
          pendingTransactions: transactions.filter(t => t.status === 'PENDING').length,
          currency: 'USD',
          period: 'Real-time data from webhooks',
        };
        
        return NextResponse.json({
          success: true,
          transactions,
          summary,
        });
        
      case 'webhooks':
        const limit = parseInt(searchParams.get('limit') || '50');
        const events = webhookStore.getWebhookEvents(limit);
        const stats = webhookStore.getWebhookStats();
        
        return NextResponse.json({
          success: true,
          events,
          stats,
        });
        
      case 'stats':
        return NextResponse.json({
          success: true,
          stats: webhookStore.getWebhookStats(),
        });
        
      default:
        return NextResponse.json(
          { error: 'Invalid data type. Use: transactions, webhooks, or stats' },
          { status: 400 }
        );
    }
    
  } catch (error) {
    console.error('Error fetching data:', error);
    return NextResponse.json(
      { error: 'Failed to fetch data' },
      { status: 500 }
    );
  }
}

export async function DELETE() {
  try {
    webhookStore.clearData();
    
    return NextResponse.json({
      success: true,
      message: 'All webhook data cleared',
    });
    
  } catch (error) {
    console.error('Error clearing data:', error);
    return NextResponse.json(
      { error: 'Failed to clear data' },
      { status: 500 }
    );
  }
}