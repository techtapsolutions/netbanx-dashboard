import { db } from '@/lib/database';

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
    
    // Try a simple query to see if the table exists
    await db.webhookSecret.findMany({ take: 1 });
    
    console.log('✅ webhook_secrets table exists and is accessible');
    initializationAttempted = true;
    initializationPromise = null;
    return true;
    
  } catch (error: any) {
    console.log('📝 webhook_secrets table may not exist, attempting to create...');
    
    try {
      // Create the table using raw SQL
      await db.$executeRaw`
        CREATE TABLE IF NOT EXISTS "webhook_secrets" (
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
      
      // Create unique index
      await db.$executeRaw`
        CREATE UNIQUE INDEX IF NOT EXISTS "webhook_secrets_endpoint_key" 
        ON "webhook_secrets"("endpoint")
      `;
      
      // Create performance indexes
      await db.$executeRaw`
        CREATE INDEX IF NOT EXISTS "webhook_secrets_endpoint_idx" 
        ON "webhook_secrets"("endpoint")
      `;
      
      await db.$executeRaw`
        CREATE INDEX IF NOT EXISTS "webhook_secrets_companyId_idx" 
        ON "webhook_secrets"("companyId")
      `;
      
      await db.$executeRaw`
        CREATE INDEX IF NOT EXISTS "webhook_secrets_isActive_idx" 
        ON "webhook_secrets"("isActive")
      `;
      
      // Try to add foreign key constraint (may fail if companies table doesn't exist)
      try {
        await db.$executeRaw`
          ALTER TABLE "webhook_secrets" 
          ADD CONSTRAINT "webhook_secrets_companyId_fkey" 
          FOREIGN KEY ("companyId") REFERENCES "companies"("id") 
          ON DELETE SET NULL ON UPDATE CASCADE
        `;
      } catch (fkError) {
        console.log('⚠️ Could not add foreign key constraint (companies table may not exist)');
      }
      
      console.log('✅ webhook_secrets table created successfully');
      
      // Test that we can now use the table
      await db.webhookSecret.findMany({ take: 1 });
      
      initializationAttempted = true;
      initializationPromise = null;
      return true;
      
    } catch (createError: any) {
      console.error('❌ Failed to create webhook_secrets table:', createError.message);
      initializationAttempted = true;
      initializationPromise = null;
      return false;
    }
  }
}