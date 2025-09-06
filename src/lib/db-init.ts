import { withDatabase } from '@/lib/database';

// Flag to track if we've attempted initialization
let initializationAttempted = false;
let initializationPromise: Promise<boolean> | null = null;

// Initialize database schema if needed
export async function ensureWebhookSecretsTable(): Promise<boolean> {
  // Return cached result if already attempted
  if (initializationAttempted && !initializationPromise) {
    return true;
  }
  
  // Return ongoing promise if initialization is in progress
  if (initializationPromise) {
    return initializationPromise;
  }
  
  // Start initialization
  initializationPromise = performInitialization();
  return initializationPromise;
}

async function performInitialization(): Promise<boolean> {
  try {
    console.log('🔍 Checking if webhook_secrets table exists...');
    
    return await withDatabase(async (db) => {
      // First, check if table exists using information_schema
      const tableExists = await db.$queryRaw`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'webhook_secrets'
        )
      ` as [{ exists: boolean }];
      
      if (tableExists[0]?.exists) {
        console.log('✅ webhook_secrets table already exists');
        // Test that we can actually use the table
        await db.webhookSecret.findMany({ take: 1 });
        console.log('✅ webhook_secrets table is accessible');
        initializationAttempted = true;
        initializationPromise = null;
        return true;
      }
      
      console.log('📝 webhook_secrets table does not exist, creating...');
      
      // Create the table using raw SQL with explicit SQL commands
      console.log('Creating webhook_secrets table...');
      await db.$executeRaw`
        CREATE TABLE "webhook_secrets" (
          "id" TEXT NOT NULL,
          "endpoint" TEXT NOT NULL,
          "name" TEXT NOT NULL,
          "description" TEXT,
          "encryptedKey" TEXT NOT NULL,
          "algorithm" TEXT NOT NULL DEFAULT 'sha256',
          "keyVersion" INTEGER NOT NULL DEFAULT 1,
          "isActive" BOOLEAN NOT NULL DEFAULT true,
          "companyId" TEXT,
          "lastUsedAt" TIMESTAMP(3),
          "usageCount" INTEGER NOT NULL DEFAULT 0,
          "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "createdBy" TEXT,
          CONSTRAINT "webhook_secrets_pkey" PRIMARY KEY ("id")
        )
      `;
      
      console.log('Creating unique index on endpoint...');
      await db.$executeRaw`
        CREATE UNIQUE INDEX "webhook_secrets_endpoint_key" 
        ON "webhook_secrets"("endpoint")
      `;
      
      console.log('Creating performance indexes...');
      await db.$executeRaw`
        CREATE INDEX "webhook_secrets_endpoint_idx" 
        ON "webhook_secrets"("endpoint")
      `;
      
      await db.$executeRaw`
        CREATE INDEX "webhook_secrets_companyId_idx" 
        ON "webhook_secrets"("companyId")
      `;
      
      await db.$executeRaw`
        CREATE INDEX "webhook_secrets_isActive_idx" 
        ON "webhook_secrets"("isActive")
      `;
      
      // Try to add foreign key constraint (may fail if companies table doesn't exist)
      try {
        console.log('Adding foreign key constraint...');
        await db.$executeRaw`
          ALTER TABLE "webhook_secrets" 
          ADD CONSTRAINT "webhook_secrets_companyId_fkey" 
          FOREIGN KEY ("companyId") REFERENCES "companies"("id") 
          ON DELETE SET NULL ON UPDATE CASCADE
        `;
        console.log('✅ Foreign key constraint added');
      } catch (fkError: any) {
        console.log('⚠️ Could not add foreign key constraint:', fkError.message);
        // This is expected if companies table doesn't exist - not a critical error
      }
      
      console.log('✅ webhook_secrets table created successfully');
      
      // Test that we can now use the table with Prisma
      await db.webhookSecret.findMany({ take: 1 });
      console.log('✅ Table is accessible via Prisma');
      
      initializationAttempted = true;
      initializationPromise = null;
      return true;
    });
    
  } catch (error: any) {
    console.error('❌ Database initialization failed:', error.message);
    console.error('Full error:', error);
    initializationAttempted = true;
    initializationPromise = null;
    return false;
  }
}