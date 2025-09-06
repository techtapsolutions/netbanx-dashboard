import { NextRequest, NextResponse } from 'next/server';
import { ensureWebhookSecretsTable } from '@/lib/db-init';
import { withDatabase } from '@/lib/database';

export async function GET(request: NextRequest) {
  const diagnostics: any = {
    timestamp: new Date().toISOString(),
    environment: {
      NODE_ENV: process.env.NODE_ENV,
      VERCEL: process.env.VERCEL,
      DATABASE_URL: process.env.DATABASE_URL ? 'configured' : 'missing',
      DIRECT_URL: process.env.DIRECT_URL ? 'configured' : 'missing',
    },
    tests: {}
  };

  try {
    // Test 1: Check if we can initialize the table
    console.log('Test 1: Initializing webhook_secrets table...');
    const tableReady = await ensureWebhookSecretsTable();
    diagnostics.tests.tableInitialization = {
      success: tableReady,
      message: tableReady ? 'Table ready' : 'Table initialization failed'
    };

    if (!tableReady) {
      diagnostics.error = 'Table initialization failed';
      return NextResponse.json(diagnostics, { status: 500 });
    }

    // Test 2: Try to connect to database
    console.log('Test 2: Testing database connection...');
    const connectionTest = await withDatabase(async (db) => {
      try {
        // Test basic connection
        const result = await db.$queryRaw`SELECT 1 as test`;
        return { connected: true, result };
      } catch (error: any) {
        return { connected: false, error: error.message };
      }
    });
    diagnostics.tests.databaseConnection = connectionTest;

    // Test 3: Check if webhook_secrets table exists
    console.log('Test 3: Checking webhook_secrets table...');
    const tableCheck = await withDatabase(async (db) => {
      try {
        const tableExists = await db.$queryRaw`
          SELECT EXISTS (
            SELECT FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'webhook_secrets'
          ) as exists
        `;
        return tableExists;
      } catch (error: any) {
        return { error: error.message };
      }
    });
    diagnostics.tests.tableExists = tableCheck;

    // Test 4: Try to query webhook_secrets
    console.log('Test 4: Querying webhook_secrets table...');
    const queryTest = await withDatabase(async (db) => {
      try {
        const count = await db.webhookSecret.count();
        const secrets = await db.webhookSecret.findMany({
          take: 5,
          select: {
            id: true,
            endpoint: true,
            name: true,
            isActive: true,
            createdAt: true
          }
        });
        return { 
          success: true, 
          count,
          secrets: secrets.map(s => ({
            ...s,
            createdAt: s.createdAt.toISOString()
          }))
        };
      } catch (error: any) {
        return { 
          success: false, 
          error: error.message,
          code: error.code 
        };
      }
    });
    diagnostics.tests.queryWebhookSecrets = queryTest;

    // Test 5: Check Prisma schema sync
    console.log('Test 5: Checking Prisma schema...');
    const schemaTest = await withDatabase(async (db) => {
      try {
        // Get all tables from database
        const tables = await db.$queryRaw`
          SELECT table_name 
          FROM information_schema.tables 
          WHERE table_schema = 'public' 
          ORDER BY table_name
        ` as any[];
        
        return {
          success: true,
          tables: tables.map(t => t.table_name),
          hasWebhookSecrets: tables.some(t => t.table_name === 'webhook_secrets')
        };
      } catch (error: any) {
        return { success: false, error: error.message };
      }
    });
    diagnostics.tests.schemaCheck = schemaTest;

    // Overall status
    diagnostics.status = 'success';
    diagnostics.message = 'All tests completed';

    return NextResponse.json(diagnostics);

  } catch (error: any) {
    console.error('Diagnostic error:', error);
    diagnostics.status = 'error';
    diagnostics.error = error.message;
    diagnostics.stack = error.stack;
    
    return NextResponse.json(diagnostics, { status: 500 });
  }
}