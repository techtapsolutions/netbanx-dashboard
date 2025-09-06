import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/database';
import { ensureWebhookSecretsTable } from '@/lib/db-init';

export async function GET(request: NextRequest) {
  const testResults: any = {
    databaseConnection: false,
    tableExists: false,
    tableCreated: false,
    prismaAccess: false,
    error: null
  };

  try {
    console.log('🔍 Step 1: Testing basic database connection...');
    
    // Test basic database connection
    const result = await db.$queryRaw`SELECT 1 as test`;
    console.log('✅ Basic database query successful:', result);
    testResults.databaseConnection = true;
    
    console.log('🔍 Step 2: Checking if webhook_secrets table exists...');
    
    // Check if table exists
    const tableExists = await db.$queryRaw`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'webhook_secrets'
      )
    ` as [{ exists: boolean }];
    
    testResults.tableExists = tableExists[0]?.exists || false;
    console.log('📋 Table exists:', testResults.tableExists);
    
    console.log('🔍 Step 3: Running table initialization...');
    const tableReady = await ensureWebhookSecretsTable();
    console.log('📋 Table initialization result:', tableReady);
    testResults.tableCreated = tableReady;
    
    if (tableReady) {
      console.log('🔍 Step 4: Testing Prisma access to table...');
      // Try to query the table
      const secrets = await db.webhookSecret.findMany({ take: 1 });
      console.log('✅ Successfully queried webhook_secrets table, found:', secrets.length, 'records');
      testResults.prismaAccess = true;
    }
    
    return NextResponse.json({
      success: true,
      message: 'Database test completed successfully',
      results: testResults
    });
    
  } catch (error: any) {
    console.error('❌ Database test failed at step:', error.message);
    console.error('Full error:', error);
    
    testResults.error = error.message;
    
    return NextResponse.json({
      success: false,
      error: error.message,
      results: testResults,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 });
  }
}