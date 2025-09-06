import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { ensureWebhookSecretsTable } from '@/lib/db-init';

export async function GET(request: NextRequest) {
  try {
    console.log('🔍 Testing database connection...');
    
    // Test basic database connection
    const result = await db.$queryRaw`SELECT 1 as test`;
    console.log('✅ Basic database query successful:', result);
    
    // Test webhook secrets table initialization
    console.log('🔍 Testing webhook secrets table initialization...');
    const tableReady = await ensureWebhookSecretsTable();
    console.log('📋 Table initialization result:', tableReady);
    
    if (tableReady) {
      // Try to query the table
      const secrets = await db.webhookSecret.findMany({ take: 1 });
      console.log('✅ Successfully queried webhook_secrets table, found:', secrets.length, 'records');
    }
    
    return NextResponse.json({
      success: true,
      databaseConnected: true,
      tableReady,
      message: 'Database test completed successfully'
    });
    
  } catch (error: any) {
    console.error('❌ Database test failed:', error);
    
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}